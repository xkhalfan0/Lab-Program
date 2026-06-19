/** Failed sector test results stay alerted for 24h after the report is opened. */
export const SECTOR_FAILED_ALERT_TTL_MS = 24 * 60 * 60 * 1000;

export type SectorReportReadRecord = {
  reportId: number;
  readAt: Date | string | null;
};

export function buildReportReadAtMap(records: SectorReportReadRecord[]): Map<number, Date> {
  const map = new Map<number, Date>();
  for (const record of records) {
    if (record.readAt) {
      map.set(record.reportId, new Date(record.readAt));
    }
  }
  return map;
}

/** True when a failed result should still show a sector alert badge. */
export function isFailedResultAlertActive(
  overallResult: string | null | undefined,
  resultId: number,
  readAtByReportId: Map<number, Date>,
  nowMs: number = Date.now(),
): boolean {
  if (overallResult !== "fail") return false;
  const readAt = readAtByReportId.get(resultId);
  if (!readAt) return true;
  return nowMs - readAt.getTime() < SECTOR_FAILED_ALERT_TTL_MS;
}

export function countActiveFailedAlerts(
  rows: Array<{ id: number; overallResult: string | null | undefined }>,
  readAtByReportId: Map<number, Date>,
  nowMs: number = Date.now(),
): number {
  return rows.filter((row) =>
    isFailedResultAlertActive(row.overallResult, row.id, readAtByReportId, nowMs),
  ).length;
}
