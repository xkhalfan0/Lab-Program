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

/** Linear interpolation of CBR at target dry density (pcf). */
export function interpolateCbrAtDensity(
  points: { dryDensityPcf: number; cbr: number }[],
  targetPcf: number,
): number | null {
  const valid = points.filter(p => p.dryDensityPcf > 0 && p.cbr > 0);
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0].cbr;

  const sorted = [...valid].sort((a, b) => a.dryDensityPcf - b.dryDensityPcf);
  if (targetPcf <= sorted[0].dryDensityPcf) return sorted[0].cbr;
  if (targetPcf >= sorted[sorted.length - 1].dryDensityPcf) return sorted[sorted.length - 1].cbr;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (targetPcf >= a.dryDensityPcf && targetPcf <= b.dryDensityPcf) {
      const t = (targetPcf - a.dryDensityPcf) / (b.dryDensityPcf - a.dryDensityPcf);
      return Math.round(a.cbr + t * (b.cbr - a.cbr));
    }
  }
  return null;
}

export function computeCbrAtMddPercentages(
  specimens: AstmCBRSpecimenComputed[],
  mddMg: number,
  useCorrected = true,
): { cbr95: number | null; cbr98: number | null; cbr100: number | null; mddPcf: number } {
  const mddPcf = mddMg > 0 ? parseFloat((mddMg * MG_M3_TO_PCF).toFixed(0)) : 0;
  const curvePoints = specimens
    .filter(s => s.dryDensityPcf != null && (useCorrected ? s.correctedCbr02Val : s.cbr02) != null)
    .map(s => ({
      dryDensityPcf: s.dryDensityPcf as number,
      cbr: (useCorrected ? s.correctedCbr02Val : s.cbr02) as number,
    }));

  return {
    mddPcf,
    cbr95: mddPcf > 0 ? interpolateCbrAtDensity(curvePoints, mddPcf * 0.95) : null,
    cbr98: mddPcf > 0 ? interpolateCbrAtDensity(curvePoints, mddPcf * 0.98) : null,
    cbr100: mddPcf > 0 ? interpolateCbrAtDensity(curvePoints, mddPcf) : null,
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
  return specimens
    .filter(s => s.dryDensityPcf != null && s.correctedCbr02Val != null)
    .map(s => ({
      dryDensityPcf: s.dryDensityPcf as number,
      cbr02: s.correctedCbr02Val as number,
      blows: s.blowsPerLayer,
    }))
    .sort((a, b) => a.dryDensityPcf - b.dryDensityPcf);
}

export function mgToPcf(mg: number): number {
  return parseFloat((mg * MG_M3_TO_PCF).toFixed(0));
}

export function pcfToMg(pcf: number): number {
  return parseFloat((pcf / MG_M3_TO_PCF).toFixed(3));
}
