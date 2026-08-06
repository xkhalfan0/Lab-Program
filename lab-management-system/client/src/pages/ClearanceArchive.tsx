import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { Search, Archive, CheckCircle2, XCircle, FileText, Calendar, User, Hash, Building2, X, Printer } from "lucide-react";
import { openClearanceCertificatePrint } from "@/lib/clearanceCertificatePrint";

type Lang = "ar" | "en";

const T = {
  pageTitle:    { ar: "أرشيف براءة الذمة",          en: "Clearance Archive" },
  pageSubtitle: { ar: "سجل جميع طلبات براءة الذمة المكتملة والمرفوضة", en: "Record of all completed and rejected clearance requests" },
  searchPlaceholder: { ar: "بحث بالمقاول، رقم العقد، رقم الطلب أو الشهادة...", en: "Search by contractor, contract no., request or certificate no..." },
  filterSector: { ar: "تصفية بالقطاع",              en: "Filter by Sector" },
  allSectors:   { ar: "جميع القطاعات",              en: "All Sectors" },
  dateFrom:     { ar: "من تاريخ",                   en: "From Date" },
  dateTo:       { ar: "إلى تاريخ",                  en: "To Date" },
  clearFilters: { ar: "مسح الفلاتر",                en: "Clear Filters" },
  noResults:    { ar: "لا توجد نتائج",              en: "No results found" },
  noResultsHint:{ ar: "جرب تغيير معايير البحث أو الفلاتر", en: "Try changing search criteria or filters" },
  colRequest:   { ar: "رقم الطلب",                  en: "Request No." },
  colCert:      { ar: "رقم الشهادة",                en: "Certificate No." },
  colContractor:{ ar: "المقاول",                    en: "Contractor" },
  colContract:  { ar: "رقم العقد",                  en: "Contract No." },
  colAmount:    { ar: "المبلغ (درهم)",              en: "Amount (AED)" },
  colTests:     { ar: "الاختبارات",                 en: "Tests" },
  colStatus:    { ar: "الحالة",                     en: "Status" },
  colDate:      { ar: "تاريخ الإنشاء",              en: "Created Date" },
  colIssued:    { ar: "تاريخ الإصدار",              en: "Issued Date" },
  statusIssued: { ar: "صادرة",                      en: "Issued" },
  statusRejected:{ ar: "مرفوضة",                   en: "Rejected" },
  colPrint:     { ar: "طباعة الشهادة",            en: "Print Certificate" },
  printCert:    { ar: "طباعة براءة الذمة",        en: "Print Clearance" },
  printCertHint:{ ar: "طباعة الشهادة الرسمية",    en: "Print official certificate" },
  totalShowing: { ar: "إجمالي النتائج:",            en: "Total Results:" },
  totalAmount:  { ar: "إجمالي المبالغ:",            en: "Total Amount:" },
};

const t = (key: keyof typeof T, l: Lang) => T[key][l];

function formatDate(d: any, l: Lang) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(l === "ar" ? "ar-AE" : "en-GB", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function ClearanceArchive() {
  const { lang } = useLanguage();
  const l = lang as Lang;

  const [search, setSearch] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: sectors = [] } = trpc.clearance.listSectors.useQuery();

  const queryInput = useMemo(() => ({
    search: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sectorId: sectorId ? Number(sectorId) : undefined,
  }), [search, dateFrom, dateTo, sectorId]);

  const { data: records = [], isLoading } = trpc.clearance.getArchive.useQuery(queryInput);

  const totalAmount = records.reduce((sum, r) => sum + Number(r.totalAmount ?? 0), 0);
  const hasFilters = search || sectorId || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch("");
    setSectorId("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <Archive className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("pageTitle", l)}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{t("pageSubtitle", l)}</p>
            </div>
          </div>
          {/* Summary badges */}
          <div className="flex gap-3 text-sm">
            <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-slate-700 font-medium">
              {t("totalShowing", l)} <span className="font-bold">{records.length}</span>
            </div>
            <div className="px-3 py-1.5 bg-green-50 rounded-lg text-green-700 font-medium">
              {t("totalAmount", l)} <span className="font-bold">{totalAmount.toLocaleString()} AED</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search */}
            <div className="md:col-span-2 relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="ps-9"
                placeholder={t("searchPlaceholder", l)}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {/* Sector filter */}
            <Select value={sectorId} onValueChange={setSectorId}>
              <SelectTrigger>
                <Building2 className="w-4 h-4 text-muted-foreground me-1.5" />
                <SelectValue placeholder={t("filterSector", l)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allSectors", l)}</SelectItem>
                {sectors.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {l === "ar" ? (s.nameAr ?? s.nameEn ?? s.sectorKey) : (s.nameEn ?? s.nameAr ?? s.sectorKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Clear filters */}
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="gap-1.5 h-10">
                <X className="w-4 h-4" />
                {t("clearFilters", l)}
              </Button>
            )}
          </div>
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("dateFrom", l)}</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("dateTo", l)}</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-card border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              {l === "ar" ? "جاري التحميل..." : "Loading..."}
            </div>
          ) : records.length === 0 ? (
            <div className="p-12 text-center">
              <Archive className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="font-medium text-muted-foreground">{t("noResults", l)}</p>
              <p className="text-sm text-muted-foreground/60 mt-1">{t("noResultsHint", l)}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colRequest", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colCert", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colContractor", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colContract", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colTests", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colAmount", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colStatus", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colDate", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colIssued", l)}</th>
                    <th className="text-start px-4 py-3 font-semibold text-muted-foreground">{t("colPrint", l)}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={r.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      {/* Request code */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-primary">{r.requestCode}</span>
                      </td>
                      {/* Certificate code */}
                      <td className="px-4 py-3">
                        {r.certificateCode ? (
                          <span className="font-mono text-xs font-semibold text-green-700">{r.certificateCode}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      {/* Contractor */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate max-w-[160px]">{r.contractorName}</span>
                        </div>
                      </td>
                      {/* Contract */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs">{r.contractNumber}</span>
                        </div>
                      </td>
                      {/* Tests */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-green-600 font-semibold">{r.passedTests ?? 0}✓</span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground">{r.totalTests ?? 0}</span>
                        </div>
                      </td>
                      {/* Amount */}
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-700">{Number(r.totalAmount ?? 0).toLocaleString()}</span>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {r.status === "issued" ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            {t("statusIssued", l)}
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                            <XCircle className="w-3 h-3" />
                            {t("statusRejected", l)}
                          </Badge>
                        )}
                      </td>
                      {/* Created date */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(r.createdAt, l)}
                        </div>
                      </td>
                      {/* Issued date */}
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.certificateIssuedAt ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <FileText className="w-3 h-3" />
                            {formatDate(r.certificateIssuedAt, l)}
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      {/* Print certificate */}
                      <td className="px-4 py-3">
                        {r.status === "issued" && r.certificateCode ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-8 text-green-700 border-green-300 hover:bg-green-50"
                            title={t("printCertHint", l)}
                            onClick={() => openClearanceCertificatePrint(r as any, l)}
                          >
                            <Printer className="w-3.5 h-3.5" />
                            {t("printCert", l)}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
