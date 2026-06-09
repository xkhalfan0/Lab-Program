/**
 * ASTM D1883 CBR — 3 specimens @ 10 / 30 / 65 blows per layer
 * CBR @ 0.1" = Load / 1000 × 100 | CBR @ 0.2" = Load / 1500 × 100
 * Stress (psi) = Load (lbf) / 3
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
  correctedCbr01: string;
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
    correctedCbr01: "",
    correctedCbr02: "",
  };
}

export function defaultAstmSpecimens(): AstmCBRSpecimenInput[] {
  return ASTM_SPECIMEN_BLOWS.map((b, i) => newAstmSpecimen(b, i));
}

/** Re-map legacy penetration arrays (pre-0.15 row or with 0.4") onto current depths. */
export function normalizeAstmPenetrationLoads(loads: string[]): string[] {
  const n = ASTM_PENETRATION_IN.length;
  const out = Array(n).fill("");

  if (loads.length === 10) {
    // Legacy: 0 … 0.1, 0.2 … 0.4 (no 0.15 row)
    for (let i = 0; i < 5; i++) out[i] = loads[i] ?? "";
    if (loads[5] != null && loads[5] !== "") out[ASTM_PEN_IDX_02] = loads[5];
    for (let i = 6; i < 9; i++) out[i + 1] = loads[i] ?? "";
    return out;
  }

  if (loads.length === 11 && n === 10) {
    // Legacy with 0.15 and trailing 0.4 — drop 0.4
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

export function calcAstmCbr(loadLbf: number, stdLoadLbf: number): number | undefined {
  if (!(loadLbf > 0) || !(stdLoadLbf > 0)) return undefined;
  return Math.round((loadLbf / stdLoadLbf) * 100);
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
  out.cbr01 = calcAstmCbr(load01, ASTM_STD_LOAD_01_LBF);
  out.cbr02 = calcAstmCbr(load02, ASTM_STD_LOAD_02_LBF);

  const surchargeFactor = surchargeLbf > 0 ? ASTM_STD_SURCHARGE_LBF / surchargeLbf : 1;
  const autoCorr01 = out.cbr01 != null ? Math.round(out.cbr01 * surchargeFactor) : undefined;
  const autoCorr02 = out.cbr02 != null ? Math.round(out.cbr02 * surchargeFactor) : undefined;

  const corr01 = num(sp.correctedCbr01);
  const corr02 = num(sp.correctedCbr02);
  out.correctedCbr01Val = Number.isFinite(corr01) && corr01 > 0 ? corr01 : autoCorr01;
  out.correctedCbr02Val = Number.isFinite(corr02) && corr02 > 0 ? corr02 : autoCorr02;
  const adopted01 = out.correctedCbr01Val ?? 0;
  const adopted02 = out.correctedCbr02Val ?? 0;
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
