/**
 * Dashboard Router
 * Provides KPIs, alerts, team performance, activity feed, and sector workload
 * for Admin Dashboard and Supervisor Dashboard.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  CLEARANCE_IN_PROGRESS,
  DISTRIBUTION_STATUS_GROUPS,
  LAB_ORDER_STATUS_GROUPS,
  SAMPLE_STATUS_GROUPS,
  isInGroup,
} from "@shared/statusGroups";
import {
  getAllSamples,
  getAllUsers,
  getAllDistributions,
  getAllLabOrders,
  getAllClearanceRequests,
  getDistributionsBySample,
  getLabOrderItems,
  getTestResultBySample,
  getSpecializedTestResultByDistribution,
  getAuditLogs,
} from "../db";


// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOf(period: "today" | "week" | "month", now: Date): Date {
  const d = new Date(now);
  if (period === "today") {
    d.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    const day = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

function startOfPrev(period: "today" | "week" | "month", now: Date): { from: Date; to: Date } {
  const cur = startOf(period, now);
  if (period === "today") {
    const from = new Date(cur);
    from.setDate(from.getDate() - 1);
    const to = new Date(cur);
    to.setMilliseconds(-1);
    return { from, to };
  } else if (period === "week") {
    const from = new Date(cur);
    from.setDate(from.getDate() - 7);
    const to = new Date(cur);
    to.setMilliseconds(-1);
    return { from, to };
  } else {
    const from = new Date(cur);
    from.setMonth(from.getMonth() - 1);
    const to = new Date(cur);
    to.setMilliseconds(-1);
    return { from, to };
  }
}

const IN_PROGRESS_STATUSES: string[] = [...SAMPLE_STATUS_GROUPS.inProgress];
const COMPLETED_STATUSES: string[] = [...SAMPLE_STATUS_GROUPS.completed];
const FAILED_STATUSES: string[] = [...SAMPLE_STATUS_GROUPS.failed];
const PENDING_STATUSES: string[] = ["received"];
const ALL_ACTIVE: string[] = [...PENDING_STATUSES, ...IN_PROGRESS_STATUSES];

const SLA_HOURS = 72;
const STUCK_HOURS = 24;
const DIST_ACTIVE_STATUSES: string[] = [...DISTRIBUTION_STATUS_GROUPS.open];
const DIST_DONE_STATUSES: string[] = ["completed", "cancelled"];
const NOT_OVERDUE_SAMPLE_STATUSES: string[] = [
  ...COMPLETED_STATUSES,
  ...FAILED_STATUSES,
  "deleted",
];

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function ageDays(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export const dashboardRouter = router({
  /**
   * Main KPIs endpoint — responds to time filter
   */
  kpis: protectedProcedure
    .input(z.object({ period: z.enum(["today", "week", "month"]).default("today") }))
    .query(async ({ input }) => {
      const now = new Date();
      const periodStart = startOf(input.period, now);
      const prev = startOfPrev(input.period, now);

      const allSamples = await getAllSamples();

      // Filter by period
      const periodSamples = allSamples.filter(
        (s) => new Date(s.receivedAt) >= periodStart
      );
      const prevSamples = allSamples.filter(
        (s) =>
          new Date(s.receivedAt) >= prev.from &&
          new Date(s.receivedAt) <= prev.to
      );

      // KPI 1: Total samples in period
      const totalSamples = periodSamples.length;
      const prevTotal = prevSamples.length;
      const totalTrend =
        prevTotal > 0
          ? Math.round(((totalSamples - prevTotal) / prevTotal) * 100)
          : totalSamples > 0
          ? 100
          : 0;

      // KPI 2: In Progress (all time active)
      const inProgress = allSamples.filter((s) =>
        IN_PROGRESS_STATUSES.includes(s.status)
      ).length;

      // KPI 3 + pending distribution (distribution-based SLA)
      const sampleWithDistMeta = await Promise.all(
        allSamples.map(async (s) => {
          const dists = await getDistributionsBySample(s.id);
          return { sample: s, dists };
        })
      );
      const pendingDistribution = sampleWithDistMeta.filter(({ sample, dists }) =>
        sample.status === "received" && dists.length === 0
      ).length;
      const overdue = sampleWithDistMeta.filter(({ sample, dists }) => {
        if (NOT_OVERDUE_SAMPLE_STATUSES.includes(sample.status)) return false;
        if (!dists.length) return false;
        return dists.some((d) => {
          if (!d.expectedCompletionDate) return false;
          if (DIST_DONE_STATUSES.includes(d.status)) return false;
          return now.getTime() > new Date(d.expectedCompletionDate).getTime();
        });
      }).length;

      // KPI 4: Completed in period
      const completed = periodSamples.filter((s) =>
        COMPLETED_STATUSES.includes(s.status)
      ).length;
      const prevCompleted = prevSamples.filter((s) =>
        COMPLETED_STATUSES.includes(s.status)
      ).length;
      const completedTrend =
        prevCompleted > 0
          ? Math.round(((completed - prevCompleted) / prevCompleted) * 100)
          : completed > 0
          ? 100
          : 0;

      // KPI 5: Average TAT (hours) for completed samples in period
      const completedWithTime = periodSamples.filter(
        (s) =>
          COMPLETED_STATUSES.includes(s.status) &&
          s.receivedAt &&
          s.updatedAt
      );
      const avgTAT =
        completedWithTime.length > 0
          ? Math.round(
              completedWithTime.reduce((sum, s) => {
                const diff =
                  new Date(s.updatedAt).getTime() -
                  new Date(s.receivedAt).getTime();
                return sum + diff / (1000 * 60 * 60);
              }, 0) / completedWithTime.length
            )
          : 0;

      // KPI 6: Failed / Non-compliant in period
      const failed = periodSamples.filter((s) =>
        FAILED_STATUSES.includes(s.status)
      ).length;
      const prevFailed = prevSamples.filter((s) =>
        FAILED_STATUSES.includes(s.status)
      ).length;
      const failedTrend =
        prevFailed > 0
          ? Math.round(((failed - prevFailed) / prevFailed) * 100)
          : failed > 0
          ? 100
          : 0;

      const allOrders = await getAllLabOrders();
      const pendingManagerReview =
        allOrders.filter((o) =>
          isInGroup(o.status, LAB_ORDER_STATUS_GROUPS.pendingMgrReview)
        ).length +
        allSamples.filter((s) =>
          isInGroup(s.status, SAMPLE_STATUS_GROUPS.pendingMgrReview)
        ).length;
      const pendingQcReview =
        allOrders.filter((o) =>
          isInGroup(o.status, LAB_ORDER_STATUS_GROUPS.pendingQcReview)
        ).length +
        allSamples.filter((s) =>
          isInGroup(s.status, SAMPLE_STATUS_GROUPS.pendingQcReview)
        ).length;

      return {
        totalSamples: { value: totalSamples, trend: totalTrend, prev: prevTotal },
        inProgress: { value: inProgress },
        overdue: { value: overdue },
        pendingDistribution: { value: pendingDistribution },
        completed: { value: completed, trend: completedTrend, prev: prevCompleted },
        avgTAT: { value: avgTAT },
        failed: { value: failed, trend: failedTrend, prev: prevFailed },
        pendingManagerReview: { value: pendingManagerReview },
        pendingQcReview: { value: pendingQcReview },
      };
    }),

  /**
   * Sample flow over time (line chart) — last N days
   */
  sampleFlow: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }))
    .query(async ({ input }) => {
      const allSamples = await getAllSamples();
      const now = new Date();
      const result: { date: string; received: number; completed: number }[] = [];

      for (let i = input.days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const dEnd = new Date(d);
        dEnd.setHours(23, 59, 59, 999);

        const received = allSamples.filter((s) => {
          const t = new Date(s.receivedAt).getTime();
          return t >= d.getTime() && t <= dEnd.getTime();
        }).length;

        const completed = allSamples.filter((s) => {
          if (!COMPLETED_STATUSES.includes(s.status)) return false;
          const t = new Date(s.updatedAt).getTime();
          return t >= d.getTime() && t <= dEnd.getTime();
        }).length;

        result.push({
          date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          received,
          completed,
        });
      }

      return result;
    }),

  /**
   * Sample status distribution (donut chart)
   */
  statusDistribution: protectedProcedure
    .input(z.object({ period: z.enum(["today", "week", "month", "all"]).default("all") }))
    .query(async ({ input }) => {
      const allSamples = await getAllSamples();
      const now = new Date();

      let samples = allSamples;
      if (input.period !== "all") {
        const from = startOf(input.period as "today" | "week" | "month", now);
        samples = allSamples.filter((s) => new Date(s.receivedAt) >= from);
      }

      const groups = {
        new: samples.filter((s) => s.status === "received").length,
        inProgress: samples.filter((s) => IN_PROGRESS_STATUSES.includes(s.status)).length,
        completed: samples.filter((s) => COMPLETED_STATUSES.includes(s.status)).length,
        failed: samples.filter((s) => FAILED_STATUSES.includes(s.status)).length,
      };

      return [
        { name: "New", nameAr: "جديد", value: groups.new, color: "#3b82f6" },
        { name: "In Progress", nameAr: "قيد التنفيذ", value: groups.inProgress, color: "#f59e0b" },
        { name: "Completed", nameAr: "مكتملة", value: groups.completed, color: "#10b981" },
        { name: "Failed", nameAr: "مرفوضة", value: groups.failed, color: "#ef4444" },
      ];
    }),

  /**
   * Workload by sector (bar chart)
   */
  sectorWorkload: protectedProcedure
    .input(z.object({ period: z.enum(["today", "week", "month", "all"]).default("month") }))
    .query(async ({ input }) => {
      const allSamples = await getAllSamples();
      const now = new Date();

      let samples = allSamples;
      if (input.period !== "all") {
        const from = startOf(input.period as "today" | "week" | "month", now);
        samples = allSamples.filter((s) => new Date(s.receivedAt) >= from);
      }

      const sectors = ["sector_1", "sector_2", "sector_3", "sector_4", "sector_5"];
      return sectors.map((sector) => {
        const sectorSamples = samples.filter((s) => s.sector === sector);
        return {
          sector: sector.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          sectorKey: sector,
          total: sectorSamples.length,
          active: sectorSamples.filter((s) => ALL_ACTIVE.includes(s.status)).length,
          completed: sectorSamples.filter((s) => COMPLETED_STATUSES.includes(s.status)).length,
        };
      });
    }),

  /**
   * Critical alerts — overdue, stuck, failed
   */
  alerts: protectedProcedure.query(async () => {
    const allSamples = await getAllSamples();
    const now = new Date();
    const slaMs = SLA_HOURS * 60 * 60 * 1000;
    const stuckMs = STUCK_HOURS * 60 * 60 * 1000;

    const alerts: {
      sampleId: number;
      sampleCode: string;
      issueType: "overdue" | "stuck" | "failed" | "sla_breach";
      issueLabel: string;
      issueLabelAr: string;
      delayHours: number;
      severity: "critical" | "warning" | "info";
      status: string;
      sector: string;
    }[] = [];

    for (const s of allSamples) {
      const ageMs = now.getTime() - new Date(s.receivedAt).getTime();
      const lastUpdateMs = now.getTime() - new Date(s.updatedAt).getTime();
      const ageHours = Math.round(ageMs / (1000 * 60 * 60));
      const stuckHours = Math.round(lastUpdateMs / (1000 * 60 * 60));

      // Failed / rejected
      if (FAILED_STATUSES.includes(s.status)) {
        alerts.push({
          sampleId: s.id,
          sampleCode: s.sampleCode,
          issueType: "failed",
          issueLabel: "Failed / Rejected",
          issueLabelAr: "مرفوض / فاشل",
          delayHours: ageHours,
          severity: "critical",
          status: s.status,
          sector: s.sector,
        });
        continue;
      }

      if (COMPLETED_STATUSES.includes(s.status)) continue;

      const dists = await getDistributionsBySample(s.id);

      // SLA breach: sample must be distributed and past expected completion date
      const hasSlaBreach = !NOT_OVERDUE_SAMPLE_STATUSES.includes(s.status) && dists.some((d) => {
        if (!d.expectedCompletionDate) return false;
        if (DIST_DONE_STATUSES.includes(d.status)) return false;
        return now.getTime() > new Date(d.expectedCompletionDate).getTime();
      });

      if (hasSlaBreach) {
        alerts.push({
          sampleId: s.id,
          sampleCode: s.sampleCode,
          issueType: "sla_breach",
          issueLabel: "SLA Exceeded",
          issueLabelAr: "تجاوز وقت الخدمة",
          delayHours: ageHours,
          severity: "critical",
          status: s.status,
          sector: s.sector,
        });
      } else if (lastUpdateMs > stuckMs && IN_PROGRESS_STATUSES.includes(s.status) && dists.some((d) => isInGroup(d.status, DIST_ACTIVE_STATUSES))) {
        // Stuck (no update for 24h)
        alerts.push({
          sampleId: s.id,
          sampleCode: s.sampleCode,
          issueType: "stuck",
          issueLabel: `No Update (${stuckHours}h)`,
          issueLabelAr: `لا تحديث (${stuckHours} ساعة)`,
          delayHours: stuckHours,
          severity: "warning",
          status: s.status,
          sector: s.sector,
        });
      }
    }

    // Sort by severity then delay
    return alerts
      .sort((a, b) => {
        const sev = { critical: 0, warning: 1, info: 2 };
        if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity];
        return b.delayHours - a.delayHours;
      })
      .slice(0, 20);
  }),

  /**
   * Team performance — technicians with sample counts and avg TAT
   */
  teamPerformance: protectedProcedure
    .input(z.object({ period: z.enum(["today", "week", "month"]).default("month") }))
    .query(async ({ input }) => {
      const allSamples = await getAllSamples();
      const allUsers = await getAllUsers();
      const now = new Date();
      const from = startOf(input.period, now);

      const periodSamples = allSamples.filter(
        (s) => new Date(s.receivedAt) >= from
      );

      const technicians = allUsers.filter(
        (u) => u.role === "technician" && u.isActive
      );

      const result = await Promise.all(
        technicians.map(async (tech) => {
          const techDists: { sampleId: number; createdAt: Date; updatedAt: Date; status: string }[] = [];
          for (const s of periodSamples) {
            const dists = await getDistributionsBySample(s.id);
            for (const d of dists) {
              if (d.assignedTechnicianId === tech.id) {
                techDists.push({
                  sampleId: s.id,
                  createdAt: new Date(d.createdAt),
                  updatedAt: new Date(d.updatedAt),
                  status: d.status,
                });
              }
            }
          }

          const completed = techDists.filter((d) => d.status === "completed");
          const avgTAT =
            completed.length > 0
              ? Math.round(
                  completed.reduce((sum, d) => {
                    return (
                      sum +
                      (d.updatedAt.getTime() - d.createdAt.getTime()) /
                        (1000 * 60 * 60)
                    );
                  }, 0) / completed.length
                )
              : 0;

          return {
            id: tech.id,
            name: tech.name ?? "Unknown",
            samplesHandled: techDists.length,
            completed: completed.length,
            pending: techDists.filter((d) => d.status === "pending").length,
            avgTAT,
          };
        })
      );

      return result.sort((a, b) => b.samplesHandled - a.samplesHandled);
    }),

  /**
   * Recent activity feed — last N events from audit log + sample history
   */
  recentActivity: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(50).default(15) }))
    .query(async ({ input }) => {
      const logs = await getAuditLogs({ limit: input.limit });
      const allUsers = await getAllUsers();

      return logs.map((log) => {
        const user = allUsers.find((u) => u.id === log.userId);
        return {
          id: log.id,
          action: log.action,
          entity: log.entity,
          entityId: log.entityId,
          userName: user?.name ?? "System",
          userRole: user?.role ?? "system",
          timestamp: log.createdAt,
          details: log.entityLabel ?? null,
        };
      });
    }),

  /**
   * Lab activity feed — real lab events: sample registration, distribution, test results, QC reviews
   */
  labActivity: protectedProcedure
    .input(z.object({ limit: z.number().min(5).max(50).default(20) }))
    .query(async ({ input }) => {
      const allSamples = await getAllSamples();
      const allUsers = await getAllUsers();

      const events: {
        id: string;
        type: "sample_received" | "distributed" | "result_submitted" | "qc_reviewed" | "clearance_issued" | "status_changed";
        typeAr: string;
        typeEn: string;
        sampleCode: string;
        sampleId: number;
        actor: string;
        actorRole: string;
        timestamp: Date;
        details: string;
        detailsAr: string;
        severity: "info" | "success" | "warning" | "error";
      }[] = [];

      // Sample registration events
      for (const s of allSamples) {
        const receivedByUser = allUsers.find(u => u.id === (s as any).receivedById);
        events.push({
          id: `sample-${s.id}`,
          type: "sample_received",
          typeAr: "استلام عينة",
          typeEn: "Sample Received",
          sampleCode: s.sampleCode,
          sampleId: s.id,
          actor: receivedByUser?.name ?? "موظف الاستقبال",
          actorRole: receivedByUser?.role ?? "reception",
          timestamp: new Date(s.receivedAt ?? s.createdAt),
          details: `${s.sampleType} — ${s.contractorName ?? ""}`,
          detailsAr: `${s.sampleType} — ${s.contractorName ?? ""}`,
          severity: "info",
        });

        // Status change events
        if (s.status === "qc_passed" || s.status === "approved") {
          events.push({
            id: `qc-pass-${s.id}`,
            type: "qc_reviewed",
            typeAr: "اعتماد QC",
            typeEn: "QC Approved",
            sampleCode: s.sampleCode,
            sampleId: s.id,
            actor: "مفتش الجودة",
            actorRole: "qc_inspector",
            timestamp: new Date(s.updatedAt),
            details: `Approved: ${s.sampleType}`,
            detailsAr: `تم الاعتماد: ${s.sampleType}`,
            severity: "success",
          });
        } else if (s.status === "qc_failed" || s.status === "rejected") {
          events.push({
            id: `qc-fail-${s.id}`,
            type: "qc_reviewed",
            typeAr: "رفض QC",
            typeEn: "QC Rejected",
            sampleCode: s.sampleCode,
            sampleId: s.id,
            actor: "مفتش الجودة",
            actorRole: "qc_inspector",
            timestamp: new Date(s.updatedAt),
            details: `Rejected: ${s.sampleType}`,
            detailsAr: `تم الرفض: ${s.sampleType}`,
            severity: "error",
          });
        } else if (s.status === "clearance_issued") {
          events.push({
            id: `clearance-${s.id}`,
            type: "clearance_issued",
            typeAr: "إصدار براءة ذمة",
            typeEn: "Clearance Issued",
            sampleCode: s.sampleCode,
            sampleId: s.id,
            actor: "مدير المختبر",
            actorRole: "lab_manager",
            timestamp: new Date(s.updatedAt),
            details: `Clearance for: ${s.contractorName ?? ""}`,
            detailsAr: `براءة ذمة: ${s.contractorName ?? ""}`,
            severity: "success",
          });
        } else if (s.status === "distributed" || s.status === "tested") {
          events.push({
            id: `dist-${s.id}`,
            type: "distributed",
            typeAr: "توزيع على فني",
            typeEn: "Distributed to Technician",
            sampleCode: s.sampleCode,
            sampleId: s.id,
            actor: "مدير المختبر",
            actorRole: "lab_manager",
            timestamp: new Date(s.updatedAt),
            details: `Distributed: ${s.sampleType}`,
            detailsAr: `تم التوزيع: ${s.sampleType}`,
            severity: "info",
          });
        } else if (s.status === "processed" || s.status === "reviewed" || s.status === "revision_requested") {
          events.push({
            id: `result-${s.id}`,
            type: "result_submitted",
            typeAr: "إدخال نتائج",
            typeEn: "Results Submitted",
            sampleCode: s.sampleCode,
            sampleId: s.id,
            actor: "الفني",
            actorRole: "technician",
            timestamp: new Date(s.updatedAt),
            details: `Results for: ${s.sampleType}`,
            detailsAr: `نتائج: ${s.sampleType}`,
            severity: "info",
          });
        }
      }

      // Sort by timestamp desc and limit
      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      return events.slice(0, input.limit);
    }),

  /**
   * Pass rate by contractor — groups samples by contractorName
   * and calculates pass/fail/total counts + pass rate %
   */
  passRateByContractor: protectedProcedure
    .input(z.object({ period: z.enum(["today", "week", "month", "all"]).default("all") }))
    .query(async ({ input }) => {
      const allSamples = await getAllSamples();
      const now = new Date();

      let filtered = allSamples;
      if (input.period !== "all") {
        const from = startOf(input.period as "today" | "week" | "month", now);
        filtered = allSamples.filter(s => s.createdAt && new Date(s.createdAt) >= from);
      }

      // Only samples that reached a final decision
      const finalSamples = filtered.filter(s =>
        ["qc_passed", "qc_failed", "approved", "rejected", "clearance_issued"].includes(s.status ?? "")
      );

      const map = new Map<string, { total: number; passed: number; failed: number }>();
      for (const s of finalSamples) {
        const key = s.contractorName?.trim() || "Unknown";
        if (!map.has(key)) map.set(key, { total: 0, passed: 0, failed: 0 });
        const entry = map.get(key)!;
        entry.total++;
        if (["qc_passed", "approved", "clearance_issued"].includes(s.status ?? "")) entry.passed++;
        else entry.failed++;
      }

      return Array.from(map.entries())
        .map(([name, stats]) => ({
          name,
          total: stats.total,
          passed: stats.passed,
          failed: stats.failed,
          passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);
    }),

  /**
   * Pass rate by contract number — groups samples by contractNumber
   */
  passRateByContract: protectedProcedure
    .input(z.object({ period: z.enum(["today", "week", "month", "all"]).default("all") }))
    .query(async ({ input }) => {
      const allSamples = await getAllSamples();
      const now = new Date();

      let filtered = allSamples;
      if (input.period !== "all") {
        const from = startOf(input.period as "today" | "week" | "month", now);
        filtered = allSamples.filter(s => s.createdAt && new Date(s.createdAt) >= from);
      }

      const finalSamples = filtered.filter(s =>
        ["qc_passed", "qc_failed", "approved", "rejected", "clearance_issued"].includes(s.status ?? "")
      );

      const map = new Map<string, { total: number; passed: number; failed: number; contractorName: string; contractName: string }>();
      for (const s of finalSamples) {
        const key = s.contractNumber?.trim() || "No Contract";
        if (!map.has(key)) map.set(key, { total: 0, passed: 0, failed: 0, contractorName: s.contractorName ?? "", contractName: s.contractName ?? "" });
        const entry = map.get(key)!;
        entry.total++;
        if (["qc_passed", "approved", "clearance_issued"].includes(s.status ?? "")) entry.passed++;
        else entry.failed++;
      }

      return Array.from(map.entries())
        .map(([contractNumber, stats]) => ({
          contractNumber,
          contractName: stats.contractName,
          contractorName: stats.contractorName,
          total: stats.total,
          passed: stats.passed,
          failed: stats.failed,
          passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);
    }),

  reviewQueue: protectedProcedure.query(async () => {
    const now = new Date();
    const orders = (await getAllLabOrders()).filter(
      (o) =>
        isInGroup(o.status, LAB_ORDER_STATUS_GROUPS.pendingMgrReview) ||
        isInGroup(o.status, LAB_ORDER_STATUS_GROUPS.pendingQcReview)
    );

    const rows = await Promise.all(
      orders.map(async (o) => {
        const items = await getLabOrderItems(o.id);
        const testName = items[0]?.testTypeName ?? items[0]?.testTypeCode ?? "—";
        const waitHours = Math.round(
          (now.getTime() - new Date(o.updatedAt).getTime()) / (1000 * 60 * 60)
        );
        return {
          orderCode: o.orderCode,
          testName,
          waitHours,
          priority: o.priority ?? "normal",
        };
      })
    );

    return rows.sort((a, b) => b.waitHours - a.waitHours);
  }),

  stuckOrders: protectedProcedure.query(async () => {
    const now = new Date();
    const stuck: { code: string; reason: string; reasonAr: string; ageDays: number }[] = [];

    const orders = await getAllLabOrders();
    for (const o of orders) {
      const created = new Date(o.createdAt);
      const age = ageDays(created, now);
      if (
        isInGroup(o.status, LAB_ORDER_STATUS_GROUPS.inProgress) &&
        age > 3
      ) {
        stuck.push({
          code: o.orderCode,
          reason: "in testing",
          reasonAr: "قيد الفحص",
          ageDays: age,
        });
      } else if (o.status === "completed" && age > 2) {
        stuck.push({
          code: o.orderCode,
          reason: "review wait",
          reasonAr: "بانتظار المراجعة",
          ageDays: age,
        });
      }
    }

    const allSamples = await getAllSamples();
    for (const s of allSamples) {
      if (s.status === "deleted") continue;
      const dists = await getDistributionsBySample(s.id);
      const received = new Date(s.receivedAt ?? s.createdAt);
      const age = ageDays(received, now);

      if (
        s.status === "distributed" &&
        dists.length > 0 &&
        dists.every((d) => !d.assignedTechnicianId)
      ) {
        stuck.push({
          code: s.sampleCode,
          reason: "no technician assigned",
          reasonAr: "لم يُعيَّن فني",
          ageDays: age,
        });
      }

      const pastDue = dists.some((d) => {
        if (!d.expectedCompletionDate) return false;
        if (DIST_DONE_STATUSES.includes(d.status)) return false;
        return now.getTime() > new Date(d.expectedCompletionDate).getTime();
      });
      if (pastDue && !NOT_OVERDUE_SAMPLE_STATUSES.includes(s.status)) {
        stuck.push({
          code: s.sampleCode,
          reason: "past expected date",
          reasonAr: "تجاوز التاريخ المتوقع",
          ageDays: age,
        });
      }
    }

    return stuck.sort((a, b) => b.ageDays - a.ageDays).slice(0, 30);
  }),

  technicianStats: protectedProcedure.query(async () => {
    const weekStart = startOfWeek(new Date());
    const dists = await getAllDistributions();
    const activeTechIds = new Set<number>();

    for (const d of dists) {
      if (!d.assignedTechnicianId) continue;
      if (
        isInGroup(d.status, DISTRIBUTION_STATUS_GROUPS.open) ||
        new Date(d.updatedAt) >= weekStart
      ) {
        activeTechIds.add(d.assignedTechnicianId);
      }
    }

    const activeCount = activeTechIds.size;
    const completedThisWeek = dists.filter(
      (d) =>
        d.status === "completed" && new Date(d.updatedAt) >= weekStart
    ).length;
    const avgTestsPerTech =
      activeCount > 0
        ? Math.round((completedThisWeek / activeCount) * 10) / 10
        : 0;

    return { activeCount, avgTestsPerTech };
  }),

  technicianDailyWork: protectedProcedure.query(async () => {
    const todayStart = startOfToday();
    const dists = await getAllDistributions();
    const users = await getAllUsers();
    const techs = users.filter((u) => u.role === "technician" && u.isActive);

    return techs
      .map((tech) => {
        const mine = dists.filter((d) => d.assignedTechnicianId === tech.id);
        const assigned = mine.filter((d) =>
          isInGroup(d.status, DISTRIBUTION_STATUS_GROUPS.open)
        ).length;
        const doneToday = mine.filter(
          (d) =>
            d.status === "completed" && new Date(d.updatedAt) >= todayStart
        ).length;
        return {
          id: tech.id,
          name: tech.name ?? "Unknown",
          specialty: tech.specialty ?? "",
          assigned,
          doneToday,
        };
      })
      .filter((t) => t.assigned > 0 || t.doneToday > 0)
      .sort((a, b) => b.assigned - a.assigned);
  }),

  clearanceStats: protectedProcedure.query(async () => {
    const all = await getAllClearanceRequests();
    const active = all.filter((c) => c.status !== "rejected");
    return {
      totalRequests: active.length,
      inProgress: active.filter((c) =>
        isInGroup(c.status, CLEARANCE_IN_PROGRESS)
      ).length,
      issued: active.filter((c) => c.status === "issued").length,
    };
  }),
});
