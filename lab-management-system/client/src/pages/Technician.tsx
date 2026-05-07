import DashboardLayout from "@/components/DashboardLayout";
import { DeletionRequestButton } from "@/components/DeletionRequestButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Microscope, Plus, Trash2, FlaskConical, CheckCircle2, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { TaskQueue, getDistributionTaskState, type Task } from "@/components/TaskQueue";

// ─── Bilingual labels ─────────────────────────────────────────────────────────
const T = {
  title:       { ar: "مهام الفني",              en: "Technician Tasks" },
  subtitle:    { ar: "قائمة الاختبارات المكلّف بها", en: "Your assigned test queue" },
  enterResults:{ ar: "إدخال النتائج",            en: "Enter Results" },
  measurements:{ ar: "القياسات",                 en: "Measurements" },
  notes:       { ar: "ملاحظات",                  en: "Notes" },
  submit:      { ar: "إرسال النتائج ومعالجتها",  en: "Submit & Process Results" },
  cancel:      { ar: "إلغاء",                    en: "Cancel" },
  addReading:  { ar: "إضافة قراءة",              en: "Add Reading" },
  loading:     { ar: "جارٍ الإرسال...",           en: "Submitting..." },
  noValue:     { ar: "يرجى إدخال قياس واحد على الأقل", en: "Please enter at least one valid measurement" },
  success:     { ar: "تم إرسال النتائج ومعالجتها بنجاح", en: "Results submitted and processed" },
  range:       { ar: "النطاق المقبول",            en: "Acceptable Range" },
  order:       { ar: "أمر التوزيع",               en: "Distribution Order" },
  testType:    { ar: "نوع الاختبار",              en: "Test Type" },
  priority:    { ar: "الأولوية",                  en: "Priority" },
  dueDate:     { ar: "تاريخ الاستحقاق",           en: "Due Date" },
};

function tx(key: keyof typeof T, lang: string) {
  return lang === "ar" ? T[key].ar : T[key].en;
}

// ─── Specialized test codes that have dedicated pages ─────────────────────────
// --- SubType label map (value -> {ar, en}) ---
const SUBTYPE_LABELS: Record<string, { ar: string; en: string }> = {
  "7_days":          { ar: "7 أيام",                    en: "7 Days" },
  "14_days":         { ar: "14 يوم",                    en: "14 Days" },
  "28_days":         { ar: "28 يوم",                    en: "28 Days" },
  "solid_block":     { ar: "بلوك صلب",                en: "Solid Block" },
  "hollow_block":    { ar: "بلوك مجوف",               en: "Hollow Block" },
  "thermal_block":   { ar: "بلوك حراري",              en: "Thermal Block" },
  "interlock_6cm":   { ar: "إنترلوك 6 سم",              en: "Interlock 6cm" },
  "interlock_8cm":   { ar: "إنترلوك 8 سم",              en: "Interlock 8cm" },
  "beam_small":      { ar: "كمرة صغيرة 10x10x50",        en: "Beam Small 10x10x50" },
  "beam_large":      { ar: "كمرة كبيرة 15x15x75",        en: "Beam Large 15x15x75" },
  "core":            { ar: "كور خرساني",              en: "Concrete Core" },
  "mortar":          { ar: "ملاط",                     en: "Mortar" },
  "proctor_standard":{ ar: "بروكتور قياسي",            en: "Standard Proctor" },
  "proctor_modified":{ ar: "بروكتور محسن",            en: "Modified Proctor" },
  "cbr":             { ar: "CBR نسبة تحمل كاليفورنيا",  en: "CBR" },
  "atterberg":       { ar: "حدود أتربرج",              en: "Atterberg Limits" },
  "sieve":           { ar: "تحليل منخلي",               en: "Sieve Analysis" },
  "field_density":   { ar: "كثافة حقلية",               en: "Field Density" },
  "rebar_T8":        { ar: "حديد تسليح T8",            en: "Rebar T8" },
  "rebar_T10":       { ar: "حديد تسليح T10",           en: "Rebar T10" },
  "rebar_T12":       { ar: "حديد تسليح T12",           en: "Rebar T12" },
  "rebar_T16":       { ar: "حديد تسليح T16",           en: "Rebar T16" },
  "rebar_T20":       { ar: "حديد تسليح T20",           en: "Rebar T20" },
  "rebar_T25":       { ar: "حديد تسليح T25",           en: "Rebar T25" },
  "rebar_T32":       { ar: "حديد تسليح T32",           en: "Rebar T32" },
  "bend_rebend":     { ar: "اختبار الثني وإعادة الثني",   en: "Bend & Re-bend" },
  "anchor_bolt":     { ar: "مسمار إرساء",               en: "Anchor Bolt" },
  "structural":      { ar: "حديد هيكلي",               en: "Structural Steel" },
  "marshall":        { ar: "مارشال",                   en: "Marshall" },
  "bitumen_extract": { ar: "استخلاص البيتومين",         en: "Bitumen Extraction" },
  "extracted_sieve": { ar: "منخلي بعد الاستخلاص",       en: "Extracted Sieve" },
  "spray_rate":      { ar: "معدل الرش",                en: "Spray Rate" },
  "hot_bin":         { ar: "تحليل منخلي حار",           en: "Hot Bin Sieve" },
  "sieve_coarse":    { ar: "تحليل منخلي خشن",          en: "Coarse Sieve Analysis" },
  "sieve_fine":      { ar: "تحليل منخلي ناعم",          en: "Fine Sieve Analysis" },
  "specific_gravity":{ ar: "الكثافة النوعية",            en: "Specific Gravity" },
  "la_abrasion":     { ar: "تآكل لوس أنجلوس",          en: "LA Abrasion" },
  "flakiness":       { ar: "مؤشر الشكل",               en: "Flakiness & Elongation" },
  "crushing":        { ar: "قيمة السحق",                en: "Crushing Value" },
  "impact":          { ar: "قيمة الصدمة",               en: "Impact Value" },
};

