/**
 * PrintHeader — رأس الطباعة الرسمي لمختبر الإنشاءات والمواد الهندسية
 * يُستخدم في جميع نماذج الطباعة ويظهر فقط عند الطباعة
 */

export type DocumentType =
  | "sample_receipt"       // وصل استلام العينة
  | "test_report"          // تقرير نتيجة الفحص
  | "concrete_report"      // تقرير فحص الكيوبات الخرسانية
  | "payment_order"        // أمر الدفع
  | "clearance"            // شهادة براءة الذمة
  | "analytics"            // تقرير الإحصائيات
  | "test_catalog"         // قائمة أسعار الاختبارات
  | "custom";              // عنوان مخصص

const DOC_LABELS: Record<DocumentType, { ar: string; en: string }> = {
  sample_receipt: {
    ar: "وصل استلام العينة",
    en: "Sample Receipt",
  },
  test_report: {
    ar: "تقرير نتيجة الفحص",
    en: "Laboratory Test Report",
  },
  concrete_report: {
    ar: "تقرير فحص ضغط المكعبات الخرسانية",
    en: "Concrete Compression Test Report",
  },
  payment_order: {
    ar: "أمر الدفع",
    en: "Payment Order",
  },
  clearance: {
    ar: "شهادة براءة الذمة",
    en: "Clearance",
  },
  analytics: {
    ar: "تقرير الإحصائيات والتقارير",
    en: "Analytics & Statistics Report",
  },
  test_catalog: {
    ar: "قائمة أسعار الاختبارات",
    en: "Laboratory Test Price List",
  },
  custom: { ar: "", en: "" },
};

interface PrintHeaderProps {
  /** نوع الوثيقة — يُحدد العنوان الرسمي تلقائياً */
  docType?: DocumentType;
  /** عنوان مخصص (يُستخدم عند docType="custom" أو عند الحاجة لتجاوز الافتراضي) */
  title?: string;
  /** رقم مرجعي مثل: رقم العينة أو رقم التقرير */
  refNumber?: string;
  /** التاريخ — يستخدم تاريخ اليوم إذا لم يُحدَّد */
  date?: string;
  /** اسم المشروع / العقد */
  projectName?: string;
  /** اسم المقاول */
  contractorName?: string;
  /** بيانات إضافية (مثل: نوع الاختبار، المنطقة، إلخ) */
  extraFields?: Array<{ label: string; value: string }>;
}

export default function PrintHeader({
  docType = "custom",
  title,
  refNumber,
  date,
  projectName,
  contractorName,
  extraFields,
}: PrintHeaderProps) {
  const today = date ?? new Date().toLocaleDateString("ar-AE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const docLabel = DOC_LABELS[docType] ?? { ar: "", en: "" };
  const arTitle = title ?? docLabel.ar;
  const enTitle = docLabel.en;

  return (
    <div className="hidden print:block print-header mb-4" dir="rtl">

      {/* ═══ رأس المختبر ══════════════════════════════════════════ */}
      <div className="border-t-4 border-gray-900 pt-3 pb-2 mb-0">
        <div className="flex items-center justify-between gap-4">

          {/* الجانب الأيمن — اسم المختبر */}
          <div className="text-right flex-1">
            <h1 className="text-[17px] font-extrabold tracking-tight text-gray-900 leading-snug">
              مختبر الإنشاءات والمواد الهندسية
            </h1>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5">
              Construction Materials &amp; Engineering Laboratory
            </p>
          </div>

          {/* الوسط — شعار نصي */}
          <div className="flex flex-col items-center shrink-0 px-5 border-x border-gray-300">
            <div className="w-12 h-12 rounded-full border-2 border-gray-800 flex items-center justify-center">
              <span className="text-xl font-black text-gray-800">م</span>
            </div>
            <span className="text-[9px] text-gray-400 mt-0.5 tracking-widest">LAB</span>
          </div>

          {/* الجانب الأيسر — رقم الوثيقة والتاريخ */}
          <div className="text-left flex-1 text-[11px] text-gray-600 space-y-0.5">
            {refNumber && (
              <div className="flex gap-1 justify-end">
                <span className="font-mono font-bold text-gray-800">{refNumber}</span>
                <span className="text-gray-500">:رقم الوثيقة</span>
              </div>
            )}
            <div className="flex gap-1 justify-end">
              <span>{today}</span>
              <span className="text-gray-500">:التاريخ</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ شريط عنوان الوثيقة ══════════════════════════════════ */}
      <div className="bg-gray-900 text-white text-center py-2 mb-3">
        <p className="text-[15px] font-bold tracking-wide">{arTitle}</p>
        {enTitle && (
          <p className="text-[10px] text-gray-300 mt-0.5 tracking-wider uppercase">{enTitle}</p>
        )}
      </div>

      {/* ═══ معلومات المشروع والمقاول ════════════════════════════ */}
      {(projectName || contractorName || (extraFields && extraFields.length > 0)) && (
        <div className="border border-gray-300 rounded text-[11px] mb-3 overflow-hidden">
          <table className="w-full border-collapse">
            <tbody>
              {projectName && (
                <tr className="border-b border-gray-200">
                  <td className="bg-gray-100 font-semibold text-gray-700 px-3 py-1.5 w-1/4 text-right">المشروع / العقد</td>
                  <td className="px-3 py-1.5">{projectName}</td>
                </tr>
              )}
              {contractorName && (
                <tr className="border-b border-gray-200">
                  <td className="bg-gray-100 font-semibold text-gray-700 px-3 py-1.5 text-right">المقاول</td>
                  <td className="px-3 py-1.5">{contractorName}</td>
                </tr>
              )}
              {extraFields?.map((f, i) => (
                <tr key={i} className={i < (extraFields.length - 1) ? "border-b border-gray-200" : ""}>
                  <td className="bg-gray-100 font-semibold text-gray-700 px-3 py-1.5 text-right">{f.label}</td>
                  <td className="px-3 py-1.5">{f.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
