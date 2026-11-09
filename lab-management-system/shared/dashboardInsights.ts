/**
 * Shared boss-dashboard computations (readiness, scorecard).
 * Used by ManagerDashboard and report generator.
 */

import { LAB_ORDER_STATUS_GROUPS, SAMPLE_STATUS_GROUPS, isInGroup } from "./statusGroups";

export type SampleKpis = {
  total: number;
  active: number;
  completed: number;
  needsAction: number;
  failed: number;
};

/** Aggregate sample KPIs from status histogram (matches DB groupBy). */
export function computeSampleKpisFromStatusCounts(
  byStatus: Array<{ status: string; count: number | string }>
): SampleKpis {
  let total = 0;
  let active = 0;
  let completed = 0;
  let needsAction = 0;
  let failed = 0;

  for (const row of byStatus) {
    const n = Number(row.count);
    if (!Number.isFinite(n) || n <= 0) continue;
    const status = row.status;
    if (status === "deleted") continue;

    total += n;

    if (isInGroup(status, SAMPLE_STATUS_GROUPS.completed)) {
      completed += n;
      continue;
    }
    if (isInGroup(status, SAMPLE_STATUS_GROUPS.failed)) {
      failed += n;
      continue;
    }

    active += n;
    if (isInGroup(status, SAMPLE_STATUS_GROUPS.needsAction)) {
      needsAction += n;
    }
  }

  return { total, active, completed, needsAction, failed };
}

