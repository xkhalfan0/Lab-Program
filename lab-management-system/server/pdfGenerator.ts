import { Router, Request, Response } from "express";
import { launchPuppeteerBrowser } from "./puppeteerBrowser";

export function registerPdfRoutes(app: Router) {
  // POST /api/pdf/generate
  // Body: { html: string, filename?: string }
  // Returns: PDF binary
  app.post("/api/pdf/generate", async (req: Request, res: Response) => {
    try {
      const { html, filename = "report.pdf" } = req.body as {
        html: string;
        filename?: string;
      };

      if (!html || typeof html !== "string") {
        res.status(400).json({ error: "html field is required" });
        return;
      }

      const browser = await launchPuppeteerBrowser();

      const page = await browser.newPage();

      // Ensure @media print rules from stylesheets apply to PDF output
      await page.emulateMediaType("print");

      // Set content and wait for fonts/images to load
      await page.setContent(html, { waitUntil: "networkidle0" });

      // Wait for web fonts (e.g. Arabic) to finish loading so glyphs render
      // instead of tofu squares. Capped so a slow font CDN can't hang the request.
      try {
        await page.evaluate(
          () =>
            Promise.race([
              (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready,
              new Promise((resolve) => setTimeout(resolve, 4000)),
            ])
        );
      } catch {
        /* non-fatal: continue with whatever fonts are available */
      }

      // Generate PDF.
      // A small uniform margin provides a safe gutter; the report sheet is made
      // fluid (width:100%) in the print CSS so it fills exactly this printable
      // area without ever overflowing/clipping, regardless of mm rounding.
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
      margin: {
        top: "8mm",
        bottom: "8mm",
        left: "8mm",
        right: "8mm",
      },
      });

      await browser.close();

      // Send PDF as response
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(filename)}"`
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (error) {
      console.error("[PDF Generator] Error:", error);
      res.status(500).json({
        error: "Failed to generate PDF",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
