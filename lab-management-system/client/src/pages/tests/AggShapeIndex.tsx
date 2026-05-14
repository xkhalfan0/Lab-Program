import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { SampleInfoCard } from "@/components/SampleInfoCard";
import { PassFailBadge, ResultBanner } from "@/components/PassFailBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, FlaskConical, Info , UserCheck , Printer } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Flakiness & Elongation Index (BS 812-105) ────────────────────────────────
const SHAPE_SPECS = {
  "FLAKINESS": {
    label: "Flakiness Index",
    maxLimit: 35, // % (general use)
    standard: "BS 812-105.1",
    code: "AGG_FLAKINESS",
  },
  "ELONGATION": {
    label: "Elongation Index",
    maxLimit: 35,
    standard: "BS 812-105.2",
    code: "AGG_ELONGATION",
  },
};

type ShapeType = keyof typeof SHAPE_SPECS;

interface FractionRow {
  id: string;
  sieveRange: string;
  totalMass: string;
  flatOrElongMass: string;
  // computed
  percentage?: number;
  weightedContrib?: number;
}

const SIEVE_RANGES = [
  "6.3 / 5", "10 / 6.3", "14 / 10", "20 / 14", "28 / 20",
  "37.5 / 28", "50 / 37.5", "63 / 50",
];

function computeRow(row: FractionRow): FractionRow {
  const total = parseFloat(row.totalMass);
  const flat = parseFloat(row.flatOrElongMass);
  if (!total || flat === undefined || isNaN(flat)) return row;
  const percentage = (flat / total) * 100;
  return {
    ...row,
    percentage: parseFloat(percentage.toFixed(1)),
    weightedContrib: parseFloat(flat.toFixed(1)),
  };
}

