/**
 * Shared boss-dashboard computations (readiness, scorecard).
 * Used by ManagerDashboard and report generator.
 */

import { LAB_ORDER_STATUS_GROUPS } from "./statusGroups";

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
