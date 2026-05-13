import { Router, Request, Response } from "express";
import puppeteer from "puppeteer";

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

      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });

      const page = await browser.newPage();

      // Ensure @media print rules from stylesheets apply to PDF output
      await page.emulateMediaType("print");

      // Set content and wait for fonts/images to load
      await page.setContent(html, { waitUntil: "networkidle0" });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "15mm",
          bottom: "15mm",
          left: "15mm",
          right: "15mm",
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
