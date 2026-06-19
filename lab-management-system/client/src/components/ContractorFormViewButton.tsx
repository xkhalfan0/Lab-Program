import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Props = {
  sampleId: number;
  lang: string;
  disabled?: boolean;
  /** icon = compact row action; button = full label in toolbar */
  variant?: "icon" | "button";
  className?: string;
};

export function openContractorFormAttachment(
  attachments: Array<{ attachmentType?: string | null; fileUrl?: string | null; fileName?: string | null }>,
  lang: string,
): boolean {
  const form = attachments.find((a) => a.attachmentType === "contractor_form");
  if (!form?.fileUrl) {
    toast.info(
      lang === "ar"
        ? "لا يوجد نموذج مقاول مرفق لهذه العينة."
        : "No contractor form was uploaded for this sample.",
    );
    return false;
  }
  window.open(form.fileUrl, "_blank", "noopener,noreferrer");
  return true;
}

export function ContractorFormViewButton({
  sampleId,
  lang,
  disabled,
  variant = "icon",
  className,
}: Props) {
  const isAr = lang === "ar";
  const utils = trpc.useUtils();
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (sampleId <= 0) return;
    setLoading(true);
    try {
      const attachments = await utils.attachments.bySample.fetch({ sampleId });
      openContractorFormAttachment(attachments, lang);
    } catch {
      toast.error(isAr ? "تعذّر فتح الملف." : "Could not open the file.");
    } finally {
      setLoading(false);
    }
  };

  if (variant === "button") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        disabled={disabled || loading}
        onClick={handleOpen}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <FileText className="w-4 h-4 me-1.5" />}
        {isAr ? "عرض نموذج المقاول" : "View contractor form"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className={className ?? "h-7 px-2 text-emerald-700 hover:text-emerald-800"}
      title={isAr ? "عرض نموذج المقاول" : "View contractor form"}
      disabled={disabled || loading}
      onClick={handleOpen}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
    </Button>
  );
}
