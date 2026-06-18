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
  variant?: "default" | "compact";
};

export function ReceptionNominalCubeSizePanel({
  lang,
  value,
  onChange,
  id = "nominal-cube-size",
  className,
  variant = "default",
}: Props) {
  const isAr = lang === "ar";
  const isMissing = value !== "100mm" && value !== "150mm";
  const title = isAr ? "الحجم الاسمي للمكعب" : "Nominal Cube Size";
  const lockHint = isAr
    ? "يُحدد عند الاستقبال — الفني لا يستطيع التعديل"
    : "Set at reception — technician cannot change";

  if (variant === "compact") {
    return (
      <div className={cn("space-y-2", className)}>
        <Label htmlFor={id} className="text-sm font-semibold flex items-center gap-1.5 leading-snug">
          <Ruler className="h-3.5 w-3.5 text-primary shrink-0" />
          {title}
          <span className="text-red-500">*</span>
        </Label>
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger
            id={id}
            className={cn(
              "h-10 text-sm font-medium bg-background",
              isMissing ? "border-amber-400 ring-1 ring-amber-200" : "border-border",
            )}
          >
            <SelectValue placeholder={isAr ? "اختر الحجم..." : "Select size..."} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="150mm">150 mm</SelectItem>
            <SelectItem value="100mm">100 mm</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 leading-snug">
          <Lock className="w-3 h-3 shrink-0" />
          {lockHint}
        </p>
        {isMissing && (
          <p className="text-xs font-medium text-amber-800">
            {isAr ? "اختر حجم المكعب قبل التسجيل." : "Select a cube size before registering."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Ruler className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          <Label htmlFor={id} className="text-base font-semibold text-blue-950 leading-snug">
            {title}
            <span className="text-red-500 ms-1">*</span>
          </Label>
          <p className="text-sm text-blue-800/90 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            {lockHint}
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
          {isAr ? "اختر حجم المكعب قبل التسجيل." : "Select a cube size before registering."}
        </p>
      )}
    </div>
  );
}

export function isValidNominalCubeSize(value: string | null | undefined): boolean {
  return value === "100mm" || value === "150mm";
}
