import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PrintHeader from "@/components/PrintHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { WorkflowProgress } from "@/components/WorkflowProgress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { SAMPLE_TYPE_LABELS } from "@/lib/labTypes";
import { ArrowLeft, Clock, User, FileText, Printer, Sparkles, X, Loader2, Building2, RefreshCw, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useParams, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from "recharts";

// ─── Sector helpers ───────────────────────────────────────────────────────────
function sectorLabel(val: string | null | undefined, lang: string, sectors?: any[]) {
  if (!val) return "—";
  if (sectors) {
    const s = sectors.find((x: any) => x.sectorKey === val);
    if (s) return lang === "ar" ? s.nameAr : s.nameEn;
  }
  const fallback: Record<string, { ar: string; en: string }> = {
    sector_1: { ar: "قطاع/1", en: "Sector 1" },
    sector_2: { ar: "قطاع/2", en: "Sector 2" },
    sector_3: { ar: "قطاع/3", en: "Sector 3" },
    sector_4: { ar: "قطاع/4", en: "Sector 4" },
    sector_5: { ar: "قطاع/5", en: "Sector 5" },
  };
  return (lang === "ar" ? fallback[val]?.ar : fallback[val]?.en) ?? val;
}

// ─── Simplified Report Modal ──────────────────────────────────────────────────
interface SimplifiedReportModalProps {
  open: boolean;
  onClose: () => void;
  sampleId: number;
}

function SimplifiedReportModal({ open, onClose, sampleId }: SimplifiedReportModalProps) {
  const [reportData, setReportData] = useState<{
    sampleCode: string;
    sampleType: string;
    contractName: string;
    contractorName: string;
    sampleDate: string;
    reportText: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateReport = trpc.samples.generateSimplifiedReport.useMutation({
    onSuccess: (data) => {
      setReportData(data);
      setError(null);
    },
    onError: (err) => {
      setError(err.message ?? "حدث خطأ أثناء توليد التقرير.");
    },
  });

  // Trigger generation when modal opens
  if (open && !reportData && !generateReport.isPending && !error) {
    generateReport.mutate({ sampleId });
  }

  const handlePrint = () => {
    if (!reportData) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const today = new Date().toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    printWindow.document.write(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير مبسّط – ${reportData.sampleCode}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Sans Arabic', Arial, sans-serif;
      direction: rtl;
      color: #1a1a1a;
      background: #fff;
      padding: 40px;
      font-size: 14px;
      line-height: 1.8;
    }
    .header {
      text-align: center;
      border-bottom: 3px double #1a3a6b;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 { font-size: 18px; font-weight: 700; color: #1a3a6b; }
    .header h2 { font-size: 14px; font-weight: 600; color: #444; margin-top: 4px; }
    .header p { font-size: 12px; color: #666; margin-top: 2px; }
    .report-title {
      font-size: 16px;
      font-weight: 700;
      text-align: center;
      margin: 16px 0;
      padding: 8px;
      background: #f0f4ff;
      border-right: 4px solid #1a3a6b;
    }
    .meta-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 13px;
    }
    .meta-table td {
      padding: 6px 10px;
      border: 1px solid #ddd;
    }
    .meta-table td:first-child {
      background: #f5f7fa;
      font-weight: 600;
      width: 35%;
    }
    .report-body {
      margin-top: 16px;
      padding: 16px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #fafafa;
      white-space: pre-wrap;
      font-size: 13.5px;
      line-height: 2;
    }
    .footer {
      margin-top: 40px;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #666;
      border-top: 1px solid #ddd;
      padding-top: 12px;
    }
    .signature-box {
      margin-top: 40px;
      display: flex;
      justify-content: flex-end;
      gap: 60px;
    }
    .signature-item {
      text-align: center;
      font-size: 12px;
    }
    .signature-line {
      border-top: 1px solid #333;
      width: 140px;
      margin-top: 40px;
      margin-bottom: 4px;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>مختبر الإنشاءات والمواد الهندسية</h1>
    <h2>Construction & Engineering Materials Laboratory</h2>
    <p>التقرير المبسّط لنتائج الفحص</p>
  </div>

  <div class="report-title">تقرير مبسّط – رقم العينة: ${reportData.sampleCode}</div>

  <table class="meta-table">
    <tr><td>رقم العينة</td><td>${reportData.sampleCode}</td></tr>
    <tr><td>نوع المادة</td><td>${reportData.sampleType}</td></tr>
    <tr><td>اسم المشروع</td><td>${reportData.contractName || "—"}</td></tr>
    <tr><td>المقاول</td><td>${reportData.contractorName || "—"}</td></tr>
    <tr><td>تاريخ الاستلام</td><td>${reportData.sampleDate}</td></tr>
    <tr><td>تاريخ إصدار التقرير</td><td>${today}</td></tr>
  </table>

  <div class="report-body">${reportData.reportText}</div>

  <div class="signature-box">
    <div class="signature-item">
      <div class="signature-line"></div>
      <div>مدير المختبر</div>
    </div>
    <div class="signature-item">
      <div class="signature-line"></div>
      <div>مسؤول ضبط الجودة</div>
    </div>
  </div>

  <div class="footer">
    <span>تاريخ الطباعة: ${today}</span>
    <span>هذا التقرير صادر من نظام إدارة المختبر</span>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`);
    printWindow.document.close();
  };

  const handleClose = () => {
    setReportData(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-5 h-5 text-blue-500" />
            التقرير المبسّط بالذكاء الاصطناعي
          </DialogTitle>
        </DialogHeader>

        {generateReport.isPending && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm">جاري توليد التقرير، يرجى الانتظار...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 text-right">
            <p className="font-semibold mb-1">حدث خطأ</p>
            <p>{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setError(null);
                generateReport.mutate({ sampleId });
              }}
            >
              إعادة المحاولة
            </Button>
          </div>
        )}

        {reportData && (
          <div className="space-y-4">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-2 text-sm bg-muted/30 rounded-lg p-3">
              {[
                { label: "رقم العينة", value: reportData.sampleCode },
                { label: "نوع المادة", value: reportData.sampleType },
                { label: "المشروع", value: reportData.contractName || "—" },
                { label: "المقاول", value: reportData.contractorName || "—" },
                { label: "تاريخ الاستلام", value: reportData.sampleDate },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="font-medium text-sm">{value}</span>
                </div>
              ))}
            </div>

            {/* Report text */}
            <div className="rounded-lg border bg-background p-4 text-sm leading-relaxed whitespace-pre-wrap text-right">
              {reportData.reportText}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                إغلاق
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    setReportData(null);
                    setError(null);
                    generateReport.mutate({ sampleId });
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  إعادة التوليد
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={handlePrint}
                >
                  <Printer className="w-4 h-4" />
                  طباعة التقرير
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SampleDetail() {
  const params = useParams<{ id: string }>();
  const sampleId = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const [showSimplifiedReport, setShowSimplifiedReport] = useState(false);
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reassignTechId, setReassignTechId] = useState("");
  const [reassignNotes, setReassignNotes] = useState("");
  const { lang } = useLanguage();
  const { user } = useAuth();

  const { data: sample, isLoading, refetch: refetchSample } = trpc.samples.get.useQuery({ id: sampleId }, { enabled: !!sampleId });
  const { data: history, refetch: refetchHistory } = trpc.samples.history.useQuery({ sampleId }, { enabled: !!sampleId });
  const { data: distributions, refetch: refetchDist } = trpc.distributions.bySample.useQuery({ sampleId }, { enabled: !!sampleId });
  const { data: results } = trpc.testResults.bySample.useQuery({ sampleId }, { enabled: !!sampleId });
  const { data: reviews } = trpc.reviews.bySample.useQuery({ sampleId }, { enabled: !!sampleId });
  const { data: sectors = [] } = trpc.sectors.list.useQuery();
  const { data: allUsers = [] } = trpc.users.list.useQuery();
  const technicians = (allUsers as any[]).filter((u: any) => u.role === "technician" && u.isActive !== false);
  const reassignMut = trpc.distributions.reassign.useMutation({
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم إعادة التوزيع بنجاح" : "Reassigned successfully");
      setShowReassignDialog(false);
      setReassignTechId("");
      setReassignNotes("");
      refetchSample();
      refetchDist();
      refetchHistory();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!sample) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Sample not found</div>
      </DashboardLayout>
    );
  }

  const dist = distributions?.[0];
  const result = results?.[0];
  const chartsData = result?.chartsData as any;
  const rawValues: number[] = chartsData?.values ?? [];
  const avg = parseFloat(result?.average ?? "0");
  const minVal = dist?.minAcceptable ? parseFloat(dist.minAcceptable) : null;
  const maxVal = dist?.maxAcceptable ? parseFloat(dist.maxAcceptable) : null;

  const trendData = rawValues.map((v, i) => ({ name: `R${i + 1}`, value: v }));
  const barData = rawValues.map((v, i) => ({
    name: `R${i + 1}`,
    value: v,
    fill: (minVal == null || v >= minVal) && (maxVal == null || v <= maxVal) ? "#22c55e" : "#ef4444",
  }));

  const sectorStr = sectorLabel((sample as any).sector, lang, sectors as any[]);

  // تحديد نوع الوثيقة حسب حالة العينة
  const printDocType = (() => {
    const s = sample.status as string;
    if (s === "clearance_issued") return "clearance" as const;
    if (["qc_passed", "qc_failed"].includes(s)) return "clearance" as const;
    if (["received", "distributed"].includes(s)) return "sample_receipt" as const;
    return "test_report" as const;
  })();

  const handleDeleteSample = async () => {
    try {
      setIsDeleting(true);
      const response = await fetch(`/api/samples/${sampleId}/delete`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Failed to delete sample");
      }
      toast.success(lang === "ar" ? "تم حذف العينة بنجاح" : "Sample deleted successfully");
      setShowDeleteDialog(false);
      setLocation("/");
    } catch (error: any) {
      toast.error(error?.message ?? (lang === "ar" ? "فشل حذف العينة" : "Failed to delete sample"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Print Header — visible only when printing */}
        <PrintHeader
          docType={printDocType}
          refNumber={sample.sampleCode}
          projectName={sample.contractName ?? undefined}
          contractorName={sample.contractorName ?? undefined}
          extraFields={[
            { label: lang === "ar" ? "القطاع" : "Sector", value: sectorStr },
            { label: lang === "ar" ? "نوع العينة" : "Sample Type", value: SAMPLE_TYPE_LABELS[(sample as any).sampleType] ?? (sample as any).sampleType },
            { label: lang === "ar" ? "تاريخ الاستلام" : "Received At", value: new Date(sample.receivedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE") },
          ]}
        />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/")}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-mono">{sample.sampleCode}</h1>
                <StatusBadge status={sample.status} />
                {/* Sector badge */}
                {(sample as any).sector && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    <Building2 className="w-3 h-3" />
                    {sectorStr}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{sample.contractorName} — {(sample as any).contractNumber ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowSimplifiedReport(true)}
            >
              <Sparkles className="w-4 h-4 text-blue-500" />
              {lang === "ar" ? "تقرير مبسّط" : "Simple Report"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                // Build a dedicated receipt window with receiver's signature
                const receiverName = user?.name || user?.username || (lang === "ar" ? "موظف الاستقبال" : "Reception Officer");
                const today = new Date().toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE", { year: "numeric", month: "long", day: "numeric" });
                const sampleTypeLabel = SAMPLE_TYPE_LABELS[(sample as any).sampleType] ?? (sample as any).sampleType;
                const sectorVal = sectorLabel((sample as any).sector, lang);
                const receiptWindow = window.open("", "_blank");
                if (!receiptWindow) return;
                receiptWindow.document.write(`
<!DOCTYPE html>
<html lang="${lang === "ar" ? "ar" : "en"}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
  <meta charset="UTF-8" />
  <title>${lang === "ar" ? "وصل استلام عينة" : "Sample Receipt"} – ${sample.sampleCode}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'IBM Plex Sans Arabic', Arial, sans-serif; direction: ${lang === "ar" ? "rtl" : "ltr"}; color: #1a1a1a; background: #fff; padding: 30px 40px; font-size: 13px; line-height: 1.8; }
    .header { text-align: center; border-bottom: 3px double #1a3a6b; padding-bottom: 14px; margin-bottom: 20px; }
    .header h1 { font-size: 17px; font-weight: 700; color: #1a3a6b; }
    .header h2 { font-size: 13px; color: #555; margin-top: 3px; }
    .receipt-title { font-size: 15px; font-weight: 700; text-align: center; margin: 14px 0; padding: 7px; background: #f0f4ff; border-${lang === "ar" ? "right" : "left"}: 4px solid #1a3a6b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12.5px; }
    td { padding: 7px 10px; border: 1px solid #ddd; }
    td:first-child { background: #f5f7fa; font-weight: 600; width: 38%; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 50px; gap: 40px; }
    .sig-box { text-align: center; flex: 1; font-size: 12px; }
    .sig-line { border-top: 1px solid #333; margin-top: 45px; margin-bottom: 5px; }
    .footer { margin-top: 30px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 8px; display: flex; justify-content: space-between; }
    @media print { body { padding: 15mm; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${lang === "ar" ? "مختبر الإنشاءات والمواد الهندسية" : "Construction & Engineering Materials Laboratory"}</h1>
    <h2>${lang === "ar" ? "Construction & Engineering Materials Laboratory" : "مختبر الإنشاءات والمواد الهندسية"}</h2>
  </div>
  <div class="receipt-title">${lang === "ar" ? "وصل استلام عينة" : "Sample Receipt"}</div>
  <table>
    <tr><td>${lang === "ar" ? "رقم العينة" : "Sample Code"}</td><td><strong>${sample.sampleCode}</strong></td></tr>
    <tr><td>${lang === "ar" ? "رقم العقد" : "Contract No."}</td><td>${(sample as any).contractNumber ?? "—"}</td></tr>
    <tr><td>${lang === "ar" ? "اسم المشروع" : "Project Name"}</td><td>${sample.contractName ?? "—"}</td></tr>
    <tr><td>${lang === "ar" ? "المقاول" : "Contractor"}</td><td>${sample.contractorName ?? "—"}</td></tr>
    <tr><td>${lang === "ar" ? "القطاع" : "Sector"}</td><td>${sectorVal}</td></tr>
    <tr><td>${lang === "ar" ? "نوع المادة" : "Material Type"}</td><td>${sampleTypeLabel}</td></tr>
    <tr><td>${lang === "ar" ? "عدد العينات" : "Specimens"}</td><td>${(sample as any).quantity ?? 1}</td></tr>
    <tr><td>${lang === "ar" ? "حالة العينة" : "Condition"}</td><td>${(sample as any).condition ?? "—"}</td></tr>
    <tr><td>${lang === "ar" ? "تاريخ الاستلام" : "Received At"}</td><td>${new Date(sample.receivedAt).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE")}</td></tr>
    ${(sample as any).notes ? `<tr><td>${lang === "ar" ? "ملاحظات" : "Notes"}</td><td>${(sample as any).notes}</td></tr>` : ""}
  </table>
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>${lang === "ar" ? "توقيع مندوب المقاول" : "Contractor Representative"}</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div>${lang === "ar" ? "المستلم" : "Received By"}: <strong>${receiverName}</strong></div>
    </div>
  </div>
  <div class="footer">
    <span>${lang === "ar" ? "تاريخ الطباعة" : "Printed"}: ${today}</span>
    <span>${lang === "ar" ? "نظام إدارة المختبر" : "Lab Management System"}</span>
  </div>
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`);
                receiptWindow.document.close();
              }}
            >
              <Printer className="w-4 h-4 text-green-600" />
              {lang === "ar" ? "وصل استلام" : "Receipt"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => window.print()}
            >
              <Printer className="w-4 h-4" />
              {lang === "ar" ? "طباعة" : "Print"}
            </Button>
            {user?.role === "admin" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-red-600 hover:text-red-700"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4" />
                {lang === "ar" ? "حذف العينة" : "Delete Sample"}
              </Button>
            )}
          </div>
        </div>

        {/* Workflow Progress — internal only, hidden on print */}
        <Card className="print:hidden">
          <CardContent className="pt-4 pb-4">
            <WorkflowProgress status={sample.status as any} />
          </CardContent>
        </Card>

        {/* Sample Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {lang === "ar" ? "معلومات العينة" : "Sample Information"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0 text-sm divide-y divide-border/50">
              {[
                { label: lang === "ar" ? "رقم العينة" : "Sample Code", value: sample.sampleCode },
                { label: lang === "ar" ? "نوع المادة" : "Material Type", value: SAMPLE_TYPE_LABELS[(sample as any).sampleType] ?? (sample as any).sampleType },
                {
                  label: lang === "ar" ? "القطاع" : "Sector",
                  value: (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                      <Building2 className="w-3 h-3" />
                      {sectorStr}
                    </span>
                  ),
                },
                { label: lang === "ar" ? "رقم العقد" : "Contract Number", value: (sample as any).contractNumber ?? "—" },
                { label: lang === "ar" ? "اسم المشروع" : "Project Name", value: (sample as any).contractName ?? "—" },
                { label: lang === "ar" ? "المقاول" : "Contractor", value: (sample as any).contractorName ?? "—" },
                { label: lang === "ar" ? "الكمية" : "Quantity", value: (sample as any).quantity?.toString() },
                { label: lang === "ar" ? "الحالة" : "Condition", value: (sample as any).condition },
                { label: lang === "ar" ? "تاريخ الاستلام" : "Received At", value: new Date(sample.receivedAt).toLocaleString(lang === "ar" ? "ar-AE" : "en-AE") },
              ].map(({ label, value }) => (
                <div key={String(label)} className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground text-xs">{label}</span>
                  <span className="font-medium capitalize text-xs text-right">{value}</span>
                </div>
              ))}
              {(sample as any).notes && (
                <div className="pt-2">
                  <p className="text-muted-foreground text-xs">{lang === "ar" ? "ملاحظات" : "Notes"}</p>
                  <p className="text-xs mt-1">{(sample as any).notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Distribution Info — internal only, hidden on print */}
          {dist && (
            <Card className="print:hidden">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">{lang === "ar" ? "أمر التوزيع" : "Distribution Order"}</CardTitle>
                {(user?.role === "admin" || user?.role === "lab_manager") && ["distributed", "testing", "processing"].includes(sample.status as string) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 gap-1 text-xs"
                    onClick={() => setShowReassignDialog(true)}
                  >
                    <RefreshCw className="w-3 h-3" />
                    {lang === "ar" ? "إعادة التوزيع" : "Reassign"}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-0 text-sm divide-y divide-border/50">
                {/* Test type change warning */}
                {(dist as any).originalTestType && (
                  <div className="mb-2 p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
                      <span>⚠️</span>
                      <span>{lang === "ar" ? "تم تغيير نوع الاختبار بواسطة موظف التوزيع" : "Test type changed by distribution officer"}</span>
                    </div>
                    <div className="text-amber-700">
                      <span className="text-muted-foreground">{lang === "ar" ? "الأصلي:" : "Original:"} </span>
                      <span className="font-mono line-through opacity-60">{(dist as any).originalTestType}</span>
                    </div>
                    {(dist as any).testTypeChangedNote && (
                      <div className="mt-1 text-amber-700">
                        <span className="text-muted-foreground">{lang === "ar" ? "السبب:" : "Reason:"} </span>
                        <span>{(dist as any).testTypeChangedNote}</span>
                      </div>
                    )}
                  </div>
                )}
                {[
                  { label: lang === "ar" ? "رقم الأمر" : "Order Code", value: dist.distributionCode },
                  { label: lang === "ar" ? "الاختبار" : "Test", value: dist.testName },
                  { label: lang === "ar" ? "عدد العينات" : "Specimens", value: String(dist.quantity ?? 1) },
                  { label: lang === "ar" ? "سعر الوحدة" : "Unit Price", value: dist.unitPrice ? `${Number(dist.unitPrice).toFixed(2)} ${lang === "ar" ? "درهم" : "AED"}` : "—" },
                  { label: lang === "ar" ? "التكلفة الإجمالية" : "Total Cost", value: dist.totalCost ? `${Number(dist.totalCost).toFixed(2)} ${lang === "ar" ? "درهم" : "AED"}` : "—" },
                  { label: lang === "ar" ? "الأولوية" : "Priority", value: dist.priority },
                  { label: lang === "ar" ? "تاريخ الاستحقاق" : "Due Date", value: dist.expectedCompletionDate ? new Date(dist.expectedCompletionDate).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-AE") : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground text-xs">{label}</span>
                    <span className={"font-medium capitalize text-xs " + ((label.indexOf('إجمال') >= 0 || label.indexOf('Total') >= 0) ? 'text-green-700 font-bold' : '')}>{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Test Results */}
        {result && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{lang === "ar" ? "نتائج الاختبار والتحليل" : "Test Results & Analysis"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: lang === "ar" ? "المتوسط" : "Average", value: `${result.average} ${result.unit}`, color: "text-blue-700" },
                  { label: lang === "ar" ? "الانحراف المعياري" : "Std Deviation", value: result.stdDeviation ?? "—", color: "text-purple-700" },
                  { label: lang === "ar" ? "نسبة الامتثال" : "Compliance %", value: result.percentage ? `${result.percentage}%` : "—", color: "text-teal-700" },
                  { label: lang === "ar" ? "الحالة" : "Status", value: result.complianceStatus?.toUpperCase() ?? "—", color: result.complianceStatus === "pass" ? "text-green-700" : "text-red-700" },
                ].map((s) => (
                  <div key={s.label} className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {rawValues.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Trend Line */}
                  <div className="bg-slate-50/60 rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      {lang === "ar" ? "خط الاتجاه" : "Trend Line"}
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={trendData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={36}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                          itemStyle={{ color: "#3b82f6" }}
                          formatter={(val: number) => [`${val} ${result.unit}`, lang === "ar" ? "القيمة" : "Value"]}
                        />
                        {minVal != null && (
                          <ReferenceLine y={minVal} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1.5} />
                        )}
                        {maxVal != null && (
                          <ReferenceLine y={maxVal} stroke="#f97316" strokeDasharray="4 3" strokeWidth={1.5} />
                        )}
                        <ReferenceLine y={avg} stroke="#3b82f6" strokeDasharray="4 3" strokeWidth={1.5} />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#3b82f6"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: "#3b82f6", strokeWidth: 2, stroke: "#fff" }}
                          activeDot={{ r: 6, fill: "#2563eb", stroke: "#fff", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    {/* Legend below chart */}
                    <div className="flex flex-wrap items-center gap-3 mt-2 px-1">
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="w-4 border-t-2 border-blue-500 border-dashed inline-block" />
                        {lang === "ar" ? `المتوسط (${avg})` : `Avg (${avg})`}
                      </span>
                      {minVal != null && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <span className="w-4 border-t-2 border-red-500 border-dashed inline-block" />
                          {lang === "ar" ? `حد أدنى (${minVal})` : `Min (${minVal})`}
                        </span>
                      )}
                      {maxVal != null && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                          <span className="w-4 border-t-2 border-orange-500 border-dashed inline-block" />
                          {lang === "ar" ? `حد أعلى (${maxVal})` : `Max (${maxVal})`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bar Chart */}
                  <div className="bg-slate-50/60 rounded-xl p-3">
                    <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-sm bg-teal-500 inline-block" />
                      {lang === "ar" ? "مقارنة القراءات" : "Readings Comparison"}
                    </p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={barData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }} barCategoryGap="35%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: "#94a3b8" }}
                          axisLine={false}
                          tickLine={false}
                          width={36}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                          formatter={(val: number) => [`${val} ${result.unit}`, lang === "ar" ? "القيمة" : "Value"]}
                        />
                        <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                          {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    {/* Legend below chart */}
                    <div className="flex items-center gap-3 mt-2 px-1">
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" />
                        {lang === "ar" ? "مطابق" : "Pass"}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-500">
                        <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" />
                        {lang === "ar" ? "غير مطابق" : "Fail"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {result.testNotes && (
                <div className="text-xs bg-muted/30 rounded p-2 print:hidden">
                  <span className="font-medium">{lang === "ar" ? "ملاحظات الفني:" : "Technician Notes:"}</span> {result.testNotes}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Print Signatures — visible only when printing */}
        <div className="hidden print:block mt-10 pt-6 border-t border-gray-300">
          <div className="grid grid-cols-3 gap-8 text-center text-xs text-gray-600">
            {[
              lang === "ar" ? "موظف الاستقبال" : "Reception Staff",
              lang === "ar" ? "الفاحص / التقني" : "Technician",
              lang === "ar" ? "مدير المختبر" : "Lab Manager",
            ].map((label) => (
              <div key={label}>
                <div className="border-b border-gray-400 mb-2 h-10" />
                <p>{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Reviews — internal only, hidden on print */}
        {reviews && reviews.length > 0 && (
          <Card className="print:hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {lang === "ar" ? "سجل المراجعات" : "Review History"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="border rounded-lg p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold capitalize">{review.reviewType.replace(/_/g, " ")}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      review.decision === "approved" ? "bg-green-100 text-green-800" :
                      review.decision === "needs_revision" ? "bg-amber-100 text-amber-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {review.decision.replace(/_/g, " ")}
                    </span>
                  </div>
                  {review.comments && <p className="text-muted-foreground">{review.comments}</p>}
                  {review.signature && <p><span className="text-muted-foreground">{lang === "ar" ? "التوقيع:" : "Signed:"}</span> {review.signature}</p>}
                  <p className="text-muted-foreground">{new Date(review.createdAt).toLocaleString(lang === "ar" ? "ar-AE" : "en-AE")}</p>
                </div>
                ))}
              </CardContent>
          </Card>
        )}

        {/* History Timeline — internal only, hidden on print */}
        {history && history.length > 0 && (
          <Card className="print:hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {lang === "ar" ? "سجل النشاط" : "Activity Timeline"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((h, i) => (
                  <div key={h.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      {i < history.length - 1 && <div className="w-0.5 bg-border flex-1 mt-1" />}
                    </div>
                    <div className="pb-3 flex-1">
                      <p className="text-xs font-medium">{h.action}</p>
                      {h.notes && <p className="text-xs text-muted-foreground mt-0.5">{h.notes}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(h.createdAt).toLocaleString(lang === "ar" ? "ar-AE" : "en-AE")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Simplified Report Modal */}
      <SimplifiedReportModal
        open={showSimplifiedReport}
        onClose={() => setShowSimplifiedReport(false)}
        sampleId={sampleId}
      />

      {/* Reassign Distribution Dialog */}
      <Dialog open={showReassignDialog} onOpenChange={(o) => !o && setShowReassignDialog(false)}>
        <DialogContent className="max-w-md" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="text-base">
              {lang === "ar" ? "إعادة توزيع العينة" : "Reassign Sample"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-muted/40 rounded-lg p-3 text-xs">
              <span className="text-muted-foreground">{lang === "ar" ? "العينة:" : "Sample:"} </span>
              <span className="font-mono font-semibold">{sample?.sampleCode}</span>
              {dist && (
                <>
                  <span className="mx-2 text-muted-foreground">|</span>
                  <span className="text-muted-foreground">{lang === "ar" ? "الفني الحالي:" : "Current Technician:"} </span>
                  <span className="font-medium">{(dist as any).technicianName ?? "—"}</span>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{lang === "ar" ? "الفني الجديد" : "New Technician"}</Label>
              <Select value={reassignTechId} onValueChange={setReassignTechId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={lang === "ar" ? "اختر فنياً" : "Select technician"} />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{lang === "ar" ? "سبب إعادة التوزيع (اختياري)" : "Reason (optional)"}</Label>
              <Textarea
                className="text-sm resize-none"
                rows={2}
                value={reassignNotes}
                onChange={(e) => setReassignNotes(e.target.value)}
                placeholder={lang === "ar" ? "مثل: غياب الفني الأصلي" : "e.g. Original technician absent"}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowReassignDialog(false)}>
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                size="sm"
                disabled={!reassignTechId || reassignMut.isPending}
                onClick={() => {
                  if (!dist || !reassignTechId) return;
                  reassignMut.mutate({
                    distributionId: dist.id,
                    newTechnicianId: parseInt(reassignTechId),
                    notes: reassignNotes || undefined,
                  });
                }}
              >
                {reassignMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {lang === "ar" ? "تأكيد إعادة التوزيع" : "Confirm Reassign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => !isDeleting && setShowDeleteDialog(open)}>
        <AlertDialogContent dir={lang === "ar" ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "ar" ? "تأكيد حذف العينة" : "Confirm Sample Deletion"}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this sample? This action will mark it as deleted and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSample} disabled={isDeleting}>
              {isDeleting ? (lang === "ar" ? "جارٍ الحذف..." : "Deleting...") : (lang === "ar" ? "حذف" : "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