export default function AggShapeIndex() {
  const { distributionId } = useParams<{ distributionId: string }>();
  const [, setLocation] = useLocation();
  const distId = parseInt(distributionId ?? "0");
  const { data: dist } = trpc.distributions.get.useQuery({ id: distId }, { enabled: !!distId });
  const { lang } = useLanguage();
  const ar = lang === "ar";

  const [shapeType, setShapeType] = useState<ShapeType>("FLAKINESS");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<FractionRow[]>(
    SIEVE_RANGES.map((s, i) => ({ id: `r${i}`, sieveRange: s, totalMass: "", flatOrElongMass: "" }))
  );
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const spec = SHAPE_SPECS[shapeType];
  const computedRows = rows.map(r => computeRow(r));
  const validRows = computedRows.filter(r => r.percentage !== undefined);

  const totalMassAll = validRows.reduce((s, r) => s + parseFloat(r.totalMass || "0"), 0);
  const flatMassAll = validRows.reduce((s, r) => s + parseFloat(r.flatOrElongMass || "0"), 0);
  const overallIndex = totalMassAll > 0 ? parseFloat(((flatMassAll / totalMassAll) * 100).toFixed(1)) : undefined;
  const overallResult: "pass" | "fail" | "pending" =
    overallIndex === undefined ? "pending"
    : overallIndex <= spec.maxLimit ? "pass" : "fail";

  const saveResult = trpc.specializedTests.save.useMutation({
    onSuccess: (_, vars) => {
      if (vars.status === "submitted") {
        toast.success(ar ? "تم إرسال النتائج بنجاح" : "Results submitted successfully");
        setSubmitted(true);
        setLocation("/technician");
      } else {
        toast.success(ar ? "تم حفظ المسودة بنجاح" : "Draft saved successfully");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const updateRow = (id: string, field: keyof FractionRow, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSave = async (status: "draft" | "submitted") => {
    if (!dist?.sampleId) {
      toast.error(lang === "ar" ? "معرف العينة مفقود" : "Sample ID missing");
      return;
    }
    if (status === "submitted" && overallIndex === undefined) {
      toast.error(ar ? "الرجاء إدخال بيانات الاختبار" : "Please enter test data");
      return;
    }
    setSaving(true);
    try {
      await saveResult.mutateAsync({
        distributionId: distId,
        sampleId: dist.sampleId,
        testTypeCode: spec.code,
        formTemplate: "agg_shape_index",
        formData: { shapeType, spec, source, rows: computedRows, overallIndex, overallResult },
        overallResult,
        summaryValues: { shapeType: spec.label, overallIndex, maxLimit: spec.maxLimit },
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
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <SampleInfoCard
          dist={dist}
          extraFields={[
            { label: "Aggregate type / نوع الركام", value: dist?.testSubType },
          ]}
        />
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
              <FlaskConical size={16} />
              <span>{ar ? "الركام / مؤشر الشكل" : "Aggregates / Shape Index"}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{ar ? "مؤشر التفتت والاستطالة" : "Flakiness & Elongation Index"}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {ar ? "BS 812-105 | أمر التوزيع:" : "BS 812-105 | Distribution:"} {dist?.distributionCode ?? `DIST-${distId}`}
            </p>
          </div>
          <div className="flex gap-2">
            {submitted ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation("/technician")}>
                  {ar ? "العودة للوحة التحكم" : "Back to Dashboard"}
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 gap-1.5"
                  onClick={() => window.open(`/test-report/${distId}`, "_blank")}
                >
                  <Printer size={14} />
                  {ar ? "طباعة التقرير / PDF" : "Print Report / PDF"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={saving}>{ar ? "حفظ مسودة" : "Save Draft"}</Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => handleSave("submitted")} disabled={saving}>
                  <Send size={14} className="mr-1.5" />{saving ? (ar ? "جاري..." : "Submitting...") : (ar ? "إرسال النتائج" : "Submit Results")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Test Info */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "نوع الاختبار" : "Test Type"}</Label>
                <Select value={shapeType} onValueChange={v => setShapeType(v as ShapeType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SHAPE_SPECS).map(([k, s]) => (
                      <SelectItem key={k} value={k}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-slate-500 mb-1 block">{ar ? "المصدر / المحجر" : "Source / Quarry"}</Label>
                <Input value={source} onChange={e => setSource(e.target.value)} placeholder={ar ? "مصدر الركام" : "Aggregate source"} />
              </div>
              <div className="flex items-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 w-full">
                  <Info size={12} className="inline mr-1" />
                  <strong>{ar ? "الحد الأقصى لـ" : "Max"} {spec.label}:</strong> ≤ {spec.maxLimit}%
                  <br /><span className="text-slate-400">{spec.standard}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {shapeType === "FLAKINESS" ? (ar ? "بيانات مقياس التفتت حسب الكسر" : "Flakiness Gauge Data by Fraction") : (ar ? "بيانات مقياس الاستطالة حسب الكسر" : "Elongation Gauge Data by Fraction")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
<table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-left">{ar ? "نطاق المنخل (مم)" : "Sieve Range (mm)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">{ar ? "الكتلة الكلية المحتجزة (جم)" : "Total Mass Retained (g)"}</th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                    {shapeType === "FLAKINESS" ? (ar ? "الجسيمات المسطحة (جم)" : "Flat Particles (g)") : (ar ? "الجسيمات المستطيلة (جم)" : "Elongated Particles (g)")}
                  </th>
                  <th className="border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center">
                    {shapeType === "FLAKINESS" ? (ar ? "نسبة التفتت %" : "Flakiness %") : (ar ? "نسبة الاستطالة %" : "Elongation %")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {computedRows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="border border-slate-200 px-2 py-1 font-mono text-xs font-semibold text-slate-700">{row.sieveRange}</td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.totalMass} onChange={e => updateRow(row.id, "totalMass", e.target.value)} className="h-7 text-xs w-24 text-center font-mono mx-auto block" placeholder="0" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1">
                      <Input value={row.flatOrElongMass} onChange={e => updateRow(row.id, "flatOrElongMass", e.target.value)} className="h-7 text-xs w-24 text-center font-mono mx-auto block" placeholder="0" />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 text-center font-mono text-xs font-bold text-slate-800">
                      {row.percentage !== undefined ? `${row.percentage}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold">
                  <td className="border border-slate-200 px-2 py-2 text-xs text-slate-600 font-semibold">{ar ? "الإجمالي / المؤشر العام" : "TOTAL / OVERALL INDEX"}</td>
                  <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm">
                    {totalMassAll > 0 ? totalMassAll.toFixed(1) : "—"}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 text-center font-mono text-sm">
                    {flatMassAll > 0 ? flatMassAll.toFixed(1) : "—"}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 text-center">
                    {overallIndex !== undefined ? (
                      <span className={`font-mono text-sm font-bold ${overallResult === "pass" ? "text-emerald-700" : "text-red-700"}`}>
                        {overallIndex}%
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
</div>

            {overallIndex !== undefined && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500">{ar ? "الكتلة الكلية" : "Total Mass"}</p>
                  <p className="text-lg font-bold text-slate-700">{totalMassAll.toFixed(1)} g</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500">{shapeType === "FLAKINESS" ? (ar ? "مسطح" : "Flat") : (ar ? "مستطيل" : "Elongated")} Mass</p>
                  <p className="text-lg font-bold text-slate-700">{flatMassAll.toFixed(1)} g</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${overallResult === "pass" ? "bg-emerald-50" : "bg-red-50"}`}>
                  <p className={`text-xs font-semibold ${overallResult === "pass" ? "text-emerald-600" : "text-red-600"}`}>
                    {spec.label}
                  </p>
                  <p className={`text-2xl font-bold ${overallResult === "pass" ? "text-emerald-800" : "text-red-800"}`}>
                    {overallIndex}%
                  </p>
                  <p className={`text-xs ${overallResult === "pass" ? "text-emerald-500" : "text-red-500"}`}>
                    {ar ? "الحد الأقصى:" : "Max:"} {spec.maxLimit}%
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {overallIndex !== undefined && (
          <ResultBanner
            result={overallResult}
            testName={ar ? `${spec.label} — الركام الخشن` : `${spec.label} — Coarse Aggregate`}
            standard={spec.standard}
          />
        )}

        {/* Notes */}
        <Card>
          <CardContent className="pt-4">
            <Label className="text-xs text-slate-500 mb-1 block">{ar ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
