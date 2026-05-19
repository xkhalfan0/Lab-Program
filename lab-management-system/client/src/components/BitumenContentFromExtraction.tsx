import { AlertCircle, FlaskConical } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type Props = {
  lang: string;
  bitumenContent: number | undefined;
  extractionDistributionCode?: string | null;
};

export function BitumenContentFromExtraction({
  lang,
  bitumenContent,
  extractionDistributionCode,
}: Props) {
  const ar = lang === "ar";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 space-y-2">
      <Label className="text-sm font-medium text-amber-900">
        {ar ? "محتوى البيتومين (من نتائج الاستخلاص)" : "Bitumen Content (from Extraction results)"}
      </Label>
      <div className="flex items-center gap-2 max-w-xs">
        <Input
          readOnly
          value={bitumenContent != null ? bitumenContent.toFixed(2) : ""}
          placeholder={ar ? "غير متوفر — أكمل استخلاص البيتومين" : "Not available — complete Bitumen Extraction"}
          className="h-9 font-mono font-semibold bg-white border-amber-300 text-amber-950"
        />
        <span className="text-sm font-medium text-amber-800">%</span>
      </div>
      {bitumenContent != null ? (
        <div className="flex items-start gap-2 text-xs text-amber-800">
          <FlaskConical className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            {ar
              ? `تم الحصول عليها تلقائياً من نتائج استخلاص البيتومين${extractionDistributionCode ? ` (${extractionDistributionCode})` : ""}.`
              : `Auto-populated from Bitumen Extraction test results${extractionDistributionCode ? ` (${extractionDistributionCode})` : ""}.`}
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 text-xs text-amber-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <p>
            {ar
              ? "أكمل اختبار استخلاص البيتومين على نفس العينة لملء هذه القيمة تلقائياً."
              : "Complete Bitumen Extraction on this sample to fill this value automatically."}
          </p>
        </div>
      )}
    </div>
  );
}
