/**
 * ASTM D1883 CBR — 3 specimens @ 10 / 30 / 65 blows per layer
 * Stress (psi) = Load (lbf) / 3 in²
 * CBR @ 0.1" = Stress / 1000 × 100 | CBR @ 0.2" = Stress / 1500 × 100  (lab worksheet)
 */

import { CBR_STANDARDS } from "./soilCBR";

export const ASTM_SPECIMEN_BLOWS = [10, 30, 65] as const;
export type AstmSpecimenBlows = (typeof ASTM_SPECIMEN_BLOWS)[number];

export const ASTM_PENETRATION_IN = CBR_STANDARDS.ASTM_D1883.penetrationDepths;
/** Fixed indices — do not use findIndex (legacy saved arrays may differ in length). */
export const ASTM_PEN_IDX_01 = ASTM_PENETRATION_IN.indexOf(0.1);
export const ASTM_PEN_IDX_02 = ASTM_PENETRATION_IN.indexOf(0.2);
export const ASTM_PISTON_AREA_IN2 = 3;
export const ASTM_STD_LOAD_01_LBF = 1000;
export const ASTM_STD_LOAD_02_LBF = 1500;
/** Worksheet divisors applied to stress (psi), e.g. 330 / 1000 × 100 = 33 */
export const ASTM_STD_STRESS_CBR_01 = 1000;
export const ASTM_STD_STRESS_CBR_02 = 1500;
export const ASTM_STD_SURCHARGE_LBF = 10;
export const MG_M3_TO_PCF = 62.428;

export interface AstmCBRSpecimenInput {
  id: string;
  blowsPerLayer: AstmSpecimenBlows;
  volumeMould: string;
  massMouldSample: string;
  massMould: string;
  massWetCont: string;
  massDryCont: string;
  massContainer: string;
  moistureAfterSoak: string;
  penetrationLoads: string[];
  /** ASTM D1883 §7.2 — graphical correction applied at 0.1" */
  needsCorrection01: boolean;
  /** ASTM D1883 §7.2 — graphical correction applied at 0.2" */
  needsCorrection02: boolean;
  /** Manual CBR @ 0.1" read from corrected penetration curve */
  correctedCbr01: string;
  /** Manual CBR @ 0.2" read from corrected penetration curve */
  correctedCbr02: string;
}

export interface AstmCBRSpecimenComputed extends AstmCBRSpecimenInput {
  specimenMass?: number;
  wetDensityMg?: number;
  wetDensityPcf?: number;
  moistureContent?: number;
  dryDensityMg?: number;
  dryDensityPcf?: number;
  stresses: (number | undefined)[];
  load01?: number;
  load02?: number;
  cbr01?: number;
  cbr02?: number;
  /** ASTM D1883 §7.2 graphical zero-offset (in) when concave-upward correction applied */
  correctionZeroOffsetIn?: number;
  /** True when auto graphical correction was applied */
  correctionApplied?: boolean;
  /** Adopted @ 0.1" — auto-corrected when applicable, else raw */
  adoptedCbr01?: number;
  /** Adopted @ 0.2" — corrected if flagged, else raw */
  adoptedCbr02?: number;
  /** Same as adoptedCbr01/02 — used on design curve & reports */
  correctedCbr01Val?: number;
  correctedCbr02Val?: number;
  adoptedCbr?: number;
}

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

export function newAstmSpecimen(blows: AstmSpecimenBlows, index: number): AstmCBRSpecimenInput {
  return {
    id: `astm_sp_${blows}_${index}`,
    blowsPerLayer: blows,
    volumeMould: "",
    massMouldSample: "",
    massMould: "",
    massWetCont: "",
    massDryCont: "",
    massContainer: "",
    moistureAfterSoak: "",
    penetrationLoads: Array(ASTM_PENETRATION_IN.length).fill(""),
    needsCorrection01: false,
    needsCorrection02: false,
    correctedCbr01: "",
    correctedCbr02: "",
  };
}

