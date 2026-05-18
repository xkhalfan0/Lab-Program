/**
 * SteelAnchorBolt — Anchor Bolt Pull-out / Tensile Test
 * Standards: ASTM E488 / BS 8539
 *
 * Test Types:
 *   - Pull-out test (direct tension)
 *   - Torque test (installation torque verification)
 *
 * Acceptance: Load ≥ minimum specified pull-out load
 */
import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { PassFailBadge, ResultBanner } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, Info, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

import { useLanguage } from "@/contexts/LanguageContext";
// ─── Anchor Bolt Types & Specs ───────────────────────────────────────────────
const ANCHOR_TYPES = {
  "M12": { label: "M12 Anchor Bolt", nominalDia: 12, minPullout: 25, unit: "kN" },
  "M16": { label: "M16 Anchor Bolt", nominalDia: 16, minPullout: 45, unit: "kN" },
  "M20": { label: "M20 Anchor Bolt", nominalDia: 20, minPullout: 70, unit: "kN" },
  "M24": { label: "M24 Anchor Bolt", nominalDia: 24, minPullout: 100, unit: "kN" },
  "M30": { label: "M30 Anchor Bolt", nominalDia: 30, minPullout: 160, unit: "kN" },
  "CUSTOM": { label: "Custom / Specified Load", nominalDia: 0, minPullout: 0, unit: "kN" },
};

type AnchorType = keyof typeof ANCHOR_TYPES;

interface AnchorRow {
  id: string;
  anchorNo: string;
  location: string;
  embedDepth: string;   // mm
  maxLoad: string;      // kN
  failureMode: string;  // "pullout" | "concrete_cone" | "splitting" | "no_failure"
  // computed
  result?: "pass" | "fail" | "pending";
}

function newRow(index: number): AnchorRow {
  return {
    id: `anc_${Date.now()}_${index}`,
    anchorNo: `A${index + 1}`,
    location: "",
    embedDepth: "",
    maxLoad: "",
    failureMode: "no_failure",
  };
}

function computeRow(row: AnchorRow, minLoad: number): AnchorRow {
  const load = parseFloat(row.maxLoad);
  if (!load) return { ...row, result: "pending" };
  return { ...row, result: load >= minLoad ? "pass" : "fail" };
}

