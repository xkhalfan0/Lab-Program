import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  sampleId: number;
  lang: string;
  disabled?: boolean;
  /** icon = compact row action; button = full label in toolbar */
  variant?: "icon" | "button";
  className?: string;
};

function openContractorFormPage(sampleId: number) {
  window.open(`/contractor-form/${sampleId}`, "_blank", "noopener,noreferrer");
}

export function ContractorFormViewButton({
  sampleId,
  lang,
  disabled,
  variant = "icon",
  className,
}: Props) {
  const isAr = lang === "ar";

  const handleOpen = () => {
    if (sampleId <= 0) return;
    // Open immediately (synchronous) so the browser doesn't block the popup.
    // The destination page handles loading and the "no form" state itself.
    openContractorFormPage(sampleId);
  };

  if (variant === "button") {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        disabled={disabled}
        onClick={handleOpen}
      >
        <FileText className="w-4 h-4 me-1.5" />
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
      disabled={disabled}
      onClick={handleOpen}
    >
      <FileText className="w-3.5 h-3.5" />
    </Button>
  );
}
