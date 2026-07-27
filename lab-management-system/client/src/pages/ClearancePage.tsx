import { ListFilterBar } from "@/components/ListFilterBar";
import { applyClearanceFilters, hasActiveListFilters } from "@/lib/listFilters";
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { History } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  Plus, CheckCircle, Clock, XCircle, Upload, Printer,
  ChevronRight, FlaskConical,
  AlertTriangle, BadgeCheck, FileCheck, Receipt, ClipboardList, Globe,
  CheckCircle2, FileText, Award,
} from "lucide-react";
import { openClearanceCertificatePrint } from "@/lib/clearanceCertificatePrint";

// ─── Task state helpers ─────────────────────────────────────────────────────
type TaskFilter = "all" | "new" | "incomplete" | "completed";

function getClearanceTaskState(req: any): "new" | "incomplete" | "completed" {
  if (req.status === "issued" || req.status === "rejected") return "completed";
  if (req.accountantReadAt) return "incomplete";
  return "new";
}

function TaskStateBadge({ state, lang }: { state: "new" | "incomplete" | "completed"; lang: Lang }) {
  if (state === "new")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block animate-pulse" />
        {lang === "ar" ? "جديدة" : "New"}
      </span>
    );
  if (state === "incomplete")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        <Clock className="w-3 h-3" />
        {lang === "ar" ? "غير مكتملة" : "Incomplete"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
      <CheckCircle2 className="w-3 h-3" />
      {lang === "ar" ? "مُنجزة" : "Completed"}
    </span>
  );
}

// ─── i18n strings ──────────────────────────────────────────────────────────────
const T = {
  pageTitle:         { ar: "استخراج شهادة براءة الذمة",               en: "Clearance Certificate" },
  pageSubtitle:      { ar: "إدارة طلبات شهادة براءة الذمة للمقاولين — جرد الاختبارات، أوامر الدفع، والشهادات الرسمية",
                       en: "Manage contractor clearance requests — test inventory, payment orders, and official certificates" },
  newRequest:        { ar: "طلب براءة ذمة جديد",                en: "New Clearance Request" },
  totalRequests:     { ar: "إجمالي الطلبات",                    en: "Total Requests" },
  inProgress:        { ar: "قيد المعالجة",                      en: "In Progress" },
  issued:            { ar: "صادرة",                             en: "Issued" },
  rejected:          { ar: "مرفوضة",                            en: "Rejected" },
  requestsTable:     { ar: "طلبات شهادة براءة الذمة",                 en: "Clearance Requests" },
  noRequests:        { ar: "لا توجد طلبات براءة ذمة بعد",       en: "No clearance requests yet" },
  noRequestsHint:    { ar: "أنشئ طلباً جديداً لبدء عملية التخليص", en: "Create a new request to start the clearance process" },
  colRequest:        { ar: "رقم الطلب",                         en: "Request No." },
  colContractor:     { ar: "المقاول",                           en: "Contractor" },
  colContract:       { ar: "رقم العقد",                         en: "Contract No." },
  colTests:          { ar: "الاختبارات",                        en: "Tests" },
  colTotal:          { ar: "الإجمالي (درهم)",                   en: "Total (AED)" },
  colStatus:         { ar: "الحالة",                            en: "Status" },
  colDate:           { ar: "التاريخ",                           en: "Date" },
  colActions:        { ar: "إجراءات",                           en: "Actions" },
  details:           { ar: "تفاصيل",                            en: "Details" },
  detailsTitle:      { ar: "تفاصيل طلب شهادة براءة الذمة",            en: "Clearance Request Details" },
  // Status labels
  statusPending:     { ar: "بانتظار مراجعة QC",                 en: "Awaiting QC Review" },
  statusInventory:   { ar: "موافقة QC",                         en: "QC Approved" },
  statusPayment:     { ar: "بانتظار الدفع",                     en: "Awaiting Payment" },
  statusDocs:        { ar: "المستندات مرفوعة",                  en: "Docs Uploaded" },
  statusIssued:      { ar: "صدرت شهادة براءة الذمة",                  en: "Certificate Issued" },
  statusRejected:    { ar: "مرفوض",                             en: "Rejected" },
  // Workflow steps
  step1:             { ar: "طلب شهادة براءة الذمة",                   en: "Request" },
  step2:             { ar: "مراجعة QC",                         en: "QC Review" },
  step3:             { ar: "أمر الدفع",                         en: "Payment Order" },
  step4:             { ar: "رفع المستندات",                     en: "Upload Docs" },
  step5:             { ar: "إصدار شهادة براءة الذمة",                 en: "Issue Certificate" },
  // QC step
  qcStep:            { ar: "الخطوة 1: مراجعة QC وتأكيد الاختبارات", en: "Step 1: QC Review & Test Confirmation" },
  qcApproved:        { ar: "تمت موافقة QC على الاختبارات المنجزة",  en: "QC has approved the completed tests" },
  qcHint:            { ar: "مراجعة قائمة الاختبارات أدناه وتأكيد اكتمالها", en: "Review the test list below and confirm completion" },
  qcNotes:           { ar: "ملاحظات QC (اختياري)...",            en: "QC notes (optional)..." },
  qcApproveBtn:      { ar: "موافقة QC وتأكيد الاختبارات",        en: "Approve & Confirm Tests" },
  qcApproving:       { ar: "جاري التأكيد...",                    en: "Confirming..." },
  // Payment step
  payStep:           { ar: "الخطوة 2: إصدار أمر الدفع",         en: "Step 2: Issue Payment Order" },
  payBlocked:        { ar: "يجب موافقة QC على الاختبارات أولاً قبل إصدار أمر الدفع.", en: "QC must approve tests before issuing a payment order." },
  payOrderNo:        { ar: "رقم أمر الدفع:",                     en: "Payment Order No.:" },
  receiptNo:          { ar: "رقم وصل الدفع:",                    en: "Payment Receipt No.:" },
  receiptNoPlaceholder:{ ar: "أدخل رقم الوصل الرسمي...",          en: "Enter official receipt number..." },
  receiptNoHint:      { ar: "رقم الوصل المطبوع الذي يحمله المقاول بعد الدفع",  en: "The printed receipt number the contractor brings after payment" },
  saveReceiptNo:      { ar: "حفظ رقم الوصل",                    en: "Save Receipt No." },
  receiptNoSaved:     { ar: "تم حفظ رقم الوصل",                  en: "Receipt number saved" },
  payPrint:          { ar: "طباعة أمر الدفع",                    en: "Print Payment Order" },
  payInstructions:   { ar: "تعليمات للمقاول:",                   en: "Instructions for Contractor:" },
  payInstructionsTxt:{ ar: "يرجى طباعة أمر الدفع وتسليمه للمقاول لسداد المبلغ في خزينة المختبر.", en: "Please print the payment order and hand it to the contractor to pay at the lab cashier." },
  payHint:           { ar: "سيُولَّد رقم أمر الدفع تلقائياً بصيغة PO-YYYY-NNNN", en: "A payment order number will be auto-generated in PO-YYYY-NNNN format" },
  payIssue:          { ar: "إصدار أمر الدفع",                    en: "Issue Payment Order" },
  payIssuing:        { ar: "جاري الإصدار...",                    en: "Issuing..." },
  // Docs step
  docsStep:          { ar: "الخطوة 3: رفع المستندات المطلوبة",   en: "Step 3: Upload Required Documents" },
  docView:           { ar: "عرض",                                en: "View" },
  docUpdate:         { ar: "تحديث",                              en: "Update" },
  docUpload:         { ar: "رفع",                                en: "Upload" },
  // Cert step
  certStep:          { ar: "الخطوة 4: إصدار شهادة براءة الذمة",        en: "Step 4: Issue Clearance Certificate" },
  certNo:            { ar: "رقم الشهادة:",                       en: "Certificate No.:" },
  certPrint:         { ar: "طباعة شهادة براءة الذمة",                  en: "Print Certificate" },
  certPrintOfficial: { ar: "طباعة الشهادة الرسمية (PDF)",            en: "Print Official Certificate (PDF)" },
  certPrintHint:     { ar: "اطبع الشهادة الرسمية لتسليمها للمقاول أو القطاع", en: "Print the official certificate to hand over to the contractor or sector" },
  certIssuedTitle:   { ar: "تم إصدار شهادة براءة الذمة",               en: "Clearance Certificate Issued" },
  certIssuedAt:      { ar: "تاريخ الإصدار:",                         en: "Issued on:" },
  certViewPrint:     { ar: "عرض وطباعة",                             en: "View & Print" },
  certNotes:         { ar: "ملاحظات إضافية (اختياري)...",        en: "Additional notes (optional)..." },
  certIssue:         { ar: "إصدار شهادة براءة الذمة الرسمية",          en: "Issue Official Certificate" },
  certIssuing:       { ar: "جاري الإصدار...",                    en: "Issuing..." },
  certBlocked:       { ar: "يجب رفع كتاب المقاول وكتاب القطاع وإيصال الدفع أولاً", en: "Contractor letter, sector letter, and payment receipt must be uploaded first" },
  // Inventory table
  invTitle:          { ar: "جرد الاختبارات",                     en: "Test Inventory" },
  invSampleCode:     { ar: "كود العينة",                         en: "Sample Code" },
  invTestType:       { ar: "نوع الاختبار",                       en: "Test Type" },
  invStandard:       { ar: "المعيار",                            en: "Standard" },
  invResult:         { ar: "النتيجة",                            en: "Result" },
  invPrice:          { ar: "السعر (درهم)",                       en: "Price (AED)" },
  invPass:           { ar: "✓ مطابق",                            en: "✓ Pass" },
  invFail:           { ar: "✗ غير مطابق",                        en: "✗ Fail" },
  invPending:        { ar: "قيد الفحص",                          en: "Pending" },
  invTotal:          { ar: "الإجمالي:",                          en: "Total:" },
  // New dialog
  newTitle:          { ar: "طلب استخراج شهادة براءة الذمة",            en: "New Clearance Request" },
  newContract:       { ar: "العقد",                              en: "Contract" },
  newSelectContract: { ar: "اختر العقد...",                      en: "Select contract..." },
  newContractor:     { ar: "المقاول:",                           en: "Contractor:" },
  newProject:        { ar: "المشروع:",                           en: "Project:" },
  newNotes:          { ar: "ملاحظات (اختياري)",                  en: "Notes (optional)" },
  newNotesPlaceholder:{ ar: "أي ملاحظات إضافية...",             en: "Any additional notes..." },
  newInfo:           { ar: "سيتم جرد جميع الاختبارات المنجزة لهذا العقد تلقائياً وحساب إجمالي المبلغ المستحق.", en: "All completed tests for this contract will be inventoried automatically and the total amount calculated." },
  newCreate:         { ar: "إنشاء الطلب وجرد الاختبارات",        en: "Create Request & Inventory Tests" },
  newCreating:       { ar: "جاري الإنشاء...",                    en: "Creating..." },
  newSelectFirst:    { ar: "يرجى اختيار العقد",                  en: "Please select a contract" },
  // Print language selector
  printLang:         { ar: "لغة الطباعة",                        en: "Print Language" },
  printAr:           { ar: "عربي",                               en: "Arabic" },
  printEn:           { ar: "إنجليزي",                            en: "English" },
  // Toast messages
  toastQcApproved:   { ar: "تمت موافقة QC وتأكيد الاختبارات",   en: "QC approved and tests confirmed" },
  toastPayIssued:    { ar: "تم إصدار أمر الدفع:",                en: "Payment order issued:" },
  toastDocUploaded:  { ar: "تم رفع المستند",                     en: "Document uploaded" },
  toastCertIssued:   { ar: "تم إصدار شهادة براءة الذمة!",              en: "Clearance certificate issued!" },
  toastCreated:      { ar: "تم إنشاء طلب شهادة براءة الذمة:",          en: "Clearance request created:" },
};

