export const CLEARANCE_LETTER_MAX_BYTES = 10 * 1024 * 1024;
export const CLEARANCE_LETTER_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);
export const CLEARANCE_LETTER_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export function mimeFromClearanceFileName(fileName: string): string {
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

export function validateClearanceLetterFile(fileName: string, byteLength: number): void {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!CLEARANCE_LETTER_EXTENSIONS.has(ext)) {
    throw new Error("Invalid file type. Allowed: PDF, JPG, PNG.");
  }
  if (byteLength <= 0) {
    throw new Error("Empty file.");
  }
  if (byteLength > CLEARANCE_LETTER_MAX_BYTES) {
    throw new Error(`File too large. Maximum size is ${CLEARANCE_LETTER_MAX_BYTES / (1024 * 1024)}MB.`);
  }
}

export function decodeBase64Payload(raw: string): Buffer {
  const trimmed = raw.trim();
  const payload = trimmed.includes(",") ? trimmed.split(",").pop()! : trimmed;
  const buffer = Buffer.from(payload, "base64");
  if (!buffer.length) {
    throw new Error("Invalid file encoding.");
  }
  return buffer;
}

export function sanitizeUploadFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "upload";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
}
