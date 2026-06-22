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
  contractNumber?: string | null;
  contractorName?: string | null;
  status?: string | null;
};

export function computeContractReadinessRows(orders: LabOrderRow[]) {
  const grouped = new Map<
    string,
    {
      contractNo: string;
      contractor: string;
      total: number;
      completed: number;
      inProgress: number;
      pending: number;
    }
  >();

  for (const o of orders) {
    const contractNo = o.contractNumber ?? "—";
    const contractor = o.contractorName ?? "—";
    const key = `${contractNo}::${contractor}`;
    if (!grouped.has(key)) {
      grouped.set(key, { contractNo, contractor, total: 0, completed: 0, inProgress: 0, pending: 0 });
    }
    const row = grouped.get(key)!;
    row.total++;
    const st = o.status ?? "";
    if (st === "qc_passed" || st === "completed") row.completed++;
    else if (["distributed", "in_progress", "reviewed"].includes(st)) row.inProgress++;
    else row.pending++;
  }

  return Array.from(grouped.values())
    .map(r => ({ ...r, readiness: r.total > 0 ? Math.round((r.completed / r.total) * 100) : 0 }))
    .sort((a, b) => a.readiness - b.readiness);
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
  if (["qc_passed", "completed", "reviewed", "clearance_issued"].includes(status)) return "pass";
  if (["rejected", "qc_failed"].includes(status)) return "fail";
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

      let riskLevel: "low" | "medium" | "high" | "critical" = "low";
      if (passRate >= 80) riskLevel = "low";
      else if (passRate >= 60) riskLevel = "medium";
      else if (passRate >= 40) riskLevel = "high";
      else riskLevel = "critical";

      return { contractor, totalOrders, decided, passed, failed, passRate, contractCount, riskLevel, projects };
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

export function computeQualityAlerts(orders: LabOrderRow[]): QualityAlert[] {
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

  // 3. Contract closure risk: readiness < 30% with total orders > 4
  const readiness = computeContractReadinessRows(orders);
  for (const r of readiness) {
    if (r.total >= 5 && r.readiness < 30 && r.pending >= 3) {
      alerts.push({
        id: `closure_risk_${r.contractNo}`,
        type: "closure_risk",
        severity: r.readiness < 15 ? "critical" : "medium",
        titleEn: "Contract Closure Risk",
        titleAr: "خطر إغلاق العقد",
        bodyEn: `Contract ${r.contractNo} (${r.contractor}) is only ${r.readiness}% ready — ${r.pending} orders still pending out of ${r.total} total.`,
        bodyAr: `عقد ${r.contractNo} (${r.contractor}) جاهزيته ${r.readiness}% فقط — ${r.pending} طلباً معلقاً من أصل ${r.total}.`,
        metric: `${r.readiness}% ready, ${r.pending} pending`,
        contractor: r.contractor,
        contractNo: r.contractNo,
      });
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