/** Infer correction flags from legacy saves that only stored correctedCbr strings. */
export function hydrateAstmSpecimenInput(
  raw: Partial<AstmCBRSpecimenInput> & Record<string, unknown>,
  index: number,
): AstmCBRSpecimenInput {
  const blows = (raw.blowsPerLayer ?? ([10, 30, 65] as const)[index] ?? 10) as AstmSpecimenBlows;
  return {
    id: String(raw.id ?? `astm_sp_${blows}_${index}`),
    blowsPerLayer: blows,
    volumeMould: String(raw.volumeMould ?? ""),
    massMouldSample: String(raw.massMouldSample ?? ""),
    massMould: String(raw.massMould ?? ""),
    massWetCont: String(raw.massWetCont ?? ""),
    massDryCont: String(raw.massDryCont ?? ""),
    massContainer: String(raw.massContainer ?? ""),
    moistureAfterSoak: String(raw.moistureAfterSoak ?? ""),
    penetrationLoads: normalizeAstmPenetrationLoads(
      Array.isArray(raw.penetrationLoads) ? raw.penetrationLoads.map(String) : [],
    ),
    needsCorrection01: false,
    needsCorrection02: false,
    correctedCbr01: "",
    correctedCbr02: "",
  };
}

export function defaultAstmSpecimens(): AstmCBRSpecimenInput[] {
  return ASTM_SPECIMEN_BLOWS.map((b, i) => newAstmSpecimen(b, i));
}

/** True when a 10-row array is the old layout (0.2" at index 5, no 0.15 row). */
export function isLegacyAstmPenetrationLoads(loads: string[]): boolean {
  if (loads.length !== 10) return false;
  const at5 = String(loads[5] ?? "").trim();
  const at6 = String(loads[6] ?? "").trim();
  // New format: 0.15" row at 5 and 0.2" at 6 are both typically filled once tested
  if (at5 && at6) return false;
  // Legacy: 0.2" stored at index 5, index 6+ hold deeper penetrations
  return Boolean(at5);
}

/** Pad, trim, or migrate legacy penetration load arrays onto current depth table. */
export function normalizeAstmPenetrationLoads(loads: string[]): string[] {
  const n = ASTM_PENETRATION_IN.length;
  const out = Array(n).fill("");

  if (loads.length === n) {
    if (!isLegacyAstmPenetrationLoads(loads)) {
      for (let i = 0; i < n; i++) out[i] = loads[i] ?? "";
      return out;
    }
    // Legacy 10-row without 0.15: remap 0.2" from index 5 → 6
    for (let i = 0; i < 5; i++) out[i] = loads[i] ?? "";
    if (loads[5] != null && loads[5] !== "") out[ASTM_PEN_IDX_02] = loads[5];
    for (let i = 6; i < 9; i++) out[i + 1] = loads[i] ?? "";
    return out;
  }

  if (loads.length === 11 && n === 10) {
    for (let i = 0; i < n; i++) out[i] = loads[i] ?? "";
    return out;
  }

  for (let i = 0; i < Math.min(loads.length, n); i++) out[i] = loads[i] ?? "";
  return out;
}

