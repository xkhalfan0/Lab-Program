/**
 * AsphaltSprayRate — Bituminous Spray Rate Test
 * Standard: JKR Specification / BS 594-1
 *
 * Test Types:
 *   - Tack Coat (SS-1, SS-1h, CRS-1): 0.2–0.5 L/m²
 *   - Prime Coat (MC-30, MC-70, MC-250): 0.5–1.5 L/m²
 *
 * Method: Weigh spray pads (300×300mm) before and after spraying
 * Spray Rate (L/m²) = (Mass after − Mass before) / (Area × Density)
 */
import { useState, useCallback, useEffect } from "react";
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
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Bituminous Material Specs ────────────────────────────────────────────────
const MATERIAL_SPECS: Record<string, {
  labelAr: string;
  labelEn: string;
  type: "tack" | "prime";
  density: number;   // kg/L at application temp
  minRate: number;   // L/m²
  maxRate: number;   // L/m²
  standard: string;
}> = {
  "SS1": {
    labelAr: "SS-1 (طبقة لاصقة)", labelEn: "SS-1 (Tack Coat)",
    type: "tack",
    density: 1.01,
    minRate: 0.20, maxRate: 0.50,
    standard: "JKR Spec / BS 594-1",
  },
  "SS1H": {
    labelAr: "SS-1h (طبقة لاصقة)", labelEn: "SS-1h (Tack Coat)",
    type: "tack",
    density: 1.01,
    minRate: 0.20, maxRate: 0.50,
    standard: "JKR Spec / BS 594-1",
  },
  "CRS1": {
    labelAr: "CRS-1 (طبقة لاصقة)", labelEn: "CRS-1 (Tack Coat)",
    type: "tack",
    density: 1.02,
    minRate: 0.20, maxRate: 0.50,
    standard: "JKR Spec",
  },
  "MC30": {
    labelAr: "MC-30 (طبقة أولية)", labelEn: "MC-30 (Prime Coat)",
    type: "prime",
    density: 0.88,
    minRate: 0.50, maxRate: 1.50,
    standard: "JKR Spec / ASTM D2027",
  },
  "MC70": {
    labelAr: "MC-70 (طبقة أولية)", labelEn: "MC-70 (Prime Coat)",
    type: "prime",
    density: 0.90,
    minRate: 0.50, maxRate: 1.50,
    standard: "JKR Spec / ASTM D2027",
  },
  "MC250": {
    labelAr: "MC-250 (طبقة أولية)", labelEn: "MC-250 (Prime Coat)",
    type: "prime",
    density: 0.92,
    minRate: 0.50, maxRate: 1.50,
    standard: "JKR Spec / ASTM D2027",
  },
  "CUSTOM": {
    labelAr: "مخصص / محدد", labelEn: "Custom / Specified",
    type: "tack",
    density: 1.0,
    minRate: 0, maxRate: 99,
    standard: "Project Specification",
  },
};

type MaterialKey = keyof typeof MATERIAL_SPECS;

interface PadRow {
  id: string;
  padNo: string;
  location: string;
  padArea: string;      // m² (default 0.09 = 300×300mm)
  massBefore: string;   // g
  massAfter: string;    // g
  // computed
  massGained?: number;  // g
  sprayRate?: number;   // L/m²
  result?: "pass" | "fail" | "pending";
}

function newPad(index: number): PadRow {
  return {
    id: `pad_${Date.now()}_${index}`,
    padNo: `P${index + 1}`,
    location: "",
    padArea: "0.09",
    massBefore: "",
    massAfter: "",
  };
}

function computePad(row: PadRow, density: number, minRate: number, maxRate: number): PadRow {
  const area = parseFloat(row.padArea) || 0.09;
  const before = parseFloat(row.massBefore);
  const after = parseFloat(row.massAfter);
  if (!before || !after || after <= before) return { ...row, result: "pending" };
  const massGained = parseFloat((after - before).toFixed(2));
  // Convert g to kg, then kg to L using density
  const sprayRate = parseFloat(((massGained / 1000) / density / area).toFixed(3));
  const result: "pass" | "fail" = sprayRate >= minRate && sprayRate <= maxRate ? "pass" : "fail";
  return { ...row, massGained, sprayRate, result };
}

