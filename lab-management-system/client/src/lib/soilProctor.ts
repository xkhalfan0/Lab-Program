/**
 * Proctor compaction — ASTM D1557 / ASTM D698 / BS 1377-4
 */

export type ProctorMethodKey = "MODIFIED_PROCTOR" | "STANDARD_PROCTOR" | "BS_HEAVY" | "BS_LIGHT";

export interface ProctorMethodSpec {
  label: string;
  labelAr: string;
  standardRef: string;
  cbrStandard: string;
  layers: number;
  blowsPerLayer: number;
  hammerMass: number;
  dropHeight: number;
  energy: number;
  /** Pre-ASTM display string (BS 1377 methods). */
  legacyEnergy?: string;
  /** Pre-ASTM display string (BS 1377 methods). */
  legacyHammer?: string;
  mouldVolume: number;
  recommendedMolds: readonly string[];
  color: string;
  isAstm: boolean;
}

/** Dropdown order: BS methods first (legacy workflow), then ASTM. */
export const PROCTOR_METHOD_ORDER: ProctorMethodKey[] = [
  "BS_HEAVY",
  "BS_LIGHT",
  "MODIFIED_PROCTOR",
  "STANDARD_PROCTOR",
];

export const PROCTOR_METHOD_SPECS: Record<ProctorMethodKey, ProctorMethodSpec> = {
  MODIFIED_PROCTOR: {
    label: "Modified Proctor (ASTM D1557)",
    labelAr: "بروكتور المعدّل (ASTM D1557)",
    standardRef: "ASTM D1557",
    cbrStandard: "ASTM D1883",
    layers: 5,
    blowsPerLayer: 25,
    hammerMass: 4.54,
    dropHeight: 457,
    energy: 2700,
    mouldVolume: 2305,
    recommendedMolds: ["CBR_MOLD", "STANDARD_MOLD"],
    color: "blue",
    isAstm: true,
  },
  STANDARD_PROCTOR: {
    label: "Standard Proctor (ASTM D698)",
    labelAr: "بروكتور القياسي (ASTM D698)",
    standardRef: "ASTM D698",
    cbrStandard: "ASTM D1883",
    layers: 3,
    blowsPerLayer: 25,
    hammerMass: 2.49,
    dropHeight: 305,
    energy: 600,
    mouldVolume: 944,
    recommendedMolds: ["STANDARD_MOLD", "LARGE_MOLD"],
    color: "green",
    isAstm: true,
  },
  BS_HEAVY: {
    label: "BS 1377 Heavy Compaction",
    labelAr: "BS 1377 دمك ثقيل",
    standardRef: "BS 1377-4",
    cbrStandard: "BS 1377-4",
    layers: 5,
    blowsPerLayer: 27,
    hammerMass: 4.5,
    dropHeight: 450,
    energy: 2674,
    legacyEnergy: "2674 kN·m/m³",
    legacyHammer: "4.5 kg / 450 mm",
    mouldVolume: 2305,
    recommendedMolds: ["CBR_MOLD", "STANDARD_MOLD"],
    color: "purple",
    isAstm: false,
  },
  BS_LIGHT: {
    label: "BS 1377 Light Compaction",
    labelAr: "BS 1377 دمك خفيف",
    standardRef: "BS 1377-4",
    cbrStandard: "BS 1377-4",
    layers: 3,
    blowsPerLayer: 27,
    hammerMass: 2.5,
    dropHeight: 300,
    energy: 596,
    legacyEnergy: "596 kN·m/m³",
    legacyHammer: "2.5 kg / 300 mm",
    mouldVolume: 1000,
    recommendedMolds: ["STANDARD_MOLD", "LARGE_MOLD"],
    color: "orange",
    isAstm: false,
  },
};

export const PROCTOR_MOLD_VOLUMES = {
  CBR_MOLD: { label: "CBR Mold (2305 cm³)", volume: 2305 },
  STANDARD_MOLD: { label: "Standard Mold (944 cm³)", volume: 944 },
  LARGE_MOLD: { label: "Large Mold (2124 cm³)", volume: 2124 },
} as const;

