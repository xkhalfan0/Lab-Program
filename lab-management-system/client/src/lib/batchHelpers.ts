/**
 * Helpers for multi-test lab orders (batch navigation and detection).
 */

/** tRPC React Query utils (`const utils = trpc.useUtils()`). */
export type BatchTrpcUtils = {
  distributions: {
    get: {
      fetch: (input: { id: number }) => Promise<{ orderId?: number }>;
    };
  };
};

export async function getOrderIdForDistribution(
  distributionId: number,
  trpc: BatchTrpcUtils,
): Promise<number | null> {
  try {
    const dist = await trpc.distributions.get.fetch({ id: distributionId });
    return dist.orderId ?? null;
  } catch {
    return null;
  }
}

export function isBatchDistribution(dist: {
  orderId?: number | null;
  isMultiTest?: boolean;
  batchSiblingCount?: number;
  orderItemCount?: number;
  siblings?: unknown[];
} | null | undefined): boolean {
  if (!dist?.orderId) return false;

  if (Array.isArray(dist.siblings) && dist.siblings.length >= 2) return true;
  if (dist.isMultiTest === true) return true;

  const count = dist.batchSiblingCount ?? dist.orderItemCount;
  if (typeof count === "number") return count >= 2;

  return false;
}

export function getBatchRoute(sampleId: number, orderId: number): string {
  return `/batch/${sampleId}/${orderId}`;
}

export function redirectAfterTestSave(
  setLocation: (path: string) => void,
  dist: { sampleId?: number; orderId?: number } | null | undefined,
): void {
  if (dist?.orderId && dist.sampleId) {
    setLocation(getBatchRoute(dist.sampleId, dist.orderId));
  } else {
    setLocation("/technician");
  }
}
