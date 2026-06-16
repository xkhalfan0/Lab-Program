/**
 * PrintTestCatalog — printable laboratory test price list
 * URL: /print/test-catalog?category=all&autoprint=1
 */
import { useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import { Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import PrintHeader from "@/components/PrintHeader";
import { useMergedTestCatalog } from "@/hooks/useMergedTestCatalog";
import {
  TEST_CATALOG_CATEGORIES,
  filterCatalogTests,
  groupCatalogTests,
} from "@/lib/testCatalogCategories";
import { useLanguage } from "@/contexts/LanguageContext";

function formatPrice(value: string | number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PrintTestCatalog() {
  const searchString = useSearch();
  const { lang } = useLanguage();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const categoryFilter = params.get("category") ?? "all";
  const autoPrint = params.get("autoprint") === "1";

  const { tests, isLoading } = useMergedTestCatalog();

  const filteredTests = useMemo(
    () => filterCatalogTests(tests, "", categoryFilter),
    [tests, categoryFilter]
  );

  const groupedTests = useMemo(() => groupCatalogTests(filteredTests), [filteredTests]);

  const totalTests = filteredTests.length;

  useEffect(() => {
    if (!isLoading && tests.length > 0 && autoPrint) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, tests.length, autoPrint]);

  const handleClose = () => {
    if (window.opener) window.close();
    else window.history.back();
  };

  const categoryLabel =
    categoryFilter === "all"
      ? lang === "ar"
        ? "جميع الفئات"
        : "All Categories"
      : (() => {
          const cat = TEST_CATALOG_CATEGORIES.find((c) => c.key === categoryFilter);
          if (!cat) return categoryFilter;
          return lang === "ar" ? cat.nameAr : cat.nameEn;
        })();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <>
      <div className="print:hidden fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-3 px-4 py-3 bg-white border-b shadow-sm">
        <p className="text-sm font-medium text-slate-700">
          {lang === "ar" ? "معاينة قائمة أسعار الاختبارات" : "Test price list preview"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleClose}>
            <X className="w-4 h-4 me-1" />
            {lang === "ar" ? "إغلاق" : "Close"}
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 me-1" />
            {lang === "ar" ? "طباعة" : "Print"}
          </Button>
        </div>
      </div>

      <div className="print:hidden h-14" />

      <div className="max-w-[210mm] mx-auto px-6 py-6 print:px-0 print:py-0 print:max-w-none" dir={lang === "ar" ? "rtl" : "ltr"}>
        <PrintHeader
          docType="test_catalog"
          extraFields={[
            {
              label: lang === "ar" ? "الفئة" : "Category",
              value: categoryLabel,
            },
            {
              label: lang === "ar" ? "عدد الاختبارات" : "Total Tests",
              value: String(totalTests),
            },
            {
              label: lang === "ar" ? "العملة" : "Currency",
              value: "AED",
            },
          ]}
        />

        <p className="hidden print:block text-[11px] text-gray-600 mb-4 leading-relaxed">
          {lang === "ar"
            ? "الأسعار الموضحة أدناه بالدرهم الإماراتي (AED) لكل وحدة اختبار ما لم يُذكر خلاف ذلك. للاستفسار يرجى التواصل مع مختبر الإنشاءات والمواد الهندسية."
            : "Prices below are in UAE Dirhams (AED) per test unit unless stated otherwise. For enquiries please contact the Construction Materials & Engineering Laboratory."}
        </p>

        <div className="space-y-5 print:space-y-4">
          {groupedTests.map((category) => (
            <section key={category.key} className="break-inside-avoid">
              <div className="flex items-center justify-between border-b-2 border-gray-800 pb-1 mb-2">
                <h2 className="text-[13px] font-bold text-gray-900">
                  {lang === "ar" ? category.nameAr : category.nameEn}
                  <span className="font-normal text-gray-500 ms-2">
                    ({category.tests.length} {lang === "ar" ? "اختبار" : "tests"})
                  </span>
                </h2>
              </div>

              <table className="w-full border-collapse text-[11px] print:text-[10px]">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-1.5 text-start w-8">#</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-start">
                      {lang === "ar" ? "اسم الاختبار" : "Test Name"}
                    </th>
                    <th className="border border-gray-300 px-2 py-1.5 text-start w-28">
                      {lang === "ar" ? "الرمز" : "Code"}
                    </th>
                    <th className="border border-gray-300 px-2 py-1.5 text-end w-24">
                      {lang === "ar" ? "السعر (AED)" : "Price (AED)"}
                    </th>
                    <th className="border border-gray-300 px-2 py-1.5 text-start w-20">
                      {lang === "ar" ? "الوحدة" : "Unit"}
                    </th>
                    <th className="border border-gray-300 px-2 py-1.5 text-start">
                      {lang === "ar" ? "المعيار" : "Standard"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {category.tests.map((test, idx) => (
                    <tr key={test.code} className="even:bg-gray-50/80">
                      <td className="border border-gray-200 px-2 py-1.5 text-gray-500 tabular-nums">{idx + 1}</td>
                      <td className="border border-gray-200 px-2 py-1.5">
                        <div className="font-medium text-gray-900">{test.nameEn}</div>
                        {test.nameAr && (
                          <div className="text-gray-600 mt-0.5" dir="rtl">
                            {test.nameAr}
                          </div>
                        )}
                      </td>
                      <td className="border border-gray-200 px-2 py-1.5 font-mono text-[10px]">{test.code}</td>
                      <td className="border border-gray-200 px-2 py-1.5 text-end font-mono font-semibold tabular-nums">
                        {formatPrice(test.unitPrice)}
                      </td>
                      <td className="border border-gray-200 px-2 py-1.5 text-gray-600">{test.unit || "—"}</td>
                      <td className="border border-gray-200 px-2 py-1.5 text-gray-600 text-[10px]">
                        {test.standardRef || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <div className="mt-8 pt-4 border-t border-gray-300 text-[10px] text-gray-500 hidden print:block">
          <p>
            {lang === "ar"
              ? `تم إصدار هذه القائمة بتاريخ ${new Date().toLocaleDateString("ar-AE")} — مختبر الإنشاءات والمواد الهندسية`
              : `Issued ${new Date().toLocaleDateString("en-GB")} — Construction Materials & Engineering Laboratory`}
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          @page { margin: 12mm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  );
}