export type ProctorMoldKey = keyof typeof PROCTOR_MOLD_VOLUMES;

export interface ProctorPointInput {
  id: string;
  waterAdded: string;
  mouldBaseSpecimen: string;
  containerNo: string;
  wetSoilContainer: string;
  drySoilContainer: string;
  container: string;
  compactedSpecimen?: number;
  bulkDensity?: number;
  moistureMass?: number;
  drySoilMass?: number;
  waterContent?: number;
  dryDensity?: number;
}

const num = (v: string) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
};

export function computeProctorPoint(
  pt: ProctorPointInput,
  mouldVolumeCm3: number,
  mouldBaseMass: number,
): ProctorPointInput {
  const out: ProctorPointInput = { ...pt };

  const wsc = num(pt.wetSoilContainer);
  const dsc = num(pt.drySoilContainer);
  const cont = num(pt.container);
  if (Number.isFinite(wsc) && Number.isFinite(dsc)) {
    out.moistureMass = parseFloat((wsc - dsc).toFixed(2));
  }
  if (Number.isFinite(dsc) && Number.isFinite(cont)) {
    out.drySoilMass = parseFloat((dsc - cont).toFixed(2));
  }
  if (out.moistureMass != null && out.drySoilMass != null && out.drySoilMass > 0) {
    out.waterContent = (out.moistureMass / out.drySoilMass) * 100;
  }

  const mbs = num(pt.mouldBaseSpecimen);
  if (Number.isFinite(mbs) && Number.isFinite(mouldBaseMass) && mouldVolumeCm3 > 0) {
    const specimen = mbs - mouldBaseMass;
    out.compactedSpecimen = parseFloat(specimen.toFixed(1));
    if (specimen > 0) out.bulkDensity = parseFloat((specimen / mouldVolumeCm3).toFixed(3));
  }

  if (out.bulkDensity != null && out.waterContent != null) {
    out.dryDensity = parseFloat(((100 * out.bulkDensity) / (100 + out.waterContent)).toFixed(3));
  }

  return out;
}

/** ASTM D4718 oversize correction */
/** Peak MDD from measured dry densities (max table value); parabola fit as fallback. */
export function peakProctorMdd(
  points: { dryDensity?: number | null }[],
  fitMdd?: number | null,
): number | undefined {
  const densities = points
    .map(p => p.dryDensity)
    .filter((d): d is number => typeof d === "number" && Number.isFinite(d) && d > 0);
  if (densities.length > 0) {
    return parseFloat(Math.max(...densities).toFixed(3));
  }
  if (fitMdd != null && Number.isFinite(fitMdd) && fitMdd > 0) {
    return parseFloat(fitMdd.toFixed(3));
  }
  return undefined;
}

export function computeCorrectedProctor(
  oversizePct: number,
  bulkSpGr: number,
  mddFiner: number,
  omcFiner: number,
): { correctedMDD: number; correctedOMC: number; pctFiner: number } {
  const pOver = oversizePct / 100;
  const pFiner = 1 - pOver;
  const Gs = bulkSpGr > 0 ? bulkSpGr : 2.65;
  let correctedMDD = 0;
  if (mddFiner > 0 && Gs > 0) {
    correctedMDD = parseFloat((100 / (pOver / Gs + pFiner / mddFiner)).toFixed(3));
  }
  const correctedOMC = omcFiner > 0 ? parseFloat((omcFiner * pFiner).toFixed(1)) : 0;
  return { correctedMDD, correctedOMC, pctFiner: parseFloat((pFiner * 100).toFixed(1)) };
}

export function isAstmProctorMethod(method: string): method is "MODIFIED_PROCTOR" | "STANDARD_PROCTOR" {
  return method === "MODIFIED_PROCTOR" || method === "STANDARD_PROCTOR";
}

export function isBsProctorMethod(method: string): method is "BS_HEAVY" | "BS_LIGHT" {
  return method === "BS_HEAVY" || method === "BS_LIGHT";
}

export function proctorMethodLinksToAstmCbr(method: string): boolean {
  return isAstmProctorMethod(method);
}

export function proctorMethodLinksToBsCbr(method: string): boolean {
  return isBsProctorMethod(method);
}