/** Aggregate sample KPIs from individual sample rows. */
export function computeSampleKpis(
  samples: Array<{ status: string | null | undefined }>
): SampleKpis {
  const counts = new Map<string, number>();
  for (const s of samples) {
    const status = s.status ?? "unknown";
    if (status === "deleted") continue;
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return computeSampleKpisFromStatusCounts(
    Array.from(counts.entries()).map(([status, count]) => ({ status, count }))
  );
}

/** Aggregate order KPIs from status histogram (matches Reception / Distribution). */
export function computeOrderKpisFromStatusCounts(
  byStatus: Array<{ status: string; count: number | string }>
): SampleKpis {
  let total = 0;
  let active = 0;
  let completed = 0;
  let needsAction = 0;
  let failed = 0;

  for (const row of byStatus) {
    const n = Number(row.count);
    if (!Number.isFinite(n) || n <= 0) continue;
    const status = row.status;

    total += n;

    if (isInGroup(status, LAB_ORDER_STATUS_GROUPS.completed)) {
      completed += n;
      continue;
    }
    if (isInGroup(status, LAB_ORDER_STATUS_GROUPS.failed)) {
      failed += n;
      continue;
    }

    active += n;
    if (isInGroup(status, LAB_ORDER_STATUS_GROUPS.pending)) {
      needsAction += n;
    }
  }

  return { total, active, completed, needsAction, failed };
}

export type LabOrderRow = {
  id?: number;
  orderCode?: string | null;
  sampleCode?: string | null;
  contractNumber?: string | null;
  contractorName?: string | null;
  status?: string | null;
};

/** Show closure alerts when contract end is within this many days (includes overdue). */
export const CONTRACT_CLOSURE_ALERT_DAYS = 60;

export function buildContractEndDateMap(
  contracts: Array<{ contractNumber: string; endDate?: Date | string | null }>,
): Map<string, Date | null> {
  const map = new Map<string, Date | null>();
  for (const c of contracts) {
    const key = c.contractNumber?.trim();
    if (!key) continue;
    map.set(key, c.endDate ? new Date(c.endDate) : null);
  }
  return map;
}

/** Calendar days until end date (negative = overdue). Null if no end date. */
export function daysUntilContractEnd(endDate: Date | null | undefined, now = new Date()): number | null {
  if (!endDate) return null;
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function isContractInClosureAlertWindow(
  endDate: Date | null | undefined,
  daysBefore = CONTRACT_CLOSURE_ALERT_DAYS,
  now = new Date(),
): boolean {
  const days = daysUntilContractEnd(endDate, now);
  if (days === null) return false;
  return days <= daysBefore;
}

export type ContractReadinessRow = {
  contractNo: string;
  contractor: string;
  total: number;
  /** QC approved orders. */
  completed: number;
  /** Assigned or being tested. */
  inProgress: number;
  /** Not yet distributed. */
  pending: number;
  /** Technician finished; waiting for manager or QC. */
  waitingReview: number;
  rejected: number;
  /** Order codes still with the technician or not yet distributed. */
  openSamples: string[];
  /** Order codes waiting for the supervisor or QC. */
  reviewOrders: string[];
  readiness: number;
  endDate: Date | null;
  daysUntilEnd: number | null;
  inClosureWindow: boolean;
};

export type TestOutcome = "pass" | "fail" | "pending";

const SUBMITTED_FORM_STATUS = new Set(["submitted", "approved", "rejected", "processed"]);

/** Pass/fail from the test that was actually saved — concrete groups, specialized forms, or legacy results. */
export function resolveTestOutcome(input: {
  specialized?: { overallResult?: string | null; status?: string | null } | null;
  concreteGroups?: Array<{ complianceStatus?: string | null; status?: string | null }>;
  legacy?: { complianceStatus?: string | null; status?: string | null } | null;
}): TestOutcome {
  const concrete = (input.concreteGroups ?? []).filter(
    (g) =>
      !!g.status &&
      SUBMITTED_FORM_STATUS.has(g.status) &&
      (g.complianceStatus === "pass" || g.complianceStatus === "fail"),
  );
  if (concrete.some((g) => g.complianceStatus === "fail")) return "fail";
  if (concrete.some((g) => g.complianceStatus === "pass")) return "pass";

  const spec = input.specialized;
  if (spec?.status && SUBMITTED_FORM_STATUS.has(spec.status)) {
    if (spec.overallResult === "pass") return "pass";
    if (spec.overallResult === "fail") return "fail";
  }

  const legacy = input.legacy;
  if (legacy && (!legacy.status || SUBMITTED_FORM_STATUS.has(legacy.status))) {
    if (legacy.complianceStatus === "pass") return "pass";
    if (legacy.complianceStatus === "fail") return "fail";
  }
  return "pending";
}

export function computeContractReadinessRows(
  orders: LabOrderRow[],
  contractEndByNumber?: Map<string, Date | null>,
): ContractReadinessRow[] {
  const grouped = new Map<
    string,
    {
      contractNo: string;
      contractor: string;
      total: number;
      completed: number;
      inProgress: number;
      pending: number;
      waitingReview: number;
      rejected: number;
      openSamples: string[];
      reviewOrders: string[];
    }
  >();

  for (const o of orders) {
    const contractNo = o.contractNumber ?? "—";
    const contractor = o.contractorName ?? "—";
    const key = `${contractNo}::${contractor}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        contractNo,
        contractor,
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        waitingReview: 0,
        rejected: 0,
        openSamples: [],
        reviewOrders: [],
      });
    }
    const row = grouped.get(key)!;
    row.total++;
    const st = o.status ?? "";
    const order = o.orderCode?.trim();
    const sample = o.sampleCode?.trim();
    const label = order && sample ? `${order} · ${sample}` : order || sample || "";
    if (st === "qc_passed") row.completed++;
    else if (st === "rejected") row.rejected++;
    else if (st === "completed" || st === "reviewed") {
      row.waitingReview++;
      if (label) row.reviewOrders.push(label);
    } else if (st === "distributed" || st === "in_progress") {
      row.inProgress++;
      if (label) row.openSamples.push(label);
    } else {
      row.pending++;
      if (label) row.openSamples.push(label);
    }
  }

  return Array.from(grouped.values())
    .map((r) => {
      const endDate = contractEndByNumber?.get(r.contractNo) ?? null;
      const daysUntilEnd = daysUntilContractEnd(endDate);
      const inClosureWindow = isContractInClosureAlertWindow(endDate);
      return {
        ...r,
        readiness: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0,
        endDate,
        daysUntilEnd,
        inClosureWindow,
      };
    })
    .sort((a, b) => {
      if (a.inClosureWindow !== b.inClosureWindow) return a.inClosureWindow ? -1 : 1;
      if (a.daysUntilEnd != null && b.daysUntilEnd != null && a.daysUntilEnd !== b.daysUntilEnd) {
        return a.daysUntilEnd - b.daysUntilEnd;
      }
      return a.readiness - b.readiness;
    });
}

export function computeContractorScores(orders: LabOrderRow[]) {
  const grouped = new Map<
    string,
    { contractor: string; totalOrders: number; completedOrders: number; failedOrders: number }
  >();

  for (const o of orders) {
    const contractor = o.contractorName?.trim() || "Unknown";
    if (!grouped.has(contractor)) {
      grouped.set(contractor, { contractor, totalOrders: 0, completedOrders: 0, failedOrders: 0 });
    }
    const g = grouped.get(contractor)!;
    g.totalOrders++;
    const st = o.status ?? "";
    if (["completed", "qc_passed", "reviewed"].includes(st)) {
      g.completedOrders++;
    }
    if (LAB_ORDER_STATUS_GROUPS.failed.includes(st as "rejected")) g.failedOrders++;
  }

  const riskOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return Array.from(grouped.values())
    .map(g => {
      const passRate = g.totalOrders > 0 ? Math.round((g.completedOrders / g.totalOrders) * 100) : 0;
      let riskLevel: "low" | "medium" | "high" | "critical" = "low";
      if (passRate >= 80) riskLevel = "low";
      else if (passRate >= 60) riskLevel = "medium";
      else if (passRate >= 40) riskLevel = "high";
      else riskLevel = "critical";
      if (g.failedOrders >= 3) riskLevel = "critical";
      return { ...g, passRate, riskLevel };
    })
    .sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);
}

// ─── Per-order result classification ──────────────────────────────────────────

function orderResult(status: string): "pass" | "fail" | "pending" {
  // Final quality outcome only. "completed" = tests submitted, "reviewed" = waiting for QC.
  if (status === "qc_passed") return "pass";
  if (status === "rejected") return "fail";
  return "pending";
}

// ─── Contractor + project-level breakdown ─────────────────────────────────────

export type ContractProjectStat = {
  contractNo: string;
  total: number;
  decided: number;
  passed: number;
  failed: number;
  passRate: number;
};

export type ContractorBreakdown = {
  contractor: string;
  totalOrders: number;
  decided: number;
  passed: number;
  failed: number;
  passRate: number;
  contractCount: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  /** Fewer than 3 orders with pass/fail outcome — risk badge is not meaningful. */
  insufficientData: boolean;
  projects: ContractProjectStat[];
};

export function computeContractorBreakdown(orders: LabOrderRow[]): ContractorBreakdown[] {
  const byContractor = new Map<string, Map<string, ContractProjectStat>>();

  for (const o of orders) {
    const contractor = o.contractorName?.trim() || "Unknown";
    const contractNo = o.contractNumber?.trim() || "—";
    const res = orderResult(o.status ?? "");

    if (!byContractor.has(contractor)) byContractor.set(contractor, new Map());
    const projects = byContractor.get(contractor)!;
    if (!projects.has(contractNo)) {
      projects.set(contractNo, { contractNo, total: 0, decided: 0, passed: 0, failed: 0, passRate: 0 });
    }
    const p = projects.get(contractNo)!;
    p.total++;
    if (res !== "pending") {
      p.decided++;
      if (res === "pass") p.passed++;
      else p.failed++;
    }
  }

  const riskOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  return Array.from(byContractor.entries())
    .map(([contractor, projectsMap]) => {
      const projects = Array.from(projectsMap.values()).map(p => ({
        ...p,
        passRate: p.decided > 0 ? Math.round((p.passed / p.decided) * 100) : 0,
      }));

      const totalOrders = projects.reduce((s, p) => s + p.total, 0);
      const decided = projects.reduce((s, p) => s + p.decided, 0);
      const passed = projects.reduce((s, p) => s + p.passed, 0);
      const failed = projects.reduce((s, p) => s + p.failed, 0);
      const passRate = decided > 0 ? Math.round((passed / decided) * 100) : 0;
      const contractCount = projects.length;

      const insufficientData = decided < 3;
      let riskLevel: "low" | "medium" | "high" | "critical" = "low";
      if (!insufficientData) {
        if (passRate >= 80) riskLevel = "low";
        else if (passRate >= 60) riskLevel = "medium";
        else if (passRate >= 40) riskLevel = "high";
        else riskLevel = "critical";
      }

      return {
        contractor,
        totalOrders,
        decided,
        passed,
        failed,
        passRate,
        contractCount,
        riskLevel,
        insufficientData,
        projects,
      };
    })
    .sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);
}

// ─── Smart Quality Alerts ──────────────────────────────────────────────────────

export type QualityAlertType =
  | "contractor_systemic"   // contractor consistently low quality across many contracts
  | "project_anomaly"       // good contractor but one project has unusually high failures
  | "test_type_failure"     // a specific test type has very high fail rate
  | "retest_concentration"  // many retests concentrated in one contract/area
  | "closure_risk";         // contract near completion with many failing/pending tests

export type QualityAlert = {
  id: string;
  type: QualityAlertType;
  severity: "critical" | "high" | "medium";
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  metric: string;
  contractor?: string;
  contractNo?: string;
};

export function computeQualityAlerts(
  orders: LabOrderRow[],
  contractEndByNumber?: Map<string, Date | null>,
): QualityAlert[] {
  const alerts: QualityAlert[] = [];
  const breakdown = computeContractorBreakdown(orders);

  for (const c of breakdown) {
    // Only analyse contractors with at least 3 decided orders
    if (c.decided < 3) continue;

    // 1. Contractor systemic quality issue: ≥2 contracts, overall pass rate < 55%
    const badProjects = c.projects.filter(p => p.decided >= 2 && p.passRate < 50);
    if (c.contractCount >= 2 && c.passRate < 55 && badProjects.length >= Math.ceil(c.contractCount * 0.5)) {
      const severity = c.passRate < 35 ? "critical" : "high";
      alerts.push({
        id: `contractor_systemic_${c.contractor}`,
        type: "contractor_systemic",
        severity,
        titleEn: "Low-Quality Contractor",
        titleAr: "مقاول ذو جودة منخفضة",
        bodyEn: `${c.contractor} has a ${c.passRate}% pass rate across ${c.contractCount} contract(s) — ${badProjects.length} of them have majority failures.`,
        bodyAr: `${c.contractor} بنسبة نجاح ${c.passRate}% عبر ${c.contractCount} عقد — ${badProjects.length} منها يعاني من أغلبية حالات رفض.`,
        metric: `${c.passRate}% pass / ${c.contractCount} contracts`,
        contractor: c.contractor,
      });
    }

    // 2. Project/site anomaly: contractor overall OK (≥65%) but one contract has pass rate < 40%
    if (c.passRate >= 65) {
      for (const p of c.projects) {
        if (p.decided >= 3 && p.passRate < 40) {
          alerts.push({
            id: `project_anomaly_${c.contractor}_${p.contractNo}`,
            type: "project_anomaly",
            severity: p.passRate < 20 ? "critical" : "high",
            titleEn: "Site / Supplier Anomaly",
            titleAr: "شذوذ في الموقع أو المورد",
            bodyEn: `Contract ${p.contractNo} (${c.contractor}) has only ${p.passRate}% pass rate despite the contractor's overall ${c.passRate}% — possible site or supplier issue.`,
            bodyAr: `عقد ${p.contractNo} (${c.contractor}) لديه نسبة نجاح ${p.passRate}% فقط رغم أن أداء المقاول العام ${c.passRate}% — قد يشير إلى مشكلة في الموقع أو المورد.`,
            metric: `${p.passRate}% on contract ${p.contractNo}`,
            contractor: c.contractor,
            contractNo: p.contractNo,
          });
        }
      }
    }
  }

  // 3. Lab backlog before contract end (only if end date is within alert window)
  const readiness = computeContractReadinessRows(orders, contractEndByNumber);
  for (const r of readiness) {
    if (!r.inClosureWindow || r.endDate == null) continue;
    if (r.total >= 5 && r.readiness < 30 && r.pending >= 3) {
      const days = r.daysUntilEnd;
      const timeEn =
        days == null
          ? ""
          : days < 0
            ? ` Contract ended ${Math.abs(days)} day(s) ago.`
            : days === 0
              ? " Contract ends today."
              : ` ${days} day(s) until contract end.`;
      const timeAr =
        days == null
          ? ""
          : days < 0
            ? ` انتهى العقد منذ ${Math.abs(days)} يوماً.`
            : days === 0
              ? " ينتهي العقد اليوم."
              : ` متبقٍ ${days} يوماً على انتهاء العقد.`;
      alerts.push({
        id: `closure_risk_${r.contractNo}`,
        type: "closure_risk",
        severity: r.readiness < 15 || (days != null && days < 0) ? "critical" : "medium",
        titleEn: "Lab backlog before contract end",
        titleAr: "تأخر المختبر قبل انتهاء العقد",
        bodyEn: `Contract ${r.contractNo} (${r.contractor}): only ${r.readiness}% of lab orders are QC-approved (${r.completed}/${r.total}); ${r.pending} still pending.${timeEn}`,
        bodyAr: `العقد ${r.contractNo} (${r.contractor}): ${r.readiness}% فقط من طلبات المختبر معتمدة (${r.completed}/${r.total})؛ ${r.pending} معلقة.${timeAr}`,
        metric:
          days != null
            ? `${r.readiness}% ready · ${days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}`
            : `${r.readiness}% ready`,
        contractor: r.contractor,
        contractNo: r.contractNo,
      });
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
