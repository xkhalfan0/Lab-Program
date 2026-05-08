import { differenceInDays, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ─── Type definition for distribution data ───────────────────────────────────
interface SampleInfoCardProps {
  dist: {
    sampleCode?: string | null;
    contractNumber?: string | null;
    contractName?: string | null;
    contractorName?: string | null;
    sector?: string | null;
    castingDate?: Date | string | null;
    testSubType?: string | null;
    quantity?: number | null;
    testName?: string | null;
    testNameAr?: string | null;
    testNameEn?: string | null;
    distributionCode?: string | null;
    priority?: string | null;
    sampleType?: string | null;
    sampleLocation?: string | null;
  } | null | undefined;
  // Optional extra fields specific to each test type
  extraFields?: { label: string; value: string | number | null | undefined }[];
}

// ─── Priority badge colors ───────────────────────────────────────────────────
const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "منخفضة", className: "bg-slate-100 text-slate-700" },
  normal: { label: "عادية", className: "bg-blue-100 text-blue-700" },
  high: { label: "عالية", className: "bg-orange-100 text-orange-700" },
  urgent: { label: "عاجلة", className: "bg-red-100 text-red-700" },
};

// ─── Calculate concrete age in days ──────────────────────────────────────────
function calcAge(castingDate: Date | string | null | undefined): string | null {
  if (!castingDate) return null;
  const casting = typeof castingDate === "string" ? parseISO(castingDate) : castingDate;
  const days = differenceInDays(new Date(), casting);
  return `${days} يوم`;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function SampleInfoCard({ dist, extraFields }: SampleInfoCardProps) {
  if (!dist) return null;

  const priority = dist.priority ? priorityConfig[dist.priority] : null;
  const age = calcAge(dist.castingDate);
  const testDisplayName = dist.testNameAr ?? dist.testNameEn ?? dist.testName ?? "—";

  // Base fields that always appear
  const baseFields = [
    { label: "رقم العينة", value: dist.sampleCode },
    { label: "رقم العقد", value: dist.contractNumber },
    { label: "المشروع", value: dist.contractName },
    { label: "المقاول", value: dist.contractorName },
    { label: "القطاع", value: dist.sector },
    { label: "الموقع", value: dist.sampleLocation },
    { label: "الاختبار", value: testDisplayName },
    { label: "رقم التوزيع", value: dist.distributionCode },
    { label: "الكمية", value: dist.quantity?.toString() },
  ].filter((f) => f.value);

  // Concrete-specific fields (only if castingDate exists)
  const concreteFields = dist.castingDate
    ? [
        {
          label: "تاريخ الصب",
          value:
            typeof dist.castingDate === "string"
              ? new Date(dist.castingDate).toLocaleDateString("ar-AE")
              : dist.castingDate.toLocaleDateString("ar-AE"),
        },
        { label: "عمر العينة", value: age ?? "—" },
      ]
    : [];

  // TestSubType field (appears if present)
  const subTypeField = dist.testSubType
    ? [{ label: "العمر المطلوب / النوع", value: dist.testSubType }]
    : [];

  const allFields = [...baseFields, ...concreteFields, ...subTypeField, ...(extraFields ?? [])];

  return (
    <Card className="mb-4 border-l-4 border-l-blue-500 bg-blue-50/40 print:hidden">
      <CardContent className="pt-3 pb-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-blue-800">بيانات العينة</span>
          {priority && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priority.className}`}>
              أولوية: {priority.label}
            </span>
          )}
        </div>

        <Separator className="mb-2" />

        {/* Grid of fields */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {allFields.map((field, i) => (
            <div key={i} className="flex flex-col">
              <span className="text-xs text-muted-foreground">{field.label}</span>
              <span className="text-sm font-medium text-foreground">{field.value ?? "—"}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
