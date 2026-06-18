import { describe, expect, it } from "vitest";
import {
  getMaxRetestsForTestCode,
  isTestRetestAllowed,
} from "./test-retest-limits";

describe("test retest limits", () => {
  it("concrete and steel tests allow no retests", () => {
    expect(getMaxRetestsForTestCode("CONC_CUBE")).toBe(0);
    expect(getMaxRetestsForTestCode("STEEL_REBAR")).toBe(0);
  });

  it("soil CBR allows one retest; field density does not", () => {
    expect(getMaxRetestsForTestCode("SOIL_CBR")).toBe(1);
    expect(getMaxRetestsForTestCode("SOIL_FIELD_DENSITY")).toBe(0);
  });

  it("asphalt and aggregate tests allow one retest", () => {
    expect(getMaxRetestsForTestCode("ASPH_MARSHALL")).toBe(1);
    expect(getMaxRetestsForTestCode("AGG_SIEVE")).toBe(1);
  });

  it("resolves legacy alias codes", () => {
    expect(getMaxRetestsForTestCode("DIST-2026-040")).toBe(1);
  });

  it("isTestRetestAllowed respects used count", () => {
    const counts = new Map([["SOIL_CBR", 1]]);
    expect(isTestRetestAllowed("SOIL_CBR", counts)).toBe(false);
    expect(isTestRetestAllowed("SOIL_CBR", new Map())).toBe(true);
    expect(isTestRetestAllowed("CONC_CUBE", new Map())).toBe(false);
  });
});
