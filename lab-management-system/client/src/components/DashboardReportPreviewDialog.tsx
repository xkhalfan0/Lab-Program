import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, X } from "lucide-react";

export type ReportPreviewPayload = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  html?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: ReportPreviewPayload | null;
  uiLang: "ar" | "en";
};

function downloadBlob(payload: ReportPreviewPayload) {
  const bytes = Uint8Array.from(atob(payload.dataBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: payload.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function DashboardReportPreviewDialog({
  open,
  onOpenChange,
  payload,
  uiLang,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isAr = uiLang === "ar";

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  const handleDownload = () => {
    if (!payload) return;
    downloadBlob(payload);
  };

  const isPdf = payload?.mimeType === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogHeader className="px-4 py-3 border-b shrink-0 flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base font-semibold">
            {isAr ? "معاينة التقرير" : "Report Preview"}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {isPdf && payload?.html && (
              <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
                <Printer className="w-4 h-4" />
                {isAr ? "طباعة" : "Print"}
              </Button>
            )}
            <Button size="sm" onClick={handleDownload} className="gap-1.5">
              <Download className="w-4 h-4" />
              {isAr ? "تنزيل" : "Download"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="gap-1.5"
            >
              <X className="w-4 h-4" />
              {isAr ? "إغلاق" : "Close"}
            </Button>
          </div>
        </DialogHeader>

        {payload?.html ? (
          <iframe
            ref={iframeRef}
            srcDoc={payload.html}
            title={isAr ? "معاينة التقرير" : "Report preview"}
            className="flex-1 w-full border-0 bg-slate-100"
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center text-muted-foreground">
            <p className="text-sm max-w-md">
              {isAr
                ? "ملف Excel جاهز للتنزيل. المعاينة غير متوفرة لهذه الصيغة."
                : "The Excel file is ready. Preview is not available for this format."}
            </p>
            <Button onClick={handleDownload} className="gap-1.5">
              <Download className="w-4 h-4" />
              {isAr ? "تنزيل الملف" : "Download file"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
