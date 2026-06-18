import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  lang: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
};

export function ReceptionNominalCubeSizePanel({
  lang,
  value,
  onChange,
  id = "nominal-cube-size",
  className,
}: Props) {
  const isAr = lang === "ar";
  const isMissing = value !== "100mm" && value !== "150mm";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Ruler className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          <Label htmlFor={id} className="text-base font-semibold text-blue-950 leading-snug">
            {isAr ? "الحجم الاسمي للمكعب" : "Nominal Cube Size"}
            <span className="text-red-500 ms-1">*</span>
          </Label>
          <p className="text-sm text-blue-800/90 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            {isAr
              ? "يُحدد عند الاستقبال — الفني لا يستطيع التعديل"
              : "Set at reception — technician cannot change"}
          </p>
        </div>
      </div>

      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          className={cn(
            "h-12 text-base font-semibold bg-white shadow-sm",
            isMissing ? "border-amber-400 ring-2 ring-amber-200" : "border-blue-300",
          )}
        >
          <SelectValue placeholder={isAr ? "اختر الحجم الاسمي..." : "Select nominal size..."} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="150mm">150 mm</SelectItem>
          <SelectItem value="100mm">100 mm</SelectItem>
        </SelectContent>
      </Select>

      {isMissing && (
        <p className="text-sm font-medium text-amber-800">
          {isAr
            ? "اختر حجم المكعب قبل التسجيل."
            : "Select a cube size before registering."}
        </p>
      )}
    </div>
  );
}

export function isValidNominalCubeSize(value: string | null | undefined): boolean {
  return value === "100mm" || value === "150mm";
}