type Lang = "ar" | "en";
const t = (key: keyof typeof T, lang: Lang) => T[key][lang];

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { labelKey: keyof typeof T; color: string; icon: any; step: number }> = {
  pending:         { labelKey: "statusPending",   color: "bg-yellow-100 text-yellow-800 border border-yellow-300", icon: Clock,        step: 1 },
  inventory_ready: { labelKey: "statusInventory", color: "bg-blue-100 text-blue-800 border border-blue-300",       icon: CheckCircle,  step: 2 },
  payment_ordered: { labelKey: "statusPayment",   color: "bg-purple-100 text-purple-800 border border-purple-300", icon: Receipt,      step: 3 },
  docs_uploaded:   { labelKey: "statusDocs",      color: "bg-indigo-100 text-indigo-800 border border-indigo-300", icon: FileCheck,    step: 4 },
  issued:          { labelKey: "statusIssued",    color: "bg-green-100 text-green-800 border border-green-300",    icon: BadgeCheck,   step: 5 },
  rejected:        { labelKey: "statusRejected",  color: "bg-red-100 text-red-800 border border-red-300",          icon: XCircle,      step: 0 },
};

const WORKFLOW_STEPS: Array<{ step: number; labelKey: keyof typeof T }> = [
  { step: 1, labelKey: "step1" },
  { step: 2, labelKey: "step2" },
  { step: 3, labelKey: "step3" },
  { step: 4, labelKey: "step4" },
  { step: 5, labelKey: "step5" },
];

const DOCS: Array<{ key: string; labelAr: string; labelEn: string; urlField: string }> = [
  { key: "contractorLetter", labelAr: "كتاب المقاول",     labelEn: "Contractor Letter",  urlField: "contractorLetterUrl" },
  { key: "sectorLetter",     labelAr: "كتاب القطاع",      labelEn: "Sector Letter",      urlField: "sectorLetterUrl" },
  { key: "paymentReceipt",   labelAr: "إيصال الدفع",      labelEn: "Payment Receipt",    urlField: "paymentReceiptUrl" },
];