export function parseAstmLoad(v: string): number {
  const n = parseFloat(String(v).trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function calcAstmCbrFromStress(stressPsi: number, stdStressPsi: number): number | undefined {
  if (!(stressPsi > 0) || !(stdStressPsi > 0)) return undefined;
  return Math.round((stressPsi / stdStressPsi) * 100);
}

export interface AstmGraphicalCorrectionResult {
  applied: boolean;
  zeroOffsetIn: number;
  correctedLoad01?: number;
  correctedLoad02?: number;
  correctedStress01?: number;
  correctedStress02?: number;
  correctedCbr01?: number;
  correctedCbr02?: number;
}

interface LoadPenPoint {
  depth: number;
  load: number;
}

function interpolateLoadAtPenetration(points: LoadPenPoint[], targetDepth: number): number | undefined {
  if (points.length === 0) return undefined;
  const sorted = [...points].sort((a, b) => a.depth - b.depth);
  if (targetDepth <= sorted[0].depth) return sorted[0].load;
  if (targetDepth >= sorted[sorted.length - 1].depth) return sorted[sorted.length - 1].load;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (targetDepth >= a.depth && targetDepth <= b.depth) {
      const span = b.depth - a.depth;
      if (span <= 0) return a.load;
      const t = (targetDepth - a.depth) / span;
      return a.load + t * (b.load - a.load);
    }
  }
  return undefined;
}

/** Minimum positive zero-offset (in) before graphical correction is applied. */
const CORRECTION_ZERO_MIN_IN = 0.005;
/** Graphical correction applies only when raw CBR @ 0.2" reaches this level (lab practice). */
const CORRECTION_MIN_RAW_CBR_02 = 90;

function isConcaveUpwardToe(points: LoadPenPoint[]): boolean {
  const p05 = points.find(p => p.depth === 0.05);
  const p10 = points.find(p => p.depth === 0.1);
  const p15 = points.find(p => p.depth === 0.15);
  if (!p05 || !p10 || !p15) return false;
  const slope = (p15.load - p10.load) / (p15.depth - p10.depth);
  const expectedAt005 = p10.load - slope * (p10.depth - p05.depth);
  return p05.load < expectedAt005 * 0.92;
}

/** Tangent at steepest slope on the initial portion (penetration ≤ 0.2 in). */
function findTangentZeroOffset(points: LoadPenPoint[]): number | null {
  let maxSlope = 0;
  let tangentPoint: LoadPenPoint | null = null;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (p.depth > 0.2) continue;
    const prev = points[i - 1];
    const next = points[i + 1];
    const slope = (next.load - prev.load) / (next.depth - prev.depth);
    if (slope > maxSlope) {
      maxSlope = slope;
      tangentPoint = p;
    }
  }
  if (!tangentPoint || !(maxSlope > 0)) return null;
  return tangentPoint.depth - tangentPoint.load / maxSlope;
}

/**
 * ASTM D1883 §7.2 / AASHTO T193 — concave-upward load-penetration correction.
 * Draw tangent at steepest point, find x-axis intercept X,
 * read loads at (0.1 + X) and (0.2 + X), then compute corrected CBR.
 */
