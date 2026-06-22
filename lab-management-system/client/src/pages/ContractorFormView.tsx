/**
 * Full-page contractor form viewer.
 * Opened in a new tab by ContractorFormViewButton.
 * Fetches the attachment for the given sampleId and either embeds
 * the file (PDF / image) or shows a clear "no form uploaded" state.
 */
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { FileText, Upload, AlertCircle, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}
function isPdf(mimeType: string | null | undefined) {
  return mimeType === "application/pdf";
}

export default function ContractorFormView() {
  const params = useParams<{ sampleId: string }>();
  const sampleId = Number(params.sampleId);

  const { data: attachments, isLoading, isError } = trpc.attachments.bySample.useQuery(
    { sampleId },
    { enabled: sampleId > 0 }
  );

  const form = attachments?.find((a) => a.attachmentType === "contractor_form");

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-slate-500 text-sm">Loading contractor form…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-sm w-full text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-lg font-bold text-red-700">Failed to load</h1>
          <p className="text-sm text-red-600">Could not retrieve attachments. Please try again or contact support.</p>
          <Button variant="outline" size="sm" onClick={() => window.close()}>Close</Button>
        </div>
      </div>
    );
  }

  if (!form?.fileUrl) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 px-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 max-w-md w-full text-center space-y-4">
          <div className="mx-auto w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
            <Upload className="w-9 h-9 text-slate-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-700">No Contractor Form Uploaded</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            No contractor form has been attached to this sample yet. The form can be uploaded during sample registration.
          </p>
          <p className="text-xs text-slate-400 font-mono">Sample ID: {sampleId}</p>
          <Button variant="outline" size="sm" onClick={() => window.close()}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const mime = form.mimeType ?? "";
  const fileUrl = form.fileUrl;
  const fileName = form.fileName ?? "contractor-form";

  return (
    <div className="min-h-screen flex flex-col bg-slate-100">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 flex items-center gap-3 px-4 py-2.5 shadow-sm">
        <div className="p-1.5 rounded-lg bg-emerald-50">
          <FileText className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{fileName}</p>
          <p className="text-xs text-slate-400">Sample ID: {sampleId}</p>
        </div>
        <a
          href={fileUrl}
          download={fileName}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </a>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => window.close()}>
          Close
        </Button>
      </div>

      {/* Viewer */}
      <div className="flex-1 flex flex-col items-center justify-start p-4">
        {isPdf(mime) ? (
          <iframe
            src={fileUrl}
            className="w-full max-w-5xl flex-1 rounded-xl shadow-md border border-slate-200 bg-white"
            style={{ minHeight: "calc(100vh - 80px)" }}
            title="Contractor Form"
          />
        ) : isImage(mime) ? (
          <div className="w-full max-w-4xl flex items-center justify-center">
            <img
              src={fileUrl}
              alt="Contractor Form"
              className="rounded-xl shadow-md border border-slate-200 max-w-full object-contain"
              style={{ maxHeight: "calc(100vh - 100px)" }}
            />
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 max-w-md w-full text-center space-y-4 mt-8">
            <div className="mx-auto w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center">
              <FileText className="w-9 h-9 text-slate-400" />
            </div>
            <h2 className="text-lg font-bold text-slate-700">File cannot be previewed</h2>
            <p className="text-sm text-slate-500">
              This file type (<span className="font-mono">{mime || "unknown"}</span>) cannot be displayed in the browser.
              Use the Download button above to open it.
            </p>
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download file
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
