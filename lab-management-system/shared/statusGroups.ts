/**
 * Central status groupings for dashboards and reports.
 * Align counts with lab_orders + samples workflow.
 */

/** lab_orders.status */
export const LAB_ORDER_STATUS_GROUPS = {
  pending: ["pending"],
  inProgress: ["distributed", "in_progress"],
  pendingMgrReview: ["completed"],
  pendingQcReview: ["reviewed"],
  completed: ["qc_passed"],
  failed: ["rejected"],
  active: ["pending", "distributed", "in_progress", "completed", "reviewed"],
} as const;

/** samples.status */
export const SAMPLE_STATUS_GROUPS = {
  inProgress: [
    "distributed",
    "testing_in_progress",
    "awaiting_review",
    "under_review",
    "tested",
    "processed",
    "reviewed",
    "approved",
    "clearance_requested",
  ],
  pendingMgrReview: ["awaiting_review", "under_review", "processed"],
  pendingQcReview: ["reviewed", "approved"],
  completed: ["qc_passed", "clearance_issued"],
  failed: ["qc_failed", "rejected", "revision_requested"],
  needsAction: ["received", "processed", "approved", "revision_requested", "awaiting_review"],
} as const;

/** distributions.status */
export const DISTRIBUTION_STATUS_GROUPS = {
  open: ["pending", "in_progress"],
  done: ["completed"],
} as const;

/** clearance_requests.status */
export const CLEARANCE_IN_PROGRESS = [
  "pending",
  "inventory_ready",
  "payment_ordered",
  "docs_uploaded",
] as const;

export function isInGroup(
  status: string | null | undefined,
  group: readonly string[],
): boolean {
  return !!status && group.includes(status);
}
