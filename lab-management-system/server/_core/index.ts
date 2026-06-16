import "dotenv/config";
import express from "express";
import path from "path";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes } from "./localAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startScheduledJobs } from "../scheduledJobs";
import { handleUserSSE, handleSectorSSE } from "../sse";
import { registerPdfRoutes } from "../pdfGenerator";
import adminImportRouter from "../routes/admin-import.js";
import { sdk } from "./sdk";
import { createAuditLog, getSampleByIdIncludingDeleted, softDeleteSample } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(adminImportRouter);

  app.post("/api/samples/:id/delete", async (req, res) => {
    try {
      const sampleId = parseInt(req.params.id, 10);
      if (!Number.isFinite(sampleId) || sampleId <= 0) {
        return res.status(400).json({ success: false, error: "Invalid sample id" });
      }

      const user = await sdk.authenticateRequest(req);
      if (user.role !== "admin") {
        return res.status(403).json({ success: false, error: "Admin role required" });
      }

      const existing = await getSampleByIdIncludingDeleted(sampleId);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Sample not found" });
      }
      if ((existing as any).deletedAt) {
        return res.status(400).json({ success: false, error: "Sample already deleted" });
      }

      await softDeleteSample(sampleId, user.id);
      await createAuditLog({
        userId: user.id,
        userName: user.name ?? "Unknown",
        action: "sample_deleted",
        entity: "sample",
        entityId: sampleId,
        entityLabel: existing.sampleCode ?? String(sampleId),
        oldValue: {
          status: existing.status,
          sampleCode: existing.sampleCode,
          deletedAt: null,
        },
        newValue: {
          deletedAt: new Date().toISOString(),
          deletedBy: user.id,
        },
        ipAddress: req.ip,
      });

      return res.json({ success: true, message: "Sample deleted successfully" });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message ?? "Internal server error" });
    }
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Local username/password auth
  registerLocalAuthRoutes(app);
  // PDF generation endpoint
  registerPdfRoutes(app);

  // SSE endpoints for real-time notifications
  app.get("/api/notifications/stream", handleUserSSE);
  app.get("/api/notifications/sector-stream", handleSectorSSE);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // Uploaded files (clearance letters, attachments) when using local disk storage
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
    startScheduledJobs();
  });
}

startServer().catch(console.error);
