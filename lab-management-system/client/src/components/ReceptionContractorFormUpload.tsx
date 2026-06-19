import { useRef } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  CONTRACTOR_FORM_ACCEPT,
  validateContractorFormFile,
} from "@/lib/sampleFileUpload";
import { toast } from "sonner";

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  lang: string;
  disabled?: boolean;
};

export function ReceptionContractorFormUpload({ file, onFileChange, lang, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isAr = lang === "ar";

  const handlePick = (picked: File | null) => {
    if (!picked) {
      onFileChange(null);
      return;
    }
    try {
      validateContractorFormFile(picked, isAr ? "ar" : "en");
      onFileChange(picked);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      onFileChange(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label className="text-[15px]">
        {isAr ? "نموذج المقاول (مسح ضوئي)" : "Contractor form (scan)"}
        <span className="text-muted-foreground text-xs font-normal ms-1">
          ({isAr ? "اختياري — PDF أو صورة" : "optional — PDF or image"})
        </span>
      </Label>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "ارفع النموذج الموقّع من المقاول — يُحفظ مع العينة ووصل الاستلام."
          : "Upload the signed contractor form — saved with the sample and receipt."}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={CONTRACTOR_FORM_ACCEPT}
        className="hidden"
        disabled={disabled}
        onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-2 flex-1 min-w-[200px] justify-center border-dashed"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {file ? (
            <>
              <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="truncate max-w-[220px] text-sm">{file.name}</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 shrink-0" />
              <span>{isAr ? "اختر ملف..." : "Choose file..."}</span>
            </>
          )}
        </Button>
        {file && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            disabled={disabled}
            onClick={() => {
              onFileChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