export function computeAstmGraphicalCorrection(
  loads: number[],
  rawCbr02?: number,
): AstmGraphicalCorrectionResult {
  const none: AstmGraphicalCorrectionResult = { applied: false, zeroOffsetIn: 0 };
  const points: LoadPenPoint[] = ASTM_PENETRATION_IN.map((depth, i) => ({
    depth,
    load: loads[i] ?? 0,
  })).filter(p => p.load > 0);
  if (points.length < 4) return none;

  const load02 = loads[ASTM_PEN_IDX_02] ?? 0;
  const computedRaw02 = load02 > 0
    ? calcAstmCbrFromStress(Math.round(load02 / ASTM_PISTON_AREA_IN2), ASTM_STD_STRESS_CBR_02)
    : undefined;
  const raw02 = rawCbr02 ?? computedRaw02;
  if (raw02 == null || raw02 < CORRECTION_MIN_RAW_CBR_02) return none;
  if (!isConcaveUpwardToe(points)) return none;

  const zeroOffset = findTangentZeroOffset(points);
  if (zeroOffset == null || !(zeroOffset > CORRECTION_ZERO_MIN_IN)) return none;

  const correctedLoad01 = interpolateLoadAtPenetration(points, 0.1 + zeroOffset);
  const correctedLoad02 = interpolateLoadAtPenetration(points, 0.2 + zeroOffset);
  if (correctedLoad01 == null || correctedLoad02 == null) return none;

  const correctedStress01 = Math.round(correctedLoad01 / ASTM_PISTON_AREA_IN2);
  const correctedStress02 = Math.round(correctedLoad02 / ASTM_PISTON_AREA_IN2);
  const correctedCbr01 = calcAstmCbrFromStress(correctedStress01, ASTM_STD_STRESS_CBR_01);
  const correctedCbr02 = calcAstmCbrFromStress(correctedStress02, ASTM_STD_STRESS_CBR_02);
  if (correctedCbr01 == null && correctedCbr02 == null) return none;

  const load01 = loads[ASTM_PEN_IDX_01] ?? 0;
  const rawCbr01 = load01 > 0
    ? calcAstmCbrFromStress(Math.round(load01 / ASTM_PISTON_AREA_IN2), ASTM_STD_STRESS_CBR_01)
    : undefined;
  const delta01 = correctedCbr01 != null && rawCbr01 != null
    ? Math.abs(correctedCbr01 - rawCbr01)
    : 0;
  const delta02 = correctedCbr02 != null && raw02 != null
    ? Math.abs(correctedCbr02 - raw02)
    : 0;
  if (delta01 < 3 && delta02 < 3) return none;

  return {
    applied: true,
    zeroOffsetIn: parseFloat(zeroOffset.toFixed(4)),
    correctedLoad01,
    correctedLoad02,
    correctedStress01,
    correctedStress02,
    correctedCbr01,
    correctedCbr02,
  };
}

export function computeAstmSpecimen(
  sp: AstmCBRSpecimenInput,
  surchargeLbf = ASTM_STD_SURCHARGE_LBF,
): AstmCBRSpecimenComputed {
  const normalizedLoads = normalizeAstmPenetrationLoads(sp.penetrationLoads);
  const vol = num(sp.volumeMould);
  const mSample = num(sp.massMouldSample);
  const mMould = num(sp.massMould);
  const wetC = num(sp.massWetCont);
  const dryC = num(sp.massDryCont);
  const cont = num(sp.massContainer);

  const out: AstmCBRSpecimenComputed = {
    ...sp,
    stresses: Array(ASTM_PENETRATION_IN.length).fill(undefined),
  };

  if (Number.isFinite(mSample) && Number.isFinite(mMould)) {
    out.specimenMass = parseFloat((mSample - mMould).toFixed(1));
  }
  if (out.specimenMass != null && Number.isFinite(vol) && vol > 0) {
    out.wetDensityMg = parseFloat((out.specimenMass / vol).toFixed(3));
    out.wetDensityPcf = parseFloat((out.wetDensityMg * MG_M3_TO_PCF).toFixed(0));
  }
  if (Number.isFinite(wetC) && Number.isFinite(dryC) && Number.isFinite(cont)) {
    const drySoil = dryC - cont;
    if (drySoil > 0) {
      out.moistureContent = parseFloat((((wetC - dryC) / drySoil) * 100).toFixed(1));
    }
  }
  if (out.wetDensityMg != null && out.moistureContent != null) {
    out.dryDensityMg = parseFloat(
      ((out.wetDensityMg * 100) / (100 + out.moistureContent)).toFixed(3),
    );
    out.dryDensityPcf = parseFloat((out.dryDensityMg * MG_M3_TO_PCF).toFixed(0));
  }

  const loads = normalizedLoads.map(parseAstmLoad);
  out.stresses = loads.map(l => (l > 0 ? Math.round(l / ASTM_PISTON_AREA_IN2) : undefined));

  const load01 = loads[ASTM_PEN_IDX_01] ?? 0;
  const load02 = loads[ASTM_PEN_IDX_02] ?? 0;
  out.load01 = load01 > 0 ? load01 : undefined;
  out.load02 = load02 > 0 ? load02 : undefined;
  const stress01 = out.stresses[ASTM_PEN_IDX_01];
  const stress02 = out.stresses[ASTM_PEN_IDX_02];
  out.cbr01 = stress01 != null ? calcAstmCbrFromStress(stress01, ASTM_STD_STRESS_CBR_01) : undefined;
  out.cbr02 = stress02 != null ? calcAstmCbrFromStress(stress02, ASTM_STD_STRESS_CBR_02) : undefined;

  const graphical = computeAstmGraphicalCorrection(loads, out.cbr02);
  out.correctionApplied = graphical.applied;
  out.correctionZeroOffsetIn = graphical.applied ? graphical.zeroOffsetIn : undefined;
  out.needsCorrection01 = graphical.applied && graphical.correctedCbr01 != null
    && graphical.correctedCbr01 !== out.cbr01;
  out.needsCorrection02 = graphical.applied && graphical.correctedCbr02 != null
    && graphical.correctedCbr02 !== out.cbr02;

  out.adoptedCbr01 = graphical.applied && graphical.correctedCbr01 != null
    ? graphical.correctedCbr01
    : out.cbr01;
  out.adoptedCbr02 = graphical.applied && graphical.correctedCbr02 != null
    ? graphical.correctedCbr02
    : out.cbr02;
  out.correctedCbr01Val = out.adoptedCbr01;
  out.correctedCbr02Val = out.adoptedCbr02;
  if (graphical.applied) {
    out.correctedCbr01 = out.adoptedCbr01 != null ? String(out.adoptedCbr01) : "";
    out.correctedCbr02 = out.adoptedCbr02 != null ? String(out.adoptedCbr02) : "";
  }
  const adopted01 = out.adoptedCbr01 ?? 0;
  const adopted02 = out.adoptedCbr02 ?? 0;
  out.adoptedCbr = Math.max(adopted01, adopted02) || undefined;

  return out;
}

