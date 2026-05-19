import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { redirectAfterTestSave } from "@/lib/batchHelpers";
import { extractBitumenContentFromExtractionResult } from "@/lib/asphaltBitumen";
import { BitumenContentFromExtraction } from "@/components/BitumenContentFromExtraction";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { PassFailBadge, ResultBanner } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, Send, FlaskConical, UserCheck, Printer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

const STABILITY_MIN_KN = 8;
const FLOW_MIN_MM = 2;
const FLOW_MAX_MM = 4;

interface MarshallRow {
  id: string;
  specimenNo: string;
  bulkDensity: string;
  stability: string;
  flow: string;
  vma: string;
  vfa: string;
  airVoids: string;
  stabilityResult?: "pass" | "fail" | "pending";
  flowResult?: "pass" | "fail" | "pending";
  overallResult?: "pass" | "fail" | "pending";
}

function newRow(index: number): MarshallRow {
  return {
    id: `row_${Date.now()}_${index}`,
    specimenNo: `S${index + 1}`,
    bulkDensity: "",
    stability: "",
    flow: "",
    vma: "",
    vfa: "",
    airVoids: "",
  };
}

function computeMarshallRow(row: MarshallRow): MarshallRow {
  const stability = parseFloat(row.stability);
  const flow = parseFloat(row.flow);

  const stabilityResult: "pass" | "fail" | "pending" =
    !Number.isNaN(stability) ? (stability >= STABILITY_MIN_KN ? "pass" : "fail") : "pending";
  const flowResult: "pass" | "fail" | "pending" =
    !Number.isNaN(flow) ? (flow >= FLOW_MIN_MM && flow <= FLOW_MAX_MM ? "pass" : "fail") : "pending";

  const judged = [stabilityResult, flowResult].filter((r) => r !== "pending");
  const overallResult: "pass" | "fail" | "pending" =
    judged.length === 0 ? "pending" : judged.every((r) => r === "pass") ? "pass" : "fail";

  return { ...row, stabilityResult, flowResult, overallResult };
}