// ─── Sub-components ────────────────────────────────────────────────────────────
function WorkflowStepper({ status, lang }: { status: string; lang: Lang }) {
  const currentStep = STATUS_CONFIG[status]?.step ?? 1;
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {WORKFLOW_STEPS.map((s, i) => {
        const done = currentStep > s.step;
        const active = currentStep === s.step;
        return (
          <div key={s.step} className="flex items-center shrink-0">
            <div className={`flex flex-col items-center min-w-[88px] ${active ? "opacity-100" : done ? "opacity-80" : "opacity-35"}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold
                ${done ? "bg-green-500 border-green-500 text-white" : active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-400"}`}>
                {done ? <CheckCircle className="w-4 h-4" /> : <span>{s.step}</span>}
              </div>
              <span className={`text-[11px] mt-1.5 text-center leading-tight max-w-[84px] ${active ? "text-blue-700 font-semibold" : done ? "text-green-700" : "text-gray-400"}`}>
                {t(s.labelKey, lang)}
              </span>
            </div>
            {i < WORKFLOW_STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mb-5 shrink-0 ${done ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status, lang }: { status: string; lang: Lang }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
      <Icon size={12} />
      {t(cfg.labelKey, lang)}
    </span>
  );
}
// ─── Print helpers ──────────────────────────────────────────────────────────────────────────────────────
function buildInventoryHtml(req: any, inventory: any[], printLang: Lang): string {
  const isAr = printLang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const today = new Date().toLocaleDateString(isAr ? "ar-AE" : "en-AE", { year: "numeric", month: "long", day: "numeric" });
  const rows = inventory.map((item: any, i: number) => {
    const testName = isAr ? (item.testNameAr || item.testName) : (item.testName || item.testNameAr);
    const resultClass = item.result === "pass" ? "pass" : item.result === "fail" ? "fail" : "";
    const resultLabel = item.result === "pass" ? (isAr ? "✓ مطابق" : "✓ Pass") : item.result === "fail" ? (isAr ? "✗ غير مطابق" : "✗ Fail") : (isAr ? "قيد الفحص" : "Pending");
    return `<tr><td>${i + 1}</td><td class="mono">${item.sampleCode}</td><td>${testName}</td><td>${item.standard ?? "—"}</td><td class="${resultClass}">${resultLabel}</td><td>${Number(item.price).toFixed(2)}</td></tr>`;
  }).join("");
  return `<html dir="${dir}"><head><meta charset="UTF-8"><title>${isAr ? "جرد الاختبارات" : "Test Inventory"}</title><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${isAr ? "'IBM Plex Sans Arabic', Arial" : "Arial, sans-serif"}; direction: ${dir}; padding: 30px; color: #1a1a1a; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px; }
    .lab-name { font-size: 18px; font-weight: bold; color: #1e3a5f; }
    .lab-sub { font-size: 11px; color: #666; margin-top: 3px; }
    .doc-title { font-size: 16px; font-weight: bold; color: #1e3a5f; text-align: center; margin-bottom: 16px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #ccc; margin-bottom: 16px; }
    .info-cell { padding: 7px 12px; border-bottom: 1px solid #e0e0e0; }
    .info-cell:nth-child(odd) { border-${isAr ? "left" : "right"}: 1px solid #e0e0e0; }
    .info-label { font-size: 10px; color: #888; margin-bottom: 2px; }
    .info-value { font-size: 13px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    thead tr { background: #1e3a5f; color: white; }
    th { padding: 8px 10px; text-align: ${isAr ? "right" : "left"}; font-weight: 600; }
    td { padding: 7px 10px; border-bottom: 1px solid #e8e8e8; text-align: ${isAr ? "right" : "left"}; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .mono { font-family: monospace; font-weight: bold; }
    .pass { color: #16a34a; font-weight: 600; }
    .fail { color: #dc2626; font-weight: 600; }
    .total-row { background: #1e3a5f !important; }
    .total-row td { color: white; font-weight: bold; border: none; }
    @media print { body { padding: 20px; } }
  </style></head><body>
  <div class="header">
    <div><div class="lab-name">${isAr ? "مختبر الإنشاءات والمواد الهندسية" : "Construction Materials & Engineering Laboratory"}</div><div class="lab-sub">${isAr ? "Construction Materials & Engineering Laboratory" : "مختبر الإنشاءات والمواد الهندسية"}</div></div>
    <div style="text-align:${isAr ? "left" : "right"}"><div style="font-size:11px;color:#666">${isAr ? "تاريخ:" : "Date:"} ${today}</div><div style="font-size:11px;color:#666">${isAr ? "رقم الطلب:" : "Request No.:"} ${req.requestCode}</div></div>
  </div>
  <div class="doc-title">${isAr ? "جرد الاختبارات المنجزة" : "Completed Tests Inventory"}</div>
  <div class="info-grid">
    <div class="info-cell"><div class="info-label">${isAr ? "المقاول" : "Contractor"}</div><div class="info-value">${req.contractorName ?? "—"}</div></div>
    <div class="info-cell"><div class="info-label">${isAr ? "رقم العقد" : "Contract No."}</div><div class="info-value">${req.contractNumber ?? "—"}</div></div>
    <div class="info-cell"><div class="info-label">${isAr ? "اسم المشروع" : "Project"}</div><div class="info-value">${req.contractName ?? "—"}</div></div>
    <div class="info-cell"><div class="info-label">${isAr ? "عدد الاختبارات" : "Total Tests"}</div><div class="info-value">${inventory.length}</div></div>
  </div>
  <table><thead><tr>
    <th style="width:30px">#</th>
    <th>${isAr ? "كود العينة" : "Sample Code"}</th>
    <th>${isAr ? "نوع الاختبار" : "Test Type"}</th>
    <th>${isAr ? "المعيار" : "Standard"}</th>
    <th>${isAr ? "النتيجة" : "Result"}</th>
    <th>${isAr ? "السعر (درهم)" : "Price (AED)"}</th>
  </tr></thead><tbody>
    ${rows}
    <tr class="total-row">
      <td colspan="5" style="text-align:${isAr ? "right" : "left"}">${isAr ? "الإجمالي:" : "Total:"}</td>
      <td>${Number(req.totalAmount).toFixed(2)} ${isAr ? "درهم" : "AED"}</td>
    </tr>
  </tbody></table>
  </body></html>`;
}
function buildPaymentOrderHtml(req: any, inventory: any[], printLang: Lang): string {
  const isAr = printLang === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const align = isAr ? "right" : "left";
  const alignOpp = isAr ? "left" : "right";
  const poDate = req.paymentOrderDate
    ? new Date(req.paymentOrderDate).toLocaleDateString(isAr ? "ar-AE" : "en-AE", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString(isAr ? "ar-AE" : "en-AE", { year: "numeric", month: "long", day: "numeric" });
  const printedAt = new Date().toLocaleString(isAr ? "ar-AE" : "en-AE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const passedCount = Number(req.passedTests ?? inventory.filter((i) => i.result === "pass").length);
  const failedCount = Number(req.failedTests ?? inventory.filter((i) => i.result === "fail").length);
  const testCount = Number(req.totalTests ?? inventory.length);
  const totalAmount = Number(req.totalAmount ?? inventory.reduce((s, i) => s + Number(i.price ?? 0), 0));
  const amountFormatted = `${totalAmount.toFixed(2)} ${isAr ? "درهم إ.م" : "AED"}`;

  const L = {
    docTitle: isAr ? "أمر الدفع" : "Payment Order",
    docTitleSub: isAr ? "Payment Order" : "أمر الدفع",
    labName: isAr ? "مختبر الإنشاءات والمواد الهندسية" : "Construction Materials & Engineering Laboratory",
    labNameSub: isAr ? "Construction Materials & Engineering Laboratory" : "مختبر الإنشاءات والمواد الهندسية",
    docNo: isAr ? "رقم أمر الدفع" : "Payment Order No.",
    issueDate: isAr ? "تاريخ الإصدار" : "Issue Date",
    reqNo: isAr ? "رقم طلب البراءة" : "Clearance Request No.",
    contractor: isAr ? "المقاول" : "Contractor",
    contractNo: isAr ? "رقم العقد" : "Contract No.",
    project: isAr ? "اسم المشروع" : "Project Name",
    summaryTests: isAr ? "الاختبارات" : "Tests",
    summaryPass: isAr ? "مطابق" : "Pass",
    summaryFail: isAr ? "غير مطابق" : "Fail",
    summaryTotal: isAr ? "المبلغ المستحق" : "Amount Due",
    servicesTitle: isAr ? "تفاصيل خدمات الفحص" : "Testing Services",
    colNo: "#",
    colSample: isAr ? "كود العينة" : "Sample Code",
    colTest: isAr ? "نوع الاختبار" : "Test Type",
    colStd: isAr ? "المعيار" : "Standard",
    colResult: isAr ? "النتيجة" : "Result",
    colPrice: isAr ? "المبلغ (درهم)" : "Amount (AED)",
    pass: isAr ? "مطابق" : "Pass",
    fail: isAr ? "غير مطابق" : "Fail",
    pending: isAr ? "قيد الفحص" : "Pending",
    totalLabel: isAr ? "الإجمالي المستحق" : "Total Amount Due",
    instrTitle: isAr ? "تعليمات الدفع للمقاول" : "Payment Instructions for Contractor",
    instrSteps: isAr
      ? [
          `يُرجى سداد مبلغ <strong>${amountFormatted}</strong> فقط لا غير في خزينة المختبر.`,
          "يُقدَّم هذا الأمر مع المبلغ عند الدفع للحصول على وصل رسمي.",
          "يُحتفظ بنسخة من أمر الدفع والوصل لاستكمال إجراءات شهادة براءة الذمة.",
        ]
      : [
          `Pay exactly <strong>${amountFormatted}</strong> at the laboratory cashier only.`,
          "Present this payment order when paying to receive an official receipt.",
          "Retain copies of this order and the receipt for clearance certificate processing.",
        ],
    sigContractor: isAr ? "توقيع المقاول / الختم" : "Contractor Signature / Stamp",
    sigAccountant: isAr ? "توقيع المحاسب" : "Accountant Signature",
    sigDate: isAr ? "التاريخ" : "Date",
    footerPrinted: isAr ? "طُبع في" : "Printed",
  };

  const resultBadge = (result: string) => {
    if (result === "pass") {
      return `<span class="badge badge-pass">${L.pass}</span>`;
    }
    if (result === "fail") {
      return `<span class="badge badge-fail">${L.fail}</span>`;
    }
    return `<span class="badge badge-pending">${L.pending}</span>`;
  };

  const rows = inventory.map((item: any, i: number) => {
    const testName = isAr ? (item.testNameAr || item.testName) : (item.testName || item.testNameAr);
    return `<tr>
      <td class="col-no">${i + 1}</td>
      <td class="mono">${item.sampleCode ?? "—"}</td>
      <td>${testName ?? "—"}</td>
      <td class="col-std">${item.standard ?? "—"}</td>
      <td class="col-result">${resultBadge(item.result ?? "pending")}</td>
      <td class="col-amount">${Number(item.price ?? 0).toFixed(2)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="${isAr ? "ar" : "en"}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <title>${L.docTitle} — ${req.paymentOrderNumber ?? req.requestCode}</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${isAr ? "'Segoe UI', 'IBM Plex Sans Arabic', Arial, sans-serif" : "'Segoe UI', Arial, sans-serif"};
      direction: ${dir};
      color: #0f172a;
      font-size: 12px;
      line-height: 1.45;
      background: #fff;
      padding: 0;
    }
    .page { max-width: 210mm; margin: 0 auto; }

    .top-rule { border-top: 4px solid #0f172a; padding-top: 14px; margin-bottom: 12px; }
    .header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 16px;
      align-items: start;
    }
    .logo {
      width: 56px; height: 56px;
      border: 2px solid #0f172a;
      border-radius: 50%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-weight: 900; font-size: 22px;
      line-height: 1;
    }
    .logo-sub { font-size: 8px; letter-spacing: 0.18em; margin-top: 2px; color: #64748b; }
    .lab-name { font-size: 17px; font-weight: 800; color: #0f172a; line-height: 1.25; }
    .lab-sub { font-size: 11px; color: #64748b; margin-top: 4px; }
    .doc-meta { text-align: ${alignOpp}; font-size: 11px; color: #475569; line-height: 1.7; }
    .doc-meta strong { color: #0f172a; font-weight: 700; }
    .doc-meta .mono { font-family: ui-monospace, monospace; font-weight: 700; color: #1d4ed8; }

    .title-bar {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: #fff;
      text-align: center;
      padding: 12px 16px;
      margin: 14px 0 16px;
      border-radius: 4px;
    }
    .title-bar h1 { font-size: 18px; font-weight: 800; letter-spacing: 0.04em; }
    .title-bar p { font-size: 10px; color: #cbd5e1; margin-top: 4px; letter-spacing: 0.12em; text-transform: uppercase; }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .stat {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      text-align: center;
      background: #f8fafc;
    }
    .stat-value { font-size: 20px; font-weight: 800; line-height: 1.1; }
    .stat-label { font-size: 10px; color: #64748b; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .stat-pass .stat-value { color: #15803d; }
    .stat-fail .stat-value { color: #b91c1c; }
    .stat-total { background: #eff6ff; border-color: #bfdbfe; }
    .stat-total .stat-value { color: #1d4ed8; font-size: 16px; }

    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      border: 1px solid #dbe3ee;
      border-radius: 6px;
      overflow: hidden;
    }
    .info-table td {
      padding: 9px 12px;
      border-bottom: 1px solid #e8edf3;
      vertical-align: top;
    }
    .info-table tr:last-child td { border-bottom: none; }
    .info-table .label {
      width: 28%;
      background: #eef2f7;
      font-weight: 700;
      color: #334155;
      font-size: 11px;
    }
    .info-table .value { font-weight: 600; color: #0f172a; }

    .section-title {
      font-size: 11px;
      font-weight: 800;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 2px solid #0f172a;
    }

    .services-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 14px;
    }
    .services-table thead tr { background: #1e293b; color: #fff; }
    .services-table th {
      padding: 9px 10px;
      text-align: ${align};
      font-weight: 700;
      font-size: 10px;
      letter-spacing: 0.03em;
    }
    .services-table td {
      padding: 8px 10px;
      border-bottom: 1px solid #e8edf3;
      text-align: ${align};
      vertical-align: middle;
    }
    .services-table tbody tr:nth-child(even) td { background: #f8fafc; }
    .col-no { width: 32px; text-align: center !important; color: #64748b; font-weight: 700; }
    .col-std { font-size: 10px; color: #64748b; max-width: 120px; }
    .col-result { text-align: center !important; }
    .col-amount { text-align: ${alignOpp} !important; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .mono { font-family: ui-monospace, monospace; font-weight: 700; color: #1d4ed8; }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .badge-pass { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .badge-fail { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
    .badge-pending { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; }

    .total-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a;
      color: #fff;
      padding: 14px 18px;
      border-radius: 6px;
      margin-bottom: 16px;
    }
    .total-box .label { font-size: 13px; font-weight: 700; }
    .total-box .amount { font-size: 22px; font-weight: 900; letter-spacing: 0.02em; }

    .instructions {
      border: 1px solid #fcd34d;
      background: linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%);
      border-radius: 6px;
      padding: 14px 16px;
      margin-bottom: 28px;
    }
    .instructions h3 {
      font-size: 12px;
      font-weight: 800;
      color: #92400e;
      margin-bottom: 8px;
    }
    .instructions ol {
      margin-${align}: 18px;
      color: #78350f;
      font-size: 11.5px;
      line-height: 1.65;
    }
    .instructions li { margin-bottom: 4px; }
    .instructions strong { color: #92400e; }

    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 8px;
    }
    .sig-block { text-align: center; }
    .sig-line {
      border-top: 1.5px solid #334155;
      margin-top: 48px;
      padding-top: 8px;
    }
    .sig-title { font-size: 11px; font-weight: 800; color: #334155; }
    .sig-name { font-size: 10px; color: #64748b; margin-top: 4px; min-height: 14px; }
    .sig-date { font-size: 10px; color: #94a3b8; margin-top: 10px; }

    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top-rule">
      <div class="header">
        <div class="logo">م<span class="logo-sub">LAB</span></div>
        <div>
          <div class="lab-name">${L.labName}</div>
          <div class="lab-sub">${L.labNameSub}</div>
        </div>
        <div class="doc-meta">
          <div><strong>${L.docNo}:</strong> <span class="mono">${req.paymentOrderNumber ?? req.requestCode}</span></div>
          <div><strong>${L.issueDate}:</strong> ${poDate}</div>
          <div><strong>${L.reqNo}:</strong> <span class="mono">${req.requestCode}</span></div>
        </div>
      </div>
    </div>

    <div class="title-bar">
      <h1>${L.docTitle}</h1>
      <p>${L.docTitleSub}</p>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-value">${testCount}</div>
        <div class="stat-label">${L.summaryTests}</div>
      </div>
      <div class="stat stat-pass">
        <div class="stat-value">${passedCount}</div>
        <div class="stat-label">${L.summaryPass}</div>
      </div>
      <div class="stat stat-fail">
        <div class="stat-value">${failedCount}</div>
        <div class="stat-label">${L.summaryFail}</div>
      </div>
      <div class="stat stat-total">
        <div class="stat-value">${amountFormatted}</div>
        <div class="stat-label">${L.summaryTotal}</div>
      </div>
    </div>

    <table class="info-table">
      <tr>
        <td class="label">${L.contractor}</td>
        <td class="value">${req.contractorName ?? "—"}</td>
        <td class="label">${L.contractNo}</td>
        <td class="value">${req.contractNumber ?? "—"}</td>
      </tr>
      <tr>
        <td class="label">${L.project}</td>
        <td class="value" colspan="3">${req.contractName ?? "—"}</td>
      </tr>
    </table>

    <div class="section-title">${L.servicesTitle}</div>
    <table class="services-table">
      <thead>
        <tr>
          <th class="col-no">${L.colNo}</th>
          <th>${L.colSample}</th>
          <th>${L.colTest}</th>
          <th>${L.colStd}</th>
          <th class="col-result">${L.colResult}</th>
          <th style="text-align:${alignOpp}">${L.colPrice}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="total-box">
      <span class="label">${L.totalLabel}</span>
      <span class="amount">${amountFormatted}</span>
    </div>

    <div class="instructions">
      <h3>${L.instrTitle}</h3>
      <ol>
        ${L.instrSteps.map((step) => `<li>${step}</li>`).join("")}
      </ol>
    </div>

    <div class="signatures">
      <div class="sig-block">
        <div class="sig-line">
          <div class="sig-title">${L.sigContractor}</div>
          <div class="sig-name">${req.contractorName ?? ""}</div>
          <div class="sig-date">${L.sigDate}: _______________</div>
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-line">
          <div class="sig-title">${L.sigAccountant}</div>
          <div class="sig-name">&nbsp;</div>
          <div class="sig-date">${L.sigDate}: _______________</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <span>${L.labName}</span>
      <span>${L.footerPrinted}: ${printedAt}</span>
    </div>
  </div>
</body>
</html>`;
}

// ─── Clearance Detail ──────────────────────────────────────────────────────────
function ClearanceDetail({ req, onClose, refetch }: { req: any; onClose: () => void; refetch: () => void }) {
  const { lang } = useLanguage();
  const l = lang as Lang;
  const utils = trpc.useUtils();
  const [notes, setNotes] = useState(req.notes ?? "");
  const [uploading, setUploading] = useState<string | null>(null);
  const [qcNotes, setQcNotes] = useState("");
  const [printLang, setPrintLang] = useState<Lang>(l);
  const [receiptNumber, setReceiptNumber] = useState(req.paymentReceiptNumber ?? "");
  const [savingReceipt, setSavingReceipt] = useState(false);

  const refreshClearance = () => {
    void refetch();
    void utils.clearance.getById.invalidate({ id: req.id });
  };

  const qcReview = trpc.clearance.qcReview.useMutation({
    onSuccess: () => { toast.success(t("toastQcApproved", l)); refreshClearance(); },
    onError: (e) => toast.error(e.message),
  });
  const issuePayment = trpc.clearance.issuePaymentOrder.useMutation({
    onSuccess: (data) => { toast.success(`${t("toastPayIssued", l)} ${data.paymentOrderNumber}`); refreshClearance(); },
    onError: (e) => toast.error(e.message),
  });
  const uploadDoc = trpc.clearance.uploadDocument.useMutation({
    onSuccess: () => { toast.success(t("toastDocUploaded", l)); refreshClearance(); },
    onError: (e) => toast.error(e.message),
  });
  const issueCert = trpc.clearance.issueCertificate.useMutation({
    onSuccess: () => { toast.success(t("toastCertIssued", l)); refreshClearance(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const saveReceiptNo = trpc.clearance.saveReceiptNumber.useMutation({
    onSuccess: () => { toast.success(t("receiptNoSaved", l)); refreshClearance(); setSavingReceipt(false); },
    onError: (e) => { toast.error(e.message); setSavingReceipt(false); },
  });
  const inventory = (req.inventoryData ?? []) as any[];

  const handleFileUpload = async (docType: string, file: File) => {
    setUploading(docType);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      await uploadDoc.mutateAsync({ id: req.id, docType: docType as any, fileUrl: url });
    } catch {
      const fakeUrl = `https://storage.example.com/${docType}-${Date.now()}.pdf`;
      await uploadDoc.mutateAsync({ id: req.id, docType: docType as any, fileUrl: fakeUrl });
    } finally {
      setUploading(null);
    }
  };

  const printPaymentOrder = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPaymentOrderHtml(req, inventory, printLang));
    w.document.close();
    w.print();
  };

  const printCertificate = () => {
    openClearanceCertificatePrint(req, printLang);
  };

  const allDocsUploaded = DOCS.filter(d => ["contractorLetter", "sectorLetter", "paymentReceipt"].includes(d.key))
    .every(d => !!req[d.urlField]);
  const canIssueCert = allDocsUploaded && req.status !== "issued" && req.status !== "rejected";

  return (
    <div className="space-y-5">
      {/* Request summary */}
      <div className="rounded-xl border border-border/80 bg-muted/30 overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/60">
          <div className="bg-background px-4 py-3 text-start">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("colRequest", l)}</p>
            <p className="mt-1 text-sm font-mono font-semibold text-primary">{req.requestCode}</p>
          </div>
          <div className="bg-background px-4 py-3 text-start">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("colContractor", l)}</p>
            <p className="mt-1 text-sm font-semibold leading-snug">{req.contractorName ?? "—"}</p>
          </div>
          <div className="bg-background px-4 py-3 text-start">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("colContract", l)}</p>
            <p className="mt-1 text-sm font-mono font-semibold">{req.contractNumber ?? "—"}</p>
          </div>
          <div className="bg-background px-4 py-3 text-start">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("colStatus", l)}</p>
            <div className="mt-1"><StatusBadge status={req.status} lang={l} /></div>
          </div>
        </div>
        <div className="border-t border-border/80 bg-background px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t("newProject", l)}</span>
            <span className="font-medium">{req.contractName ?? "—"}</span>
            <span className="hidden sm:inline text-muted-foreground">·</span>
            <span className="text-muted-foreground">{t("colTests", l)}:</span>
            <span className="font-semibold">{req.totalTests ?? inventory.length}</span>
            <span className="text-green-600 font-semibold">({req.passedTests ?? 0}✓)</span>
            {(req.failedTests ?? 0) > 0 && <span className="text-red-600 font-semibold">({req.failedTests}✗)</span>}
          </div>
          <div className="text-sm font-bold text-blue-700 whitespace-nowrap">
            {Number(req.totalAmount).toFixed(2)} AED
          </div>
        </div>
      </div>

      {/* Issued certificate banner */}
      {req.status === "issued" && req.certificateCode && (
        <div className="rounded-xl border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50 overflow-hidden">
          <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                <Award className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-green-900">{t("certIssuedTitle", l)}</p>
                <p className="text-lg font-mono font-bold text-green-800 mt-1 break-all">{req.certificateCode}</p>
                <p className="text-xs text-green-700 mt-1">
                  {t("certIssuedAt", l)}{" "}
                  {req.certificateIssuedAt
                    ? new Date(req.certificateIssuedAt).toLocaleDateString(l === "ar" ? "ar-AE" : "en-AE", { year: "numeric", month: "long", day: "numeric" })
                    : "—"}
                </p>
                <p className="text-xs text-green-600 mt-2">{t("certPrintHint", l)}</p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={printCertificate}
              className="gap-2 bg-green-700 hover:bg-green-800 shrink-0 self-start lg:self-auto"
            >
              <Printer size={18} />
              {t("certPrintOfficial", l)}
            </Button>
          </div>
        </div>
      )}

      {/* Print language selector */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border">
        <Globe size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground">{t("printLang", l)}:</span>
        <div className="flex gap-1">
          <Button size="sm" variant={printLang === "ar" ? "default" : "outline"} className="h-7 px-3 text-xs" onClick={() => setPrintLang("ar")}>
            {t("printAr", l)}
          </Button>
          <Button size="sm" variant={printLang === "en" ? "default" : "outline"} className="h-7 px-3 text-xs" onClick={() => setPrintLang("en")}>
            {t("printEn", l)}
          </Button>
        </div>
      </div>

      {/* Workflow stepper */}
      <WorkflowStepper status={req.status} lang={l} />

      {/* Test inventory */}
      {inventory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical size={18} className="text-blue-600 shrink-0" />
                {t("invTitle", l)} ({inventory.length})
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50 shrink-0"
                onClick={() => {
                  const w = window.open("", "_blank");
                  if (!w) return;
                  w.document.write(buildInventoryHtml(req, inventory, printLang));
                  w.document.close();
                  w.print();
                }}
              >
                <Printer size={12} />
                {l === "ar" ? "طباعة الجرد" : "Print Inventory"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-start">#</th>
                    <th className="px-3 py-2 text-start">{t("invSampleCode", l)}</th>
                    <th className="px-3 py-2 text-start">{t("invTestType", l)}</th>
                    <th className="px-3 py-2 text-start">{t("invStandard", l)}</th>
                    <th className="px-3 py-2 text-start">{t("invResult", l)}</th>
                    <th className="px-3 py-2 text-start">{t("invPrice", l)}</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2 font-mono font-semibold">{item.sampleCode}</td>
                      <td className="px-3 py-2">{l === "ar" ? (item.testNameAr || item.testName) : (item.testName || item.testNameAr)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.standard ?? "—"}</td>
                      <td className={`px-3 py-2 font-semibold ${item.result === "pass" ? "text-green-600" : item.result === "fail" ? "text-red-600" : "text-muted-foreground"}`}>
                        {item.result === "pass" ? t("invPass", l) : item.result === "fail" ? t("invFail", l) : t("invPending", l)}
                      </td>
                      <td className="px-3 py-2 font-semibold">{Number(item.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50">
                    <td colSpan={5} className="px-3 py-2 font-bold text-end">{t("invTotal", l)}</td>
                    <td className="px-3 py-2 font-bold text-blue-700">{Number(req.totalAmount).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: QC Review */}
      <Card className={req.status === "pending" ? "border-yellow-300 bg-yellow-50/30" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <CheckCircle size={18} className="text-blue-600 shrink-0" />
            {t("qcStep", l)}
            {req.status !== "pending" && <CheckCircle size={16} className="text-green-600 shrink-0" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {req.status !== "pending" ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle size={16} className="text-green-600" />
              <span>{t("qcApproved", l)}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("qcHint", l)}</p>
              <textarea
                className="w-full border rounded-md p-2 text-xs resize-none"
                rows={2}
                placeholder={t("qcNotes", l)}
                value={qcNotes}
                onChange={e => setQcNotes(e.target.value)}
              />
              <Button
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                disabled={qcReview.isPending}
                onClick={() => qcReview.mutate({ id: req.id, approved: true, notes: qcNotes || undefined })}
              >
                <CheckCircle size={14} />
                {qcReview.isPending ? t("qcApproving", l) : t("qcApproveBtn", l)}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Payment Order */}
      <Card className={req.status === "inventory_ready" ? "border-amber-300 bg-amber-50/30" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Receipt size={18} className="text-amber-600 shrink-0" />
            {t("payStep", l)}
            {req.paymentOrderNumber && <CheckCircle size={16} className="text-green-600 shrink-0" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {req.status === "pending" && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <AlertTriangle size={15} className="text-yellow-600 shrink-0" />
              <p className="text-xs text-yellow-800">{t("payBlocked", l)}</p>
            </div>
          )}
          {req.paymentOrderNumber ? (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="min-w-0">
                  <p className="text-xs text-green-800 font-medium mb-1">{t("payOrderNo", l)}</p>
                  <p className="text-base font-semibold font-mono text-green-900 break-all">{req.paymentOrderNumber}</p>
                </div>
                <Button size="sm" variant="outline" onClick={printPaymentOrder} className="gap-1.5 shrink-0 self-start sm:self-auto">
                  <Printer size={14} /> {t("payPrint", l)}
                </Button>
              </div>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
                <p className="text-sm text-blue-900 font-medium">{t("payInstructions", l)}</p>
                <p className="text-sm text-blue-800 leading-relaxed">{t("payInstructionsTxt", l)} <strong>{Number(req.totalAmount).toFixed(2)} AED</strong></p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("payHint", l)}</p>
              <Button
                size="sm"
                disabled={issuePayment.isPending || req.status === "pending"}
                onClick={() => issuePayment.mutate({ id: req.id })}
                className="gap-1.5"
              >
                <Receipt size={14} />
                {issuePayment.isPending ? t("payIssuing", l) : t("payIssue", l)}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Upload Documents */}
      <Card className={req.status === "payment_ordered" ? "border-purple-300 bg-purple-50/30" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <FileCheck size={18} className="text-purple-600 shrink-0" />
            {t("docsStep", l)}
            {allDocsUploaded && <CheckCircle size={16} className="text-green-600 shrink-0" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {DOCS.map(doc => {
              const fileUrl = req[doc.urlField] as string | null | undefined;
              const fileName = fileUrl ? decodeURIComponent(fileUrl.split("/").pop()?.split("?")[0] ?? "") : null;
              return (
              <div key={doc.key} className={`flex flex-col gap-3 rounded-lg border p-4 min-w-0 ${fileUrl ? "bg-green-50/60 border-green-200" : "bg-muted/30"}`}>
                <div className="flex items-start gap-2 min-w-0">
                  {fileUrl ? (
                    <CheckCircle size={16} className="text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <span className="text-sm font-medium leading-snug block">{l === "ar" ? doc.labelAr : doc.labelEn}</span>
                    {fileUrl && (
                      <span className="text-xs text-green-700 mt-1 block truncate" title={fileName ?? undefined}>
                        {l === "ar" ? "تم الرفع" : "Uploaded"}{fileName ? `: ${fileName}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {fileUrl && (
                    <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" asChild>
                      <a href={fileUrl} target="_blank" rel="noreferrer">{t("docView", l)}</a>
                    </Button>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      disabled={uploading === doc.key}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(doc.key, file);
                        e.target.value = "";
                      }}
                    />
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1.5" asChild>
                      <span>
                        <Upload size={12} />
                        {uploading === doc.key ? "..." : fileUrl ? t("docUpdate", l) : t("docUpload", l)}
                      </span>
                    </Button>
                  </label>
                </div>
              </div>
            );})}
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Issue Certificate */}
      <Card className={canIssueCert && req.status !== "issued" ? "border-green-300 bg-green-50/30" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <BadgeCheck size={18} className="text-green-600 shrink-0" />
            {t("certStep", l)}
            {req.status === "issued" && <CheckCircle size={16} className="text-green-600 shrink-0" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {req.status === "issued" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="text-xs text-green-800 font-medium mb-1">{t("certNo", l)}</p>
                  <p className="text-base font-semibold font-mono text-green-900 break-all">{req.certificateCode}</p>
                </div>
                <div>
                  <p className="text-xs text-green-800 font-medium mb-1">{t("certIssuedAt", l)}</p>
                  <p className="text-base font-semibold text-green-900">
                    {req.certificateIssuedAt
                      ? new Date(req.certificateIssuedAt).toLocaleDateString(l === "ar" ? "ar-AE" : "en-AE", { year: "numeric", month: "long", day: "numeric" })
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-green-800 font-medium mb-1">{t("colContractor", l)}</p>
                  <p className="text-sm font-semibold text-green-900">{req.contractorName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-green-800 font-medium mb-1">{t("colTotal", l)}</p>
                  <p className="text-sm font-bold text-green-900">{Number(req.totalAmount).toFixed(2)} AED</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={printCertificate} className="gap-2 flex-1 bg-green-700 hover:bg-green-800 h-11">
                  <Printer size={18} /> {t("certPrintOfficial", l)}
                </Button>
                <Button variant="outline" onClick={printCertificate} className="gap-2 flex-1 h-11 border-green-400 text-green-800 hover:bg-green-50">
                  <FileText size={18} /> {t("certViewPrint", l)}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">{t("certPrintHint", l)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                placeholder={t("certNotes", l)}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
              />
              <Button
                className="w-full gap-2 bg-green-700 hover:bg-green-800"
                disabled={!canIssueCert || issueCert.isPending}
                onClick={() => issueCert.mutate({ id: req.id, notes })}
              >
                <BadgeCheck size={16} />
                {issueCert.isPending ? t("certIssuing", l) : t("certIssue", l)}
              </Button>
              {!canIssueCert && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  {t("certBlocked", l)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── New Request Dialog ────────────────────────────────────────────────────────
function NewClearanceDialog({ onCreated }: { onCreated: () => void }) {
  const { lang } = useLanguage();
  const l = lang as Lang;
  const [open, setOpen] = useState(false);
  const [contractId, setContractId] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: contracts = [] } = trpc.contracts.listSimple.useQuery();
  const { data: contractors = [] } = trpc.contractors.list.useQuery();
  const { data: sectors = [] } = trpc.clearance.listSectors.useQuery();

  const createReq = trpc.clearance.create.useMutation({
    onSuccess: (data) => {
      toast.success(`${t("toastCreated", l)} ${data.code}`);
      setOpen(false);
      setContractId("");
      setSectorId("");
      setNotes("");
      onCreated();
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedContract = contracts.find(c => String(c.id) === contractId);
  const selectedContractor = selectedContract
    ? contractors.find(c => c.id === selectedContract.contractorId)
    : null;

  const handleCreate = () => {
    if (!selectedContract || !selectedContractor) {
      toast.error(t("newSelectFirst", l));
      return;
    }
    createReq.mutate({
      contractId: selectedContract.id,
      contractorId: selectedContractor.id,
      contractNumber: selectedContract.contractNumber,
      contractName: selectedContract.contractName ?? undefined,
      contractorName: selectedContractor.nameAr ?? selectedContractor.nameEn,
      sectorId: sectorId ? Number(sectorId) : undefined,
      notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus size={16} />
          {t("newRequest", l)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck size={18} className="text-green-600" />
            {t("newTitle", l)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>{t("newContract", l)} <span className="text-red-500">*</span></Label>
            <Select value={contractId} onValueChange={setContractId}>
              <SelectTrigger>
                <SelectValue placeholder={t("newSelectContract", l)} />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {contracts.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-semibold">{c.contractNumber}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[250px]">{c.contractName}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedContract && selectedContractor && (
            <div className="p-3 bg-muted/40 rounded-lg border border-dashed space-y-1.5 text-sm">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24">{t("newContractor", l)}</span>
                <span className="font-semibold">{l === "ar" ? (selectedContractor.nameAr ?? selectedContractor.nameEn) : (selectedContractor.nameEn ?? selectedContractor.nameAr)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24">{t("newProject", l)}</span>
                <span>{selectedContract.contractName ?? "—"}</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{l === "ar" ? "القطاع المعني" : "Related Sector"}</Label>
            <Select value={sectorId} onValueChange={setSectorId}>
              <SelectTrigger>
                <SelectValue placeholder={l === "ar" ? "اختر القطاع (اختياري)" : "Select sector (optional)"} />
              </SelectTrigger>
              <SelectContent>
                {sectors.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {l === "ar" ? (s.nameAr ?? s.nameEn ?? s.sectorKey) : (s.nameEn ?? s.nameAr ?? s.sectorKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("newNotes", l)}</Label>
            <Textarea
              placeholder={t("newNotesPlaceholder", l)}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <strong>{l === "ar" ? "ملاحظة:" : "Note:"}</strong> {t("newInfo", l)}
          </div>

          <Button
            className="w-full"
            disabled={!contractId || createReq.isPending}
            onClick={handleCreate}
          >
            {createReq.isPending ? t("newCreating", l) : t("newCreate", l)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ClearancePage() {
  const { lang } = useLanguage();
  const l = lang as Lang;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [showHistory, setShowHistory] = useState(false);
  const [listSearch, setListSearch] = useState("");

  const { data: requests = [], refetch } = trpc.clearance.list.useQuery();
  const markAccountantRead = trpc.clearance.markAccountantRead.useMutation();

  const { data: selectedReq } = trpc.clearance.getById.useQuery(
    { id: selectedId! },
    { enabled: selectedId !== null }
  );

  const openDetail = (req: any) => {
    setSelectedId(req.id);
    setDetailOpen(true);
    // Mark as seen by accountant
    if (!req.accountantReadAt && req.status !== "issued" && req.status !== "rejected") {
      markAccountantRead.mutate({ id: req.id }, { onSuccess: () => refetch() });
    }
  };

  const newCount = requests.filter(r => getClearanceTaskState(r) === "new").length;
  const incompleteCount = requests.filter(r => getClearanceTaskState(r) === "incomplete").length;
  const completedCount = requests.filter(r => getClearanceTaskState(r) === "completed").length;

  const listFilters = useMemo(() => ({ search: listSearch }), [listSearch]);

  const filteredRequests = useMemo(() => {
    const byTask = requests.filter((r) => {
      if (taskFilter === "all") return true;
      return getClearanceTaskState(r) === taskFilter;
    });
    return applyClearanceFilters(byTask, listFilters);
  }, [requests, taskFilter, listFilters]);
  const activeRequests = filteredRequests.filter(r => getClearanceTaskState(r) !== "completed");
  const completedRequests = filteredRequests.filter(r => getClearanceTaskState(r) === "completed");

  const stats = {
    total:    requests.length,
    pending:  requests.filter(r => ["pending", "inventory_ready", "payment_ordered", "docs_uploaded"].includes(r.status)).length,
    issued:   requests.filter(r => r.status === "issued").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BadgeCheck className="w-6 h-6 text-green-600" />
              {t("pageTitle", l)}
            </h1>
            <p className="text-sm text-muted-foreground">{t("pageSubtitle", l)}</p>
          </div>
          <div className="flex items-center gap-2">
            <NewClearanceDialog onCreated={refetch} />
          </div>
        </div>

        {/* Filter Buttons (replaces stats cards) */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setTaskFilter("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${taskFilter === "all" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background text-muted-foreground border-border hover:border-primary/50"}`}>
            <ClipboardList className="w-4 h-4" />
            {t("totalRequests", l)}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${taskFilter === "all" ? "bg-white/20" : "bg-muted"}`}>{requests.length}</span>
          </button>
          <button onClick={() => setTaskFilter("new")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${taskFilter === "new" ? "bg-red-600 text-white border-red-600 shadow-sm" : "bg-background text-muted-foreground border-border hover:border-red-400"}`}>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {l === "ar" ? "جديدة" : "New"}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${taskFilter === "new" ? "bg-white/20 text-white" : "bg-red-100 text-red-700"}`}>{newCount}</span>
          </button>
          <button onClick={() => setTaskFilter("incomplete")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${taskFilter === "incomplete" ? "bg-amber-500 text-white border-amber-500 shadow-sm" : "bg-background text-muted-foreground border-border hover:border-amber-400"}`}>
            <Clock className="w-4 h-4" />
            {t("inProgress", l)}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${taskFilter === "incomplete" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>{incompleteCount}</span>
          </button>
          <button onClick={() => { setTaskFilter("completed"); setShowHistory(true); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${taskFilter === "completed" ? "bg-green-600 text-white border-green-600 shadow-sm" : "bg-background text-muted-foreground border-border hover:border-green-400"}`}>
            <CheckCircle2 className="w-4 h-4" />
            {t("issued", l)}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${taskFilter === "completed" ? "bg-white/20 text-white" : "bg-green-100 text-green-700"}`}>{completedCount}</span>
          </button>
        </div>

        <ListFilterBar
          lang={l}
          search={listSearch}
          onSearchChange={setListSearch}
          searchPlaceholder={
            l === "ar"
              ? "بحث برقم الطلب، العقد، المقاول، أو المشروع..."
              : "Search by request, contract, contractor, or project..."
          }
          showClear={hasActiveListFilters(listFilters)}
          onClear={() => setListSearch("")}
          resultCount={filteredRequests.length}
        />

        {/* Active Requests */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("requestsTable", l)} ({activeRequests.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activeRequests.length === 0 && taskFilter !== "completed" ? (
              <div className="p-12 text-center">
                <BadgeCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">{t("noRequests", l)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("noRequestsHint", l)}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("colRequest", l)}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{l === "ar" ? "الحالة" : "Task"}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("colContractor", l)}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("colContract", l)}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("colTests", l)}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("colTotal", l)}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("colStatus", l)}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("colDate", l)}</th>
                      <th className="text-start px-4 py-2.5 text-xs font-medium text-muted-foreground">{t("colActions", l)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRequests.map(req => {
                      const taskState = getClearanceTaskState(req);
                      return (
                        <tr key={req.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${taskState === "new" ? "bg-red-50/30" : taskState === "incomplete" ? "bg-amber-50/20" : ""}`}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{req.requestCode}</td>
                          <td className="px-4 py-3"><TaskStateBadge state={taskState} lang={l} /></td>
                          <td className="px-4 py-3 text-xs font-medium">{req.contractorName}</td>
                          <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{req.contractNumber}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className="flex items-center gap-1">
                              <FlaskConical size={12} className="text-muted-foreground" />
                              {req.totalTests}
                              <span className="text-green-600 font-semibold">({req.passedTests}✓)</span>
                              {req.failedTests > 0 && <span className="text-red-600 font-semibold">({req.failedTests}✗)</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-blue-700">{Number(req.totalAmount).toFixed(2)}</td>
                          <td className="px-4 py-3"><StatusBadge status={req.status} lang={l} /></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {new Date(req.createdAt).toLocaleDateString(l === "ar" ? "ar-AE" : "en-AE")}
                          </td>
                          <td className="px-4 py-3">
                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1" onClick={() => openDetail(req)}>
                              <ChevronRight size={12} />
                              {t("details", l)}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed History */}
        {(taskFilter === "completed" || (taskFilter === "all" && completedRequests.length > 0)) && (
          <div>
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground gap-2 text-xs border border-dashed" onClick={() => setShowHistory(v => !v)}>
              <History className="w-3.5 h-3.5" />
              {showHistory ? (l === "ar" ? "إخفاء السجل" : "Hide History") : (l === "ar" ? "عرض السجل" : "Show History")}
              <span className="text-muted-foreground/60">({completedRequests.length})</span>
            </Button>
            {showHistory && (
              <Card className="mt-2 opacity-75">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="text-start px-4 py-2 text-xs font-medium text-muted-foreground">{t("colRequest", l)}</th>
                          <th className="text-start px-4 py-2 text-xs font-medium text-muted-foreground">{t("colContractor", l)}</th>
                          <th className="text-start px-4 py-2 text-xs font-medium text-muted-foreground">{t("colTotal", l)}</th>
                          <th className="text-start px-4 py-2 text-xs font-medium text-muted-foreground">{t("colStatus", l)}</th>
                          <th className="text-start px-4 py-2 text-xs font-medium text-muted-foreground">{t("colDate", l)}</th>
                          <th className="text-start px-4 py-2 text-xs font-medium text-muted-foreground">{t("colActions", l)}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completedRequests.map(req => (
                          <tr key={req.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary">{req.requestCode}</td>
                            <td className="px-4 py-2.5 text-xs font-medium">{req.contractorName}</td>
                            <td className="px-4 py-2.5 text-xs font-semibold text-blue-700">{Number(req.totalAmount).toFixed(2)}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={req.status} lang={l} /></td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {new Date(req.createdAt).toLocaleDateString(l === "ar" ? "ar-AE" : "en-AE")}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1.5">
                                {req.status === "issued" && req.certificateCode && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50"
                                    onClick={() => openClearanceCertificatePrint(req, l)}
                                  >
                                    <Printer size={12} />
                                    {t("certPrint", l)}
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1" onClick={() => openDetail(req)}>
                                  <ChevronRight size={12} />
                                  {t("details", l)}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent
          className="flex max-h-[92vh] w-[min(96vw,56rem)] max-w-[min(96vw,56rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,56rem)]"
          aria-describedby={undefined}
        >
          <DialogHeader className="shrink-0 border-b px-6 py-5 text-start">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <BadgeCheck size={20} className="text-green-600 shrink-0" />
              {t("detailsTitle", l)}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {selectedReq && (
              <ClearanceDetail
                req={selectedReq}
                onClose={() => setDetailOpen(false)}
                refetch={refetch}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