export function computeAllAstmSpecimens(
  specimens: AstmCBRSpecimenInput[],
  surchargeLbf = ASTM_STD_SURCHARGE_LBF,
): AstmCBRSpecimenComputed[] {
  return specimens.map(sp => computeAstmSpecimen(sp, surchargeLbf));
}

export interface DesignCbrCurvePoint {
  dryDensityPcf: number;
  cbr: number;
  blowsPerLayer?: number;
}

/** Design curve: dry density (pcf) vs corrected CBR @ 0.2" — per ASTM D1883 worksheet. */
export function buildDesignCbrCurvePoints(
  specimens: AstmCBRSpecimenComputed[],
): DesignCbrCurvePoint[] {
  return specimens
    .filter(s => s.dryDensityPcf != null && s.correctedCbr02Val != null && s.correctedCbr02Val > 0)
    .map(s => ({
      dryDensityPcf: s.dryDensityPcf as number,
      cbr: s.correctedCbr02Val as number,
      blowsPerLayer: s.blowsPerLayer,
    }))
    .sort((a, b) => a.dryDensityPcf - b.dryDensityPcf);
}

function linearCbrAtDensity(
  sorted: DesignCbrCurvePoint[],
  targetPcf: number,
): number | null {
  if (sorted.length === 1) return sorted[0].cbr;

  if (targetPcf <= sorted[0].dryDensityPcf) {
    const a = sorted[0];
    const b = sorted[1];
    const span = b.dryDensityPcf - a.dryDensityPcf;
    if (span <= 0) return a.cbr;
    const t = (targetPcf - a.dryDensityPcf) / span;
    return Math.round(a.cbr + t * (b.cbr - a.cbr));
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (targetPcf >= a.dryDensityPcf && targetPcf <= b.dryDensityPcf) {
      const span = b.dryDensityPcf - a.dryDensityPcf;
      if (span <= 0) return a.cbr;
      const t = (targetPcf - a.dryDensityPcf) / span;
      return Math.round(a.cbr + t * (b.cbr - a.cbr));
    }
  }

  const a = sorted[sorted.length - 2];
  const b = sorted[sorted.length - 1];
  const span = b.dryDensityPcf - a.dryDensityPcf;
  if (span <= 0) return b.cbr;
  const t = (targetPcf - a.dryDensityPcf) / span;
  return Math.round(a.cbr + t * (b.cbr - a.cbr));
}