export default function SteelAnchorBolt() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const { user } = useAuth();
  const distId = parseInt(distributionId || "0", 10);

  const [anchorType, setAnchorType] = useState<AnchorType>("M20");
  const [customMinLoad, setCustomMinLoad] = useState("50");
  const [rows, setRows] = useState<AnchorRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [concreteGrade, setConcreteGrade] = useState("C25");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: !!distId }
  );

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ نتائج أنكر بولت بنجاح");
      setSubmitted(true);
      redirectAfterTestSave(setLocation, distribution);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const spec = ANCHOR_TYPES[anchorType];
  const minLoad = anchorType === "CUSTOM" ? parseFloat(customMinLoad) || 0 : spec.minPullout;
  const computed = rows.map(r => computeRow(r, minLoad));
  const validRows = computed.filter(r => r.result !== undefined && r.maxLoad !== "");
  const passAll = validRows.length > 0 && validRows.every(r => r.result === "pass");
  const avgLoad = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (parseFloat(r.maxLoad) || 0), 0) / validRows.length).toFixed(1))
    : undefined;

  const updateRow = useCallback((id: string, field: keyof AnchorRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const handleSubmit = () => {
    if (!distribution?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (!distributionId) return;
    saveMut.mutate({
      distributionId: distId,
      sampleId: distribution.sampleId,
      testTypeCode: `STEEL_ANCHOR_${anchorType}`,
      formTemplate: "steel_anchor_bolt",
      formData: { anchorType, minLoad, concreteGrade, anchors: computed, avgLoad, passAll },
      overallResult: passAll ? "pass" : "fail",
      notes,
      status: "submitted",
    });
  };

  if (!distId || distId === 0) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="text-center text-red-600">
            {lang === "ar" ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container max-w-4xl py-6 space-y-6">
        <SampleInfoCard
          dist={distribution}
          extraFields={[
            { label: "Diameter / القطر", value: distribution?.testSubType ? `${distribution.testSubType} mm` : null },
          ]}
        />
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-orange-500" />
              اختبار سحب أنكر بولت — Anchor Bolt Pull-out Test
            </h1>
            <p className="text-muted-foreground text-sm mt-1">ASTM E488 / BS 8539</p>
          </div>
          {distribution && (
            <Badge variant="outline">{distribution.distributionCode} — {distribution.testName}</Badge>
          )}
        </div>

        {/* Settings */}
        <Card>
          <CardHeader><CardTitle className="text-base">إعدادات الاختبار</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>نوع الأنكر بولت</Label>
              <Select value={anchorType} onValueChange={v => setAnchorType(v as AnchorType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ANCHOR_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {anchorType === "CUSTOM" ? (
              <div>
                <Label>الحمل الأدنى المطلوب (kN)</Label>
                <Input value={customMinLoad} onChange={e => setCustomMinLoad(e.target.value)} type="number" min="0" />
              </div>
            ) : (
              <div className="bg-muted rounded-lg p-3 text-sm">
                <div className="grid grid-cols-2 gap-x-3">
                  <span className="text-muted-foreground">القطر الاسمي:</span>
                  <span className="font-mono font-bold">{spec.nominalDia} mm</span>
                  <span className="text-muted-foreground">الحمل الأدنى:</span>
                  <span className="font-mono font-bold">{spec.minPullout} kN</span>
                </div>
              </div>
            )}
            <div>
              <Label>درجة الخرسانة المضيفة</Label>
              <Select value={concreteGrade} onValueChange={setConcreteGrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["C20","C25","C30","C35","C40","C45","C50"].map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="pt-4">
            <div className="flex gap-2 text-sm text-orange-700 dark:text-orange-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                القبول: الحمل المقاس ≥ {minLoad} kN | أوضاع الفشل: سحب مباشر (pullout)، مخروط خرساني (concrete cone)، انشقاق (splitting)، بدون فشل (no failure)
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">جدول نتائج السحب</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setRows(p => [...p, newRow(p.length)])}>
                <Plus className="h-4 w-4 mr-1" /> إضافة أنكر
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted text-center">
                    <th className="border px-3 py-2">رقم الأنكر</th>
                    <th className="border px-3 py-2">الموقع</th>
                    <th className="border px-3 py-2">عمق التثبيت (mm)</th>
                    <th className="border px-3 py-2">الحمل الأقصى (kN)</th>
                    <th className="border px-3 py-2">وضع الفشل</th>
                    <th className="border px-3 py-2">النتيجة</th>
                    <th className="border px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {computed.map(row => (
                    <tr key={row.id} className="text-center hover:bg-muted/30">
                      <td className="border px-1 py-1">
                        <Input value={row.anchorNo} onChange={e => updateRow(row.id, "anchorNo", e.target.value)} className="h-7 text-center w-16 mx-auto" />
                      </td>
                      <td className="border px-1 py-1">
                        <Input value={row.location} onChange={e => updateRow(row.id, "location", e.target.value)} className="h-7 text-center w-32 mx-auto" placeholder="e.g. Grid A-1" />
                      </td>
                      <td className="border px-1 py-1">
                        <Input value={row.embedDepth} onChange={e => updateRow(row.id, "embedDepth", e.target.value)} className="h-7 text-center w-20 mx-auto" type="number" min="0" />
                      </td>
                      <td className="border px-1 py-1">
                        <Input value={row.maxLoad} onChange={e => updateRow(row.id, "maxLoad", e.target.value)} className="h-7 text-center w-20 mx-auto" type="number" min="0" />
                      </td>
                      <td className="border px-1 py-1">
                        <Select value={row.failureMode} onValueChange={v => updateRow(row.id, "failureMode", v)}>
                          <SelectTrigger className="h-7 text-xs w-36 mx-auto"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no_failure">No Failure</SelectItem>
                            <SelectItem value="pullout">Pull-out</SelectItem>
                            <SelectItem value="concrete_cone">Concrete Cone</SelectItem>
                            <SelectItem value="splitting">Splitting</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="border px-2 py-1">
                        {row.result && row.result !== "pending"
                          ? <PassFailBadge result={row.result} size="sm" />
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="border px-1 py-1">
                        {rows.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setRows(p => p.filter(r => r.id !== row.id))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {validRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 font-semibold text-center">
                      <td colSpan={3} className="border px-3 py-2 text-right">المتوسط</td>
                      <td className="border px-3 py-2 font-mono">{avgLoad?.toFixed(1)} kN</td>
                      <td className="border px-3 py-2"></td>
                      <td className="border px-3 py-2" colSpan={2}>
                        <PassFailBadge result={passAll ? "pass" : "fail"} />
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Overall Result */}
        {validRows.length > 0 && (
          <ResultBanner
            result={passAll ? "pass" : "fail"}
            testName={`Anchor Bolt Pull-out — ${anchorType}`}
            standard="ASTM E488 / BS 8539"
          />
        )}

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">ملاحظات</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          {submitted && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> طباعة التقرير
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={saveMut.isPending || submitted}
            className="min-w-32 bg-blue-600 hover:bg-blue-700"
          >
            <Send className="h-4 w-4 mr-2" />
            {saveMut.isPending ? "جاري الحفظ..." : submitted ? "تم الحفظ ✓" : "تأكيد النتائج"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
