import { differenceInDays, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCalendarDate } from "@/lib/dateFormat";

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
    receivedAt?: Date | string | null;
    createdAt?: Date | string | null;
    expectedCompletionDate?: Date | string | null;
  } | null | undefined;
  /** Labels should be bilingual, e.g. `"Cube size (mm) / حجم المكعب (مم)"`. */
  extraFields?: { label: string; value: string | number | null | undefined }[];
}

// ─── Priority badge colors (bilingual display text) ─────────────────────────
const priorityConfig: Record<string, { label: string; className: string }> = {
  low: { label: "Low / منخفضة", className: "bg-slate-100 text-slate-700" },
  normal: { label: "Normal / عادية", className: "bg-blue-100 text-blue-700" },
  high: { label: "High / عالية", className: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent / عاجلة", className: "bg-red-100 text-red-700" },
};

function calcAgeDays(castingDate: Date | string | null | undefined): number | null {
  if (!castingDate) return null;
  const casting = typeof castingDate === "string" ? parseISO(castingDate) : castingDate;
  if (Number.isNaN(casting.getTime())) return null;
  return differenceInDays(new Date(), casting);
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function SampleInfoCard({ dist, extraFields }: SampleInfoCardProps) {
  if (!dist) return null;

  const priority = dist.priority
    ? (priorityConfig[dist.priority] ?? {
        label: dist.priority,
        className: "bg-slate-100 text-slate-700",
      })
    : null;
  const ageDays = calcAgeDays(dist.castingDate);
  const enAr =
    dist.testNameEn && dist.testNameAr && dist.testNameEn !== dist.testNameAr
      ? `${dist.testNameEn} / ${dist.testNameAr}`
      : (dist.testNameEn || dist.testNameAr || dist.testName || "").trim();
  let testDisplay: string;
  if (dist.testSubType) {
    testDisplay = enAr ? `${enAr} (${dist.testSubType})` : String(dist.testSubType);
  } else {
    testDisplay = enAr || "—";
  }

  const receivedOrCreated = dist.receivedAt ?? dist.createdAt;

  const baseRows: { label: string; value: string | number | null | undefined }[] = [
    { label: "Sample Code / رمز العينة", value: dist.sampleCode },
    { label: "Contract No. / رقم العقد", value: dist.contractNumber },
    { label: "Project / المشروع", value: dist.contractName },
    { label: "Contractor / المقاول", value: dist.contractorName },
    { label: "Sector / القطاع", value: dist.sector },
    { label: "Quantity / الكمية", value: dist.quantity != null ? dist.quantity : undefined },
    { label: "Distribution / رقم التوزيع", value: dist.distributionCode },
    { label: "Test / الاختبار", value: testDisplay },
    { label: "Sample location / موقع العينة", value: dist.sampleLocation },
    { label: "Received / تاريخ الاستلام", value: receivedOrCreated ? formatCalendarDate(receivedOrCreated) : undefined },
    {
      label: "Due / تاريخ الاستحقاق",
      value: dist.expectedCompletionDate ? formatCalendarDate(dist.expectedCompletionDate) : undefined,
    },
  ];

  const concreteRows: { label: string; value: string | number | null | undefined }[] = dist.castingDate
    ? [
        { label: "Cast date / تاريخ الصب", value: formatCalendarDate(dist.castingDate) },
        {
          label: "Age / العمر",
          value: ageDays != null ? `${ageDays} days / ${ageDays} يوم` : "—",
        },
      ]
    : [];

  const allFields = [
    ...baseRows.filter((f) => f.value !== null && f.value !== undefined && f.value !== ""),
    ...concreteRows,
    ...(extraFields ?? []).filter((f) => f.value !== null && f.value !== undefined && f.value !== ""),
  ];

  return (
    <Card className="mb-4 border-l-4 border-l-blue-500 bg-blue-50/40 print:hidden">
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <span className="text-sm font-semibold text-blue-800">Sample information / بيانات العينة</span>
          {priority && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${priority.className}`}>
              Priority / الأولوية: {priority.label}
            </span>
          )}
        </div>

        <Separator className="mb-2" />

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {allFields.map((field, i) => (
            <div key={i} className="flex flex-col min-w-0">
              <span className="text-xs text-muted-foreground leading-snug">{field.label}</span>
              <span className="text-sm font-medium text-foreground break-words">{field.value ?? "—"}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
