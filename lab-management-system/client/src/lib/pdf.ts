/**
 * pdf.ts — Shared PDF generation utility
 * Uses the server-side /api/pdf/generate endpoint (puppeteer)
 * Falls back to window.print() if the server fails
 */

export interface PdfOptions {
  /** HTML content to convert */
  html: string;
  /** Suggested filename without extension */
  filename?: string;
  /** Open in new tab for printing instead of downloading */
  mode?: "download" | "print";
}

/**
 * Generate a real PDF from HTML via the server-side puppeteer endpoint.
 * Returns true on success, false on failure (caller can fall back to window.print).
 */
export async function generatePdf(options: PdfOptions): Promise<boolean> {
  const { html, filename = "report", mode = "download" } = options;
  try {
    const res = await fetch("/api/pdf/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    });
    if (!res.ok) return false;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    if (mode === "print") {
      // Open in new tab so user can print
      const win = window.open(url, "_blank");
      if (win) {
        win.onload = () => {
          setTimeout(() => win.print(), 500);
        };
      }
    } else {
      // Download directly
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize a DOM element (including its root tag/classes) and send it to the PDF generator.
 * Injects the current page's stylesheet links and inline <style> blocks for rendering.
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: Omit<PdfOptions, "html">
): Promise<boolean> {
  // Collect all stylesheet links from the current page
  const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((el) => el.outerHTML)
    .join("\n");

  // Collect inline styles
  const inlineStyles = Array.from(document.querySelectorAll("style"))
    .map((el) => el.outerHTML)
    .join("\n");

  // Use outerHTML so classes on the captured root (e.g. lab-print-root) are included.
  // innerHTML only serializes children, which broke @media print rules scoped to that wrapper.
  const fragment = element.outerHTML;

  const html = `<!DOCTYPE html>
<html dir="${document.documentElement.dir || "rtl"}" lang="${document.documentElement.lang || "ar"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${styleLinks}
  ${inlineStyles}
  <style>
    @page { margin: 10mm; }
    body { margin: 0; padding: 0; background: white; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print\\:hidden { display: none !important; }
    /* Fallback when linked stylesheets fail to load in isolated PDF HTML */
    table { border-collapse: collapse !important; }
    th, td {
      border: 0.5pt solid #000 !important;
      border-style: solid !important;
      border-color: #000 !important;
    }
  </style>
</head>
<body>
  ${fragment}
</body>
</html>`;

  return generatePdf({ ...options, html });
}
