/**
 * California Bearing Ratio — BS 1377-4 / ASTM D1883
 * CBR = (Measured Load / Standard Load) × 100
 */

export type CBRStandardKey = "BS1377" | "ASTM_D1883";

/** BS 1377 first (legacy workflow), then ASTM D1883. */
export const CBR_STANDARD_ORDER: CBRStandardKey[] = ["BS1377", "ASTM_D1883"];

export interface CBRStandardSpec {
  label: string;
  loadUnit: string;
  penetrationUnit: string;
  penetrationDepths: number[];
  keyDepthPrimary: number;
  keyDepthSecondary: number;
  standardLoadPrimary: number;
  standardLoadSecondary: number;
  soakingHours: number;
  specimens: readonly number[];
  layers: number;
  pistonArea?: number;
}

export const CBR_STANDARDS: Record<CBRStandardKey, CBRStandardSpec> = {
  BS1377: {
    label: "BS 1377-4",
    loadUnit: "kN",
    penetrationUnit: "mm",
    penetrationDepths: Array.from({ length: 31 }, (_, i) => parseFloat((i * 0.25).toFixed(2))),
    keyDepthPrimary: 2.5,
    keyDepthSecondary: 5.0,
    standardLoadPrimary: 13.24,
    standardLoadSecondary: 19.96,
    soakingHours: 96,
    specimens: [10, 30, 65],
    layers: 5,
  },
  ASTM_D1883: {
    label: "ASTM D1883",
    loadUnit: "lbf",
    penetrationUnit: "in",
    penetrationDepths: [0, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4],
    keyDepthPrimary: 0.1,
    keyDepthSecondary: 0.2,
    standardLoadPrimary: 1000,
    standardLoadSecondary: 1500,
    soakingHours: 96,
    specimens: [10, 30, 65],
    layers: 5,
    pistonArea: 3,
  },
};

export interface CBRFaceInput {
  id: string;
  faceLabel: string;
  readings: string[];
  cbrPrimary?: number;
  cbrSecondary?: number;
  cbrValue?: number;
  cbrAnomaly?: boolean;
  stressPrimary?: number;
  stressSecondary?: number;
}

const depthMatch = (a: number, b: number) => Math.abs(a - b) < 0.001;

export function getDepthIndex(spec: CBRStandardSpec, depth: number): number {
  return spec.penetrationDepths.findIndex(d => depthMatch(d, depth));
}

export function computeCBRFace(face: CBRFaceInput, spec: CBRStandardSpec): CBRFaceInput {
  const loads = face.readings.map(r => parseFloat(r) || 0);
  const idxPrimary = getDepthIndex(spec, spec.keyDepthPrimary);
  const idxSecondary = getDepthIndex(spec, spec.keyDepthSecondary);
  const loadPrimary = idxPrimary >= 0 ? loads[idxPrimary] || 0 : 0;
  const loadSecondary = idxSecondary >= 0 ? loads[idxSecondary] || 0 : 0;

  if (!loadPrimary && !loadSecondary) return face;

  const cbrPrimary = loadPrimary > 0
    ? parseFloat(((loadPrimary / spec.standardLoadPrimary) * 100).toFixed(1))
    : undefined;
  const cbrSecondary = loadSecondary > 0
    ? parseFloat(((loadSecondary / spec.standardLoadSecondary) * 100).toFixed(1))
    : undefined;

  const cbrValue = Math.max(cbrPrimary ?? 0, cbrSecondary ?? 0);
  const cbrAnomaly = !!(cbrSecondary && cbrPrimary && cbrSecondary > cbrPrimary);

  let stressPrimary: number | undefined;
  let stressSecondary: number | undefined;
  if (spec.pistonArea && spec.pistonArea > 0) {
    if (loadPrimary > 0) stressPrimary = parseFloat((loadPrimary / spec.pistonArea).toFixed(0));
    if (loadSecondary > 0) stressSecondary = parseFloat((loadSecondary / spec.pistonArea).toFixed(0));
  }

  return {
    ...face,
    cbrPrimary,
    cbrSecondary,
    cbrValue: cbrValue > 0 ? parseFloat(cbrValue.toFixed(1)) : undefined,
    cbrAnomaly,
    stressPrimary,
    stressSecondary,
    // Legacy field names for report compatibility
    cbr_2_5: cbrPrimary,
    cbr_5_0: cbrSecondary,
  } as CBRFaceInput & { cbr_2_5?: number; cbr_5_0?: number };
}

export function newCBRFace(label: string, depthCount: number): CBRFaceInput {
  return {
    id: `face_${Date.now()}_${label}`,
    faceLabel: label,
    readings: Array(depthCount).fill(""),
  };
}

export function formatPenetrationDepth(depth: number, unit: string): string {
  if (unit === "in") return depth.toFixed(3).replace(/\.?0+$/, "") || "0";
  return Number.isInteger(depth) ? depth.toFixed(1) : String(depth);
}