/** Linear interpolation / extrapolation of corrected CBR @ 0.2" at target dry density (pcf). */
export function interpolateCbrAtDensity(
  points: DesignCbrCurvePoint[],
  targetPcf: number,
): number | null {
  const valid = points.filter(p => p.dryDensityPcf > 0 && p.cbr > 0);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a.dryDensityPcf - b.dryDensityPcf);
  return linearCbrAtDensity(sorted, targetPcf);
}

export interface DesignCbrAtMddResult {
  mddPcf: number;
  mddPcfExact: number;
  targetPcf95: number;
  targetPcf98: number;
  targetPcf100: number;
  cbr95: number | null;
  cbr98: number | null;
  cbr100: number | null;
}

/** MDD (Mg/m³) × 62.428 → pcf; interpolate corrected CBR @ 0.2" at 95 / 98 / 100% of MDD. */
export function computeCbrAtMddPercentages(
  specimens: AstmCBRSpecimenComputed[],
  mddMg: number,
): DesignCbrAtMddResult {
  const mddPcfExact = mddMg > 0 ? mddMg * MG_M3_TO_PCF : 0;
  const mddPcf = mddPcfExact > 0 ? Math.round(mddPcfExact) : 0;
  const curvePoints = buildDesignCbrCurvePoints(specimens);

  const targetPcf95 = mddPcfExact * 0.95;
  const targetPcf98 = mddPcfExact * 0.98;
  const targetPcf100 = mddPcfExact;

  return {
    mddPcf,
    mddPcfExact,
    targetPcf95,
    targetPcf98,
    targetPcf100,
    cbr95: mddPcfExact > 0 ? interpolateCbrAtDensity(curvePoints, targetPcf95) : null,
    cbr98: mddPcfExact > 0 ? interpolateCbrAtDensity(curvePoints, targetPcf98) : null,
    cbr100: mddPcfExact > 0 ? interpolateCbrAtDensity(curvePoints, targetPcf100) : null,
  };
}

export function buildStressPenetrationChartData(
  specimens: AstmCBRSpecimenComputed[],
): Array<{ depth: number; s10?: number | null; s30?: number | null; s65?: number | null }> {
  return ASTM_PENETRATION_IN.map((depth, i) => {
    const row: { depth: number; s10?: number | null; s30?: number | null; s65?: number | null } = { depth };
    for (const sp of specimens) {
      const stress = sp.stresses[i];
      if (sp.blowsPerLayer === 10) row.s10 = stress ?? null;
      if (sp.blowsPerLayer === 30) row.s30 = stress ?? null;
      if (sp.blowsPerLayer === 65) row.s65 = stress ?? null;
    }
    return row;
  }).filter(r => (r.s10 ?? 0) > 0 || (r.s30 ?? 0) > 0 || (r.s65 ?? 0) > 0);
}

export function buildCbrDensityChartData(
  specimens: AstmCBRSpecimenComputed[],
): Array<{ dryDensityPcf: number; cbr02: number; blows: number }> {
  return buildDesignCbrCurvePoints(specimens).map(p => ({
    dryDensityPcf: p.dryDensityPcf,
    cbr02: p.cbr,
    blows: p.blowsPerLayer ?? 0,
  }));
}

export function mgToPcfExact(mg: number): number {
  return mg * MG_M3_TO_PCF;
}

export function mgToPcf(mg: number): number {
  return Math.round(mgToPcfExact(mg));
}

export function pcfToMg(pcf: number): number {
  return parseFloat((pcf / MG_M3_TO_PCF).toFixed(3));
}