export default function AsphaltMarshall() {
  const { user } = useAuth();
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const ar = lang === "ar";
  const distId = parseInt(distributionId ?? "0");

  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { data: existing } = trpc.specializedTests.getByDistribution.useQuery(
    { distributionId: distId },
    { enabled: !!distId },
  );
  const { data: bitumenExtractionResults = [] } = trpc.specializedTests.getBySampleAndTestType.useQuery(
    {
      sampleId: dist?.sampleId ?? 0,
      testTypeCode: "ASPH_BITUMEN_EXTRACT",
      status: "submitted",
    },
    { enabled: !!dist?.sampleId },
  );

  const [rows, setRows] = useState<MarshallRow[]>([newRow(0), newRow(1), newRow(2)]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const bitumenExtraction = bitumenExtractionResults[0];
  const bitumenContent = useMemo(
    () => extractBitumenContentFromExtractionResult(bitumenExtraction),
    [bitumenExtraction],
  );

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        redirectAfterTestSave(setLocation, dist);
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!existing?.formData) return;
    const fd = existing.formData as {
      specimens?: MarshallRow[];
      notes?: string;
      bitumenContent?: number;
    };
    if (fd.notes) setNotes(fd.notes);
    if (Array.isArray(fd.specimens) && fd.specimens.length > 0) {
      setRows(
        fd.specimens.map((s, i) => ({
          id: s.id || `row_${Date.now()}_${i}`,
          specimenNo: s.specimenNo || `S${i + 1}`,
          bulkDensity: String(s.bulkDensity ?? ""),
          stability: String(s.stability ?? ""),
          flow: String(s.flow ?? ""),
          vma: String(s.vma ?? ""),
          vfa: String(s.vfa ?? ""),
          airVoids: String(s.airVoids ?? ""),
        })),
      );
    }
    if (existing.status === "submitted") setSubmitted(true);
  }, [existing]);

  const computedRows = rows.map((r) => {
    const computed = computeMarshallRow(r);
    return {
      ...computed,
      bitumenContent: bitumenContent != null ? String(bitumenContent) : "",
    };
  });
  const validRows = computedRows.filter((r) => r.stability && r.flow);
  const overallResult: "pass" | "fail" | "pending" =
    validRows.length === 0
      ? "pending"
      : validRows.every((r) => r.overallResult === "pass")
        ? "pass"
        : "fail";

  const updateRow = useCallback((id: string, field: keyof MarshallRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && validRows.length === 0) {
      toast.error(ar ? "الرجاء إدخال نتيجة عينة واحدة على الأقل" : "Please enter at least one specimen result");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: "ASPH_MARSHALL",
        formTemplate: "asphalt_marshall",
        formData: {
          specimens: computedRows,
          bitumenContent,
          bitumenSource: bitumenExtraction
            ? {
                distributionId: bitumenExtraction.distributionId,
                testTypeCode: bitumenExtraction.testTypeCode,
              }
            : null,
        },
        overallResult: overallResult === "pending" ? "pending" : overallResult,
        summaryValues: {
          bitumenContent,
          avgStability:
            validRows.length > 0
              ? (
                  validRows.reduce((s, r) => s + parseFloat(r.stability), 0) / validRows.length
                ).toFixed(2)
              : undefined,
          avgFlow:
            validRows.length > 0
              ? (validRows.reduce((s, r) => s + parseFloat(r.flow), 0) / validRows.length).toFixed(2)
              : undefined,
        },
        notes,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!distId || distId === 0) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center text-red-600">
          {lang === "ar" ? "معرف التوزيع غير صالح" : "Invalid distribution ID"}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <SampleInfoCard dist={dist} extraFields={[{ label: ar ? "نوع الخلطة" : "Mix type", value: dist?.testSubType }]} />

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "اختبارات الأسفلت / مارشال" : "Asphalt Tests / Marshall"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {ar
                ? "الثبات والتدفق ونسبة الفراغات لعينات مارشال"
                : "Stability, Flow & Voids Percentage of Marshall Specimens"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              ASTM D1559 | {ar ? "أمر التوزيع:" : "Distribution:"}{" "}
              {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2">
            {submitted ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                  {ar ? "العودة" : "Back"}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 gap-1.5"
                  onClick={() => window.open(`/test-report/${distId}`, "_blank")}
                >
                  <Printer size={14} />
                  {ar ? "طباعة التقرير" : "Print Report"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>
                  {ar ? "حفظ مسودة" : "Save Draft"}
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />
                  {saving ? (ar ? "جاري..." : "Submitting...") : ar ? "إرسال النتائج" : "Submit Results"}
                </Button>
              </>
            )}
          </div>
        </div>

        <BitumenContentFromExtraction
          lang={lang}
          bitumenContent={bitumenContent}
          extractionDistributionCode={bitumenExtraction?.testTypeCode ?? null}
        />

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">{ar ? "الفاحص" : "Tested By"}</Label>
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <UserCheck size={14} className="text-green-600" />
                <span className="text-sm font-semibold text-green-800">{user?.name ?? "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{ar ? "نتائج العينات" : "Specimen Results"}</CardTitle>
              {!submitted && (
                <Button size="sm" variant="outline" onClick={() => setRows((p) => [...p, newRow(p.length)])}>
                  <Plus size={14} className="mr-1" /> {ar ? "إضافة عينة" : "Add Specimen"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-2 text-xs">{ar ? "العينة" : "Spec."}</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs bg-amber-50">
                      {ar ? "البيتومين (%)" : "Bitumen (%)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs">
                      {ar ? "الكثافة" : "Bulk Density"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs">
                      {ar ? "الثبات (كن)" : "Stability (kN)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs">
                      {ar ? "التدفق (مم)" : "Flow (mm)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs">VMA (%)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs">VFA (%)</th>
                    <th className="border border-slate-200 px-2 py-2 text-xs">
                      {ar ? "الفراغات (%)" : "Air Voids (%)"}
                    </th>
                    <th className="border border-slate-200 px-2 py-2 text-xs">{ar ? "النتيجة" : "Result"}</th>
                    <th className="border border-slate-200 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {computedRows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.specimenNo}
                          onChange={(e) => updateRow(row.id, "specimenNo", e.target.value)}
                          className="h-7 text-xs w-14"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs bg-amber-50/50">
                        {bitumenContent != null ? bitumenContent.toFixed(2) : "—"}
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.bulkDensity}
                          onChange={(e) => updateRow(row.id, "bulkDensity", e.target.value)}
                          className="h-7 text-xs w-20 text-center font-mono"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.stability}
                          onChange={(e) => updateRow(row.id, "stability", e.target.value)}
                          className="h-7 text-xs w-20 text-center font-mono"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.flow}
                          onChange={(e) => updateRow(row.id, "flow", e.target.value)}
                          className="h-7 text-xs w-20 text-center font-mono"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.vma}
                          onChange={(e) => updateRow(row.id, "vma", e.target.value)}
                          className="h-7 text-xs w-16 text-center font-mono"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.vfa}
                          onChange={(e) => updateRow(row.id, "vfa", e.target.value)}
                          className="h-7 text-xs w-16 text-center font-mono"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Input
                          value={row.airVoids}
                          onChange={(e) => updateRow(row.id, "airVoids", e.target.value)}
                          className="h-7 text-xs w-16 text-center font-mono"
                          disabled={submitted}
                        />
                      </td>
                      <td className="border border-slate-200 px-1 py-1 text-center">
                        <PassFailBadge result={row.overallResult ?? "pending"} size="sm" />
                      </td>
                      <td className="border border-slate-200 px-1 py-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600"
                          onClick={() => setRows((p) => p.filter((r) => r.id !== row.id))}
                          disabled={submitted || rows.length <= 1}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {ar
                ? `المواصفات: الثبات ≥ ${STABILITY_MIN_KN} كن، التدفق ${FLOW_MIN_MM}–${FLOW_MAX_MM} مم`
                : `Spec: Stability ≥ ${STABILITY_MIN_KN} kN, Flow ${FLOW_MIN_MM}–${FLOW_MAX_MM} mm`}
            </p>
          </CardContent>
        </Card>

        {validRows.length > 0 && overallResult !== "pending" && (
          <ResultBanner
            result={overallResult}
            testName={ar ? "مارشال — الثبات والتدفق" : "Marshall — Stability & Flow"}
            standard="ASTM D1559"
          />
        )}

        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={submitted} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