function getSubTypeLabel(subType: string | null | undefined, lang: string): string | undefined {
  if (!subType) return undefined;
  const entry = SUBTYPE_LABELS[subType];
  return entry ? (lang === "ar" ? entry.ar : entry.en) : subType;
}

const SPECIALIZED_CODES = [
  "CONC_CUBE", "CONC_CORE", "CONC_BLOCK", "CONC_INTERLOCK", "CONC_MORTAR",
  "STEEL_REBAR", "STEEL_ANCHOR", "STEEL_PLATE", "STEEL_TUBE", "STEEL_WIRE",
  "AGG_SIEVE_COARSE", "AGG_SIEVE_FINE", "AGG_LOS_ANGELES", "AGG_FLAKINESS",
  "SOIL_PROCTOR", "SOIL_CBR", "SOIL_ATTERBERG", "SOIL_COMPACTION",
  "ASPH_ACWC", "ASPH_ACBC", "ASPH_DBM", "ASPH_MARSHALL",
  // legacy codes
  "CONC_BLOCK_SOLID", "CONC_BLOCK_HOLLOW", "CONC_BLOCK_THERMAL",
  "CONC_INTERLOCK_6CM", "CONC_INTERLOCK_8CM",
  "STEEL_REBAR_BS4449", "STEEL_REBAR_ASTM",
  "AGG_SIEVE_COARSE", "AGG_SIEVE_FINE", "CONC_MORTAR_SAND",
  "SOIL_PROCTOR", "ASPH_ACWC", "ASPH_ACBC", "ASPH_DBM",
];

