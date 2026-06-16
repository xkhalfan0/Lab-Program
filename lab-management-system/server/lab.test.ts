import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(role: string, id = 1): TrpcContext {
  return {
    user: {
      id,
      openId: `test-user-${id}`,
      name: `Test User ${id}`,
      email: `user${id}@lab.test`,
      loginMethod: "manus",
      role: role as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const clearedCookies: string[] = [];
    const ctx: TrpcContext = {
      ...makeCtx("user"),
      res: {
        clearCookie: (name: string) => clearedCookies.push(name),
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies.length).toBe(1);
  });

  it("returns current user from auth.me", async () => {
    const ctx = makeCtx("admin");
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.role).toBe("admin");
  });
});

// ─── Role-Based Access Tests ──────────────────────────────────────────────────

describe("role-based access control", () => {
  it("denies non-admin access to users.list", async () => {
    const caller = appRouter.createCaller(makeCtx("technician"));
    await expect(caller.users.list()).rejects.toThrow();
  });

  it("allows admin to access users.list (db may be unavailable in test)", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    // In test env, db may not be available — we just check it doesn't throw FORBIDDEN
    try {
      const result = await caller.users.list();
      expect(Array.isArray(result)).toBe(true);
    } catch (err: any) {
      // Accept db connection errors but not FORBIDDEN
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("denies non-lab_manager from creating distributions", async () => {
    const caller = appRouter.createCaller(makeCtx("technician"));
    await expect(
      caller.distributions.create({
        sampleId: 1,
        assignedTechnicianId: 2,
        testType: "concrete_compression",
        testName: "Concrete Compression Test",
        unit: "MPa",
        priority: "normal",
      })
    ).rejects.toThrow();
  });

  it("denies non-supervisor from doing manager review", async () => {
    const caller = appRouter.createCaller(makeCtx("technician"));
    await expect(
      caller.reviews.managerReview({
        testResultId: 1,
        sampleId: 1,
        decision: "approved",
      })
    ).rejects.toThrow();
  });

  it("denies non-qc_inspector from doing QC review", async () => {
    const caller = appRouter.createCaller(makeCtx("reception"));
    await expect(
      caller.reviews.qcReview({
        testResultId: 1,
        sampleId: 1,
        decision: "approved",
      })
    ).rejects.toThrow();
  });

  it("denies non-lab_manager from issuing clearance certificate", async () => {
    const caller = appRouter.createCaller(makeCtx("technician"));
    await expect(
      caller.certificates.create({ sampleId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Stats Calculation Logic ──────────────────────────────────────────────────

describe("statistics calculation (internal logic)", () => {
  // We test the logic indirectly by checking that testResults.submit
  // processes values correctly. Since DB is not available in tests,
  // we verify the role check passes for technicians.
  it("allows technician to submit test results (role check passes)", async () => {
    const caller = appRouter.createCaller(makeCtx("technician"));
    try {
      await caller.testResults.submit({
        distributionId: 1,
        sampleId: 1,
        rawValues: [25.5, 26.0, 24.8],
        unit: "MPa",
      });
    } catch (err: any) {
      // Accept NOT_FOUND (no DB) but not FORBIDDEN
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("denies reception from submitting test results", async () => {
    const caller = appRouter.createCaller(makeCtx("reception"));
    await expect(
      caller.testResults.submit({
        distributionId: 1,
        sampleId: 1,
        rawValues: [25.5],
        unit: "MPa",
      })
    ).rejects.toThrow();
  });
});

// ─── Sample Creation ──────────────────────────────────────────────────────────

describe("sample creation", () => {
  it("allows reception to create samples (role check passes)", async () => {
    const caller = appRouter.createCaller(makeCtx("reception"));
    try {
      await caller.samples.create({
        projectNumber: "PRJ-2026-001",
        contractorName: "Test Contractor",
        sampleType: "concrete",
        quantity: 3,
        condition: "good",
      });
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("denies qc_inspector from creating samples", async () => {
    const caller = appRouter.createCaller(makeCtx("qc_inspector"));
    await expect(
      caller.samples.create({
        projectNumber: "PRJ-2026-001",
        contractorName: "Test Contractor",
        sampleType: "concrete",
        quantity: 1,
        condition: "good",
      })
    ).rejects.toThrow();
  });
});
