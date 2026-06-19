import { describe, expect, it } from "vitest";
import {
  SECTOR_FAILED_ALERT_TTL_MS,
  buildReportReadAtMap,
  countActiveFailedAlerts,
  isFailedResultAlertActive,
} from "../shared/sectorFailedAlerts";

describe("sectorFailedAlerts", () => {
  const now = Date.parse("2026-06-04T12:00:00.000Z");
  const readMap = buildReportReadAtMap([
    { reportId: 1, readAt: "2026-06-04T10:00:00.000Z" },
    { reportId: 2, readAt: "2026-06-02T10:00:00.000Z" },
  ]);

  it("keeps alert for unopened failed results", () => {
    expect(isFailedResultAlertActive("fail", 99, readMap, now)).toBe(true);
  });

  it("keeps alert for 24h after opening", () => {
    expect(isFailedResultAlertActive("fail", 1, readMap, now)).toBe(true);
  });

  it("clears alert after 24h from opening", () => {
    expect(isFailedResultAlertActive("fail", 2, readMap, now)).toBe(false);
  });

  it("does not alert on pass results", () => {
    expect(isFailedResultAlertActive("pass", 99, readMap, now)).toBe(false);
  });

  it("counts only active failed alerts", () => {
    const rows = [
      { id: 1, overallResult: "fail" },
      { id: 2, overallResult: "fail" },
      { id: 3, overallResult: "fail" },
      { id: 4, overallResult: "pass" },
    ];
    expect(countActiveFailedAlerts(rows, readMap, now)).toBe(2);
    expect(SECTOR_FAILED_ALERT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