export default function Technician() {
  const { lang } = useLanguage();
  const [, navigate] = useLocation();
  const [selectedDist, setSelectedDist] = useState<any>(null);
  const [rawValues, setRawValues] = useState<string[]>(["", "", ""]);
  const [unit, setUnit] = useState("MPa");
  const [testNotes, setTestNotes] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  const { data: assignments = [], refetch } = trpc.distributions.myAssignments.useQuery();
  const { data: myOrders = [], refetch: refetchOrders } = trpc.orders.myOrders.useQuery();
  const { data: allSamples = [] } = trpc.samples.list.useQuery();
  const markRead = trpc.distributions.markRead.useMutation();

  const toggleOrder = (id: number) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleOpenTest = (dist: any) => {
    const testType = dist.testType ?? "";
    const isSpecialized =
      SPECIALIZED_CODES.includes(testType) ||
      testType.startsWith("STEEL_") ||
      testType.startsWith("AGG_") ||
      testType.startsWith("SOIL_") ||
      testType.startsWith("ASPH_") ||
      testType.startsWith("CONC_") ||
      testType.startsWith("CEM_");

    if (testType === "CONC_CUBE" || testType === "concrete" || testType === "concrete_compression") {
      navigate(`/concrete-test/${dist.distributionId ?? dist.id}`);
    } else if (isSpecialized) {
      navigate(`/test/${dist.distributionId ?? dist.id}`);
    } else {
      setSelectedDist(dist);
      setUnit(dist.unit ?? "MPa");
      const qty = dist.quantity && dist.quantity > 0 ? dist.quantity : 3;
      setRawValues(Array(qty).fill(""));
      setTestNotes("");
    }
  };

  const submitResults = trpc.testResults.submit.useMutation({
    onSuccess: () => {
      toast.success(tx("success", lang));
      setSelectedDist(null);
      setRawValues(["", "", ""]);
      setTestNotes("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Build Task objects from assignments
  const tasks: Task[] = assignments.map((dist) => {
    const subTypeLabel = getSubTypeLabel(dist.sampleSubType, lang);
    const subtitleParts: string[] = [];
    if (dist.sampleCode) subtitleParts.push(dist.sampleCode);
    if (subTypeLabel) subtitleParts.push(subTypeLabel);
    return {
      id: dist.id,
      code: dist.distributionCode,
      title: lang === "ar" ? (dist.testNameAr || dist.testName) : (dist.testNameEn || dist.testName),
      subtitle: subtitleParts.length > 0 ? subtitleParts.join(" • ") : undefined,
      meta: dist.expectedCompletionDate
        ? `${tx("dueDate", lang)}: ${new Date(dist.expectedCompletionDate).toLocaleDateString()}`
        : undefined,
      state: getDistributionTaskState({ status: dist.status, taskReadAt: dist.taskReadAt }),
      createdAt: dist.createdAt,
    };
  });

  // Also include completed ones for history
  const allTasks = tasks; // myAssignments already returns pending+in_progress; completed ones come from history

  const handleOpenTask = async (task: Task) => {
    const dist = assignments.find((d) => d.id === task.id);
    if (!dist) return;

    // Mark as read (transitions new → incomplete)
    if (!dist.taskReadAt) {
      markRead.mutate({ id: dist.id });
    }

    // Route to the correct form - all prefixed test codes go to /test/:id
    const testType = dist.testType ?? "";
    const isSpecialized =
      SPECIALIZED_CODES.includes(testType) ||
      testType.startsWith("STEEL_") ||
      testType.startsWith("AGG_") ||
      testType.startsWith("SOIL_") ||
      testType.startsWith("ASPH_") ||
      testType.startsWith("CONC_") ||
      testType.startsWith("CEM_");

    if (testType === "CONC_CUBE" || testType === "concrete" || testType === "concrete_compression") {
      navigate(`/concrete-test/${dist.id}`);
    } else if (isSpecialized) {
      navigate(`/test/${dist.id}`);
    } else {
      setSelectedDist(dist);
      setUnit(dist.unit ?? "MPa");
      // Auto-populate reading count based on sample quantity (min 1)
      const qty = dist.sampleQuantity && dist.sampleQuantity > 0 ? dist.sampleQuantity : 3;
      setRawValues(Array(qty).fill(""));
      setTestNotes("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = rawValues.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
    if (values.length === 0) {
      toast.error(tx("noValue", lang));
      return;
    }
    const resolvedSampleId =
      selectedDist?.sampleId ??
      (selectedDist?.sampleCode
        ? allSamples.find((s: any) => s.sampleCode === selectedDist.sampleCode)?.id
        : undefined);
    if (resolvedSampleId == null) {
      toast.error("Sample record not found");
      return;
    }
    submitResults.mutate({
      distributionId: selectedDist.id,
      sampleId: resolvedSampleId,
      rawValues: values,
      unit,
      testNotes: testNotes || undefined,
    });
  };

  const addRow = () => setRawValues([...rawValues, ""]);
  const removeRow = (i: number) => setRawValues(rawValues.filter((_, idx) => idx !== i));
  const updateRow = (i: number, val: string) => {
    const updated = [...rawValues];
    updated[i] = val;
    setRawValues(updated);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold">{tx("title", lang)}</h1>
          <p className="text-sm text-muted-foreground">{tx("subtitle", lang)}</p>
        </div>

        {/* Orders Section */}
        {myOrders.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {lang === "ar" ? "الأوردرات" : "My Orders"}
            </h2>
            <div className="space-y-2">
              {myOrders.map((order: any) => {
                const isExpanded = expandedOrders.has(order.id);
                const doneCount = (order.items ?? []).filter((i: any) => i.status === "completed").length;
                const totalCount = (order.items ?? []).length;
                const allDone = doneCount === totalCount && totalCount > 0;
                return (
                  <Card key={order.id} className="overflow-hidden">
                    <CardHeader
                      className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleOrder(order.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                          <FlaskConical className="w-4 h-4 text-primary" />
                          <span className="font-mono text-sm font-bold">{order.orderCode}</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-sm text-muted-foreground">{order.sampleCode}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {doneCount}/{totalCount} {lang === "ar" ? "مكتمل" : "done"}
                          </span>
                          <Badge variant={allDone ? "default" : "secondary"} className="text-xs">
                            {allDone
                              ? (lang === "ar" ? "مكتمل" : "Complete")
                              : (lang === "ar" ? "جارٍ" : "In Progress")}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="pt-0 pb-3 px-4">
                        <div className="space-y-1.5">
                          {(order.items ?? []).map((item: any) => {
                            const isDone = item.status === "completed";
                            return (
                              <div
                                key={item.id}
                                className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                                  isDone
                                    ? "bg-muted/30 text-muted-foreground"
                                    : "bg-primary/5 hover:bg-primary/10 cursor-pointer"
                                }`}
                                onClick={() =>
                                  !isDone &&
                                  handleOpenTest({
                                    ...item,
                                    sampleId: item.sampleId ?? order.sampleId,
                                    sampleCode: item.sampleCode ?? order.sampleCode,
                                  })
                                }
                              >
                                <div className="flex items-center gap-2">
                                  {isDone
                                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    : <Clock className="w-4 h-4 text-amber-500" />}
                                  <span className={isDone ? "line-through" : ""}>
                                    {lang === "ar" ? (item.testNameAr || item.testName) : (item.testNameEn || item.testName)}
                                  </span>
                                </div>
                                {!isDone && (
                                  <div className="flex items-center gap-1">
                                    <Button size="sm" variant="outline" className="h-7 text-xs">
                                      {lang === "ar" ? "ابدأ" : "Start"}
                                    </Button>
                                    <DeletionRequestButton
                                      targetTable="test_results"
                                      targetId={item.id}
                                      targetLabel={`Test Result ${item.id}`}
                                      variant="icon"
                                      onSuccess={() => {
                                        refetch();
                                        refetchOrders();
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <TaskQueue
          tasks={allTasks}
          lang={lang}
          onOpen={handleOpenTask}
        />
      </div>

      {/* Inline Results Entry Dialog (for non-specialized tests) */}
      <Dialog open={!!selectedDist} onOpenChange={(o) => !o && setSelectedDist(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Microscope className="w-5 h-5" />
              {lang === "ar" ? "إدخال نتائج الاختبار" : "Enter Test Results"}
            </DialogTitle>
          </DialogHeader>
          {selectedDist && (
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">{tx("order", lang)}:</span>{" "}
                  <span className="font-mono font-bold">{selectedDist.distributionCode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{tx("testType", lang)}:</span>{" "}
                  <span className="font-medium">
                    {lang === "ar" ? (selectedDist.testNameAr || selectedDist.testName) : (selectedDist.testNameEn || selectedDist.testName)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{tx("range", lang)}:</span>{" "}
                  <span className="font-medium">
                    {selectedDist.minAcceptable ?? "—"} – {selectedDist.maxAcceptable ?? "—"} {selectedDist.unit}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{lang === "ar" ? `${tx("measurements", lang)} (${unit})` : `${tx("measurements", lang)} (${unit})`}</Label>
                  <Input
                    className="h-7 w-20 text-xs"
                    placeholder="Unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  {rawValues.map((val, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20">
                        {lang === "ar" ? `قراءة ${i + 1}` : `Reading ${i + 1}`}
                      </span>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder={`Value in ${unit}`}
                        value={val}
                        onChange={(e) => updateRow(i, e.target.value)}
                        className="flex-1"
                      />
                      {rawValues.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => removeRow(i)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs"
                  onClick={addRow}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {tx("addReading", lang)}
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="testNotes">{tx("notes", lang)}</Label>
                <Textarea
                  id="testNotes"
                  rows={2}
                  placeholder={lang === "ar" ? "الملاحظات والظروف..." : "Observations, conditions, notes..."}
                  value={testNotes}
                  onChange={(e) => setTestNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button type="submit" className="flex-1" disabled={submitResults.isPending}>
                  {submitResults.isPending ? tx("loading", lang) : tx("submit", lang)}
                </Button>
                <Button type="button" variant="outline" onClick={() => setSelectedDist(null)}>
                  {tx("cancel", lang)}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