export default function AsphaltSprayRate() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId || "0", 10);

  const { lang } = useLanguage();
  const ar = lang === "ar";

  const [material, setMaterial] = useState<MaterialKey>("SS1");
  const [customMin, setCustomMin] = useState("0.2");
  const [customMax, setCustomMax] = useState("0.5");
  const [customDensity, setCustomDensity] = useState("1.0");
  const [rows, setRows] = useState<PadRow[]>([newPad(0), newPad(1), newPad(2)]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: distribution } = trpc.distributions.get.useQuery(
    { id: distId },
    { enabled: !!distId }
  );

  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId }
  );

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as Record<string, unknown>;
    const mat = fd.material as MaterialKey | undefined;
    if (mat && mat in MATERIAL_SPECS) setMaterial(mat);
    if (fd.customMin != null) setCustomMin(String(fd.customMin));
    if (fd.customMax != null) setCustomMax(String(fd.customMax));
    if (fd.customDensity != null) setCustomDensity(String(fd.customDensity));
    if (Array.isArray(fd.pads)) {
      setRows(
        (fd.pads as PadRow[]).map((p, i) => ({
          id: p.id || `pad_${i}`,
          padNo: p.padNo ?? `P${i + 1}`,
          location: p.location ?? "",
          padArea: p.padArea != null ? String(p.padArea) : "0.09",
          massBefore: p.massBefore != null ? String(p.massBefore) : "",
          massAfter: p.massAfter != null ? String(p.massAfter) : "",
        }))
      );
    }
    if (typeof fd.notes === "string") setNotes(fd.notes);
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const saveMut = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        redirectAfterTestSave(setLocation, distribution);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (err: { message: string }) => toast.error(ar ? "خطأ: " + err.message : "Error: " + err.message),
  });

  const spec = MATERIAL_SPECS[material];
  const density = material === "CUSTOM" ? parseFloat(customDensity) || 1.0 : spec.density;
  const minRate = material === "CUSTOM" ? parseFloat(customMin) || 0 : spec.minRate;
  const maxRate = material === "CUSTOM" ? parseFloat(customMax) || 99 : spec.maxRate;

  const computed = rows.map(r => computePad(r, density, minRate, maxRate));
  const validRows = computed.filter(r => r.sprayRate !== undefined);
  const passAll = validRows.length > 0 && validRows.every(r => r.result === "pass");
  const avgRate = validRows.length > 0
    ? parseFloat((validRows.reduce((s, r) => s + (r.sprayRate || 0), 0) / validRows.length).toFixed(3))
    : undefined;

  const updateRow = useCallback((id: string, field: keyof PadRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }, []);

  const resolvedTestTypeCode =
    distribution?.testType && String(distribution.testType).startsWith("ASPH_SPRAY")
      ? distribution.testType
      : "ASPH_SPRAY";

  const handleSave = async (status: "draft" | "submitted") => {
    if (!distId) {
      toast.error(ar ? "معرّف التوزيع غير صالح" : "Invalid distribution");
      return;
    }
    const sampleId = distribution?.sampleId;
    if (!sampleId) {
      toast.error(ar ? "تعذر تحديد العينة. أعد تحميل الصفحة." : "Could not resolve sample. Please reload.");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال قراءة صينية واحدة على الأقل" : "Please enter at least one pad reading");
      return;
    }
    setSaving(true);
    try {
      await saveMut.mutateAsync({
        distributionId: distId,
        sampleId,
        testTypeCode: resolvedTestTypeCode,
        formTemplate: "asphalt_spray_rate",
        formData: {
          material,
          customMin: material === "CUSTOM" ? customMin : undefined,
          customMax: material === "CUSTOM" ? customMax : undefined,
          customDensity: material === "CUSTOM" ? customDensity : undefined,
          density,
          minRate,
          maxRate,
          pads: computed,
          avgRate,
          passAll,
        },
        overallResult: validRows.length === 0 ? "pending" : passAll ? "pass" : "fail",
        summaryValues: { material, avgRate, passAll: passAll ? "pass" : "fail" },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container max-w-4xl py-6 space-y-6">
        <SampleInfoCard dist={distribution} />
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-yellow-600" />
              {ar ? "معدل رش الأسفلت" : "Asphalt Spray Rate"} — Bituminous Spray Rate Test
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{ar ? "المواصفات: " : "Standard: "}JKR Specification / BS 594-1</p>
          </div>
          {distribution && (
            <Badge variant="outline">{distribution.distributionCode} — {distribution.testName}</Badge>
          )}
        </div>

        {/* Settings */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "إعدادات الاختبار" : "Test Settings"}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>{ar ? "نوع المادة الرابطة" : "Binder Type"}</Label>
              <Select value={material} onValueChange={v => setMaterial(v as MaterialKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MATERIAL_SPECS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{ar ? v.labelAr : v.labelEn}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {material === "CUSTOM" ? (
              <>
                <div>
                  <Label>{ar ? "معدل الرش الأدنى" : "Min Spray Rate"} (L/m²)</Label>
                  <Input value={customMin} onChange={e => setCustomMin(e.target.value)} type="number" step="0.01" />
                </div>
                <div>
                  <Label>{ar ? "معدل الرش الأقصى" : "Max Spray Rate"} (L/m²)</Label>
                  <Input value={customMax} onChange={e => setCustomMax(e.target.value)} type="number" step="0.01" />
                </div>
                <div>
                  <Label>{ar ? "الكثافة" : "Density"} (kg/L)</Label>
                  <Input value={customDensity} onChange={e => setCustomDensity(e.target.value)} type="number" step="0.01" />
                </div>
              </>
            ) : (
              <div className="col-span-2 bg-muted rounded-lg p-3 text-sm">
                <div className="grid grid-cols-3 gap-x-4">
                  <span className="text-muted-foreground">{ar ? "النوع:" : "Type:"}</span>
                  <span className="font-semibold col-span-2">{spec.type === "tack" ? (ar ? "طبقة لاصقة" : "Tack Coat") : (ar ? "طبقة أولية" : "Prime Coat")}</span>
                  <span className="text-muted-foreground">{ar ? "معدل الرش:" : "Spray Rate:"}</span>
                  <span className="font-mono font-bold col-span-2">{spec.minRate}–{spec.maxRate} L/m²</span>
                  <span className="text-muted-foreground">{ar ? "الكثافة:" : "Density:"}</span>
                  <span className="font-mono font-bold col-span-2">{spec.density} kg/L</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-4">
            <div className="flex gap-2 text-sm text-yellow-700 dark:text-yellow-300">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {ar ? "معدل الرش (L/m²) = (الكتلة المكتسبة ÷ 1000) ÷ الكثافة ÷ مساحة الصينية | الصينية القياسية: 300×300مم = 0.09 m²" : "Spray Rate (L/m²) = (Mass Gained ÷ 1000) ÷ Density ÷ Pad Area | Standard Pad: 300×300mm = 0.09 m²"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "جدول قراءات الصوانٍ" : "Pad Readings Table"}</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setRows(p => [...p, newPad(p.length)])}>
                <Plus className="h-4 w-4 mr-1" /> {ar ? "إضافة صينية" : "Add Pad"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted text-center">
                    <th className="border px-2 py-2">{ar ? "رقم الصينية" : "Pad No."}</th>
                    <th className="border px-2 py-2">{ar ? "الموقع" : "Location"}</th>
                    <th className="border px-2 py-2">{ar ? "المساحة" : "Area"} (m²)</th>
                    <th className="border px-2 py-2">{ar ? "الكتلة قبل" : "Mass Before"} (g)</th>
                    <th className="border px-2 py-2">{ar ? "الكتلة بعد" : "Mass After"} (g)</th>
                    <th className="border px-2 py-2">{ar ? "الكتلة المكتسبة" : "Mass Gained"} (g)</th>
                    <th className="border px-2 py-2">{ar ? "معدل الرش" : "Spray Rate"} (L/m²)</th>
                    <th className="border px-2 py-2">{ar ? "النتيجة" : "Result"}</th>
                    <th className="border px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {computed.map(row => (
                    <tr key={row.id} className="text-center hover:bg-muted/30">
                      <td className="border px-1 py-1">
                        <Input value={row.padNo} onChange={e => updateRow(row.id, "padNo", e.target.value)} className="h-7 text-center w-14 mx-auto" />
                      </td>
                      <td className="border px-1 py-1">
                        <Input value={row.location} onChange={e => updateRow(row.id, "location", e.target.value)} className="h-7 text-center w-24 mx-auto" placeholder="STA..." />
                      </td>
                      <td className="border px-1 py-1">
                        <Input value={row.padArea} onChange={e => updateRow(row.id, "padArea", e.target.value)} className="h-7 text-center w-16 mx-auto" type="number" step="0.01" />
                      </td>
                      <td className="border px-1 py-1">
                        <Input value={row.massBefore} onChange={e => updateRow(row.id, "massBefore", e.target.value)} className="h-7 text-center w-20 mx-auto" type="number" />
                      </td>
                      <td className="border px-1 py-1">
                        <Input value={row.massAfter} onChange={e => updateRow(row.id, "massAfter", e.target.value)} className="h-7 text-center w-20 mx-auto" type="number" />
                      </td>
                      <td className="border px-2 py-1 font-mono">{row.massGained?.toFixed(2) ?? "—"}</td>
                      <td className={`border px-2 py-1 font-mono font-bold ${row.result === "fail" ? "text-red-600" : row.result === "pass" ? "text-emerald-600" : ""}`}>
                        {row.sprayRate?.toFixed(3) ?? "—"}
                      </td>
                      <td className="border px-2 py-1">
                        {row.result && row.result !== "pending"
                          ? <PassFailBadge result={row.result} size="sm" />
                          : <span className="text-muted-foreground text-xs">{ar ? "—" : "—"}</span>}
                      </td>
                      <td className="border px-1 py-1">
                        {rows.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setRows(p => p.filter(r => r.id !== row.id))}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {validRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 font-semibold text-center">
                      <td colSpan={6} className="border px-2 py-2 text-right">{ar ? "المتوسط" : "Average"}</td>
                      <td className="border px-2 py-2 font-mono">{avgRate?.toFixed(3)}</td>
                      <td className="border px-2 py-2" colSpan={2}>
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
            testName={ar ? `معدل الرش — ${MATERIAL_SPECS[material].labelAr}` : `Spray Rate — ${MATERIAL_SPECS[material].labelEn}`}
            standard={spec.standard}
          />
        )}

        {/* Notes */}
        <Card>
          <CardHeader><CardTitle className="text-base">{ar ? "ملاحظات" : "Notes"}</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={ar ? "أي ملاحظات إضافية..." : "Any additional notes..."} rows={3} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 justify-end flex-wrap">
          {submitted && (
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" /> {ar ? "طباعة التقرير" : "Print Report"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSave("draft")}
            disabled={saving || saveMut.isPending || submitted}
          >
            {ar ? "حفظ مسودة" : "Save draft"}
          </Button>
          <Button
            type="button"
            className="min-w-32 bg-blue-600 hover:bg-blue-700"
            onClick={() => handleSave("submitted")}
            disabled={saving || saveMut.isPending || submitted}
          >
            <Send className="h-4 w-4 mr-2" />
            {saving || saveMut.isPending
              ? (ar ? "جاري الحفظ..." : "Saving...")
              : submitted
                ? (ar ? "تم الإرسال" : "Submitted")
                : (ar ? "تأكيد النتائج" : "Submit results")}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
