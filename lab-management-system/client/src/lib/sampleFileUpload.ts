/** Shared limits for scanned contractor forms at reception (PDF / image). */
export const CONTRACTOR_FORM_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const CONTRACTOR_FORM_MAX_BYTES = 10 * 1024 * 1024;

export function mimeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

export function validateContractorFormFile(file: File, lang: "ar" | "en"): void {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
    throw new Error(
      lang === "ar"
        ? "نوع الملف غير مدعوم. المسموح: PDF، JPG، PNG."
        : "Unsupported file type. Allowed: PDF, JPG, PNG.",
    );
  }
  if (file.size <= 0) {
    throw new Error(lang === "ar" ? "الملف فارغ." : "Empty file.");
  }
  if (file.size > CONTRACTOR_FORM_MAX_BYTES) {
    throw new Error(
      lang === "ar"
        ? "الملف كبير جداً. الحد الأقصى 10 ميجابايت."
        : "File too large. Maximum size is 10 MB.",
    );
  }
}

export function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      const base64 = result.includes(",") ? result.split(",").pop()! : result;
      resolve({
        base64,
        mimeType: file.type || mimeFromFileName(file.name),
      });
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
