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
 * Inlines the current page's CSS so the isolated PDF HTML renders with full styling.
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: Omit<PdfOptions, "html">
): Promise<boolean> {
  const origin = window.location.origin;

  // Inline stylesheet contents. The PDF server uses puppeteer's setContent(), which has
  // no base URL, so linked /assets/*.css cannot be resolved and the report renders unstyled.
  // Fetching the CSS text (same-origin) and inlining it makes the HTML fully self-contained.
  const linkEls = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  );
  const cssChunks = await Promise.all(
    linkEls.map(async (el) => {
      try {
        const res = await fetch(el.href);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const css = await res.text();
        return `<style>${css}</style>`;
      } catch {
        // Fall back to an absolute-href link tag (resolves via <base>)
        return `<link rel="stylesheet" href="${el.href}">`;
      }
    })
  );
  const styleLinks = cssChunks.join("\n");

  // Collect inline styles (e.g. component-level @media print blocks)
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
  <base href="${origin}/">
  <!-- Arabic + Latin web fonts so the PDF server (headless Chromium, no system Arabic font) renders Arabic instead of tofu squares -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Noto+Naskh+Arabic:wght@400;700&family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  ${styleLinks}
  ${inlineStyles}
  <style>
    /* The PDF supplies a 6mm gutter; the sheet fills the rest fluidly. */
    @page { size: A4; margin: 0; }
    /* Ensure Arabic glyphs have a font; keep a Latin-first stack with Arabic fallbacks */
    html, body, .lab-print-root, .lab-print-root * {
      font-family: 'Noto Sans', 'Cairo', 'Noto Naskh Arabic', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    }
    body { margin: 0; padding: 0; background: white; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    /* Make the report sheet fluid so it always fits the PDF's printable area
       (no fixed 210mm that can overflow/clip). It supplies its own 10mm padding
       as the content margin; the on-screen React preview is unaffected. */
    .lab-print-root {
      box-sizing: border-box !important;
      width: 100% !important;
      max-width: 100% !important;
      min-height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
    }
    /* Keep wide content (tables, charts, images) inside the sheet */
    .lab-print-root table { width: 100% !important; max-width: 100% !important; }
    .lab-print-root img, .lab-print-root svg, .lab-print-root canvas { max-width: 100% !important; }
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
