/** HMA core compaction acceptance (overall average). */
export const CORE_COMPACTION_MIN = 97.0;
export const CORE_COMPACTION_MAX = 100.5;

export type CoreLayerType = "wearing_course" | "base_course";
export type CoreOffset = "LHS" | "CA" | "RHS" | "";

export interface CoreSpecimenInput {
  id: string;
  specimenNumber: number;
  heightMm: string;
  spotLocation: string;
  offset: CoreOffset;
  massInAir: string;
  massAtSSD: string;
  massInWater: string;
  refMarshallBulkSG: string;
}

export interface CoreSpecimenComputed extends CoreSpecimenInput {
  specimenVolume: number;
  coreBulkSG: number;
  compactionPercent: number;
}

export interface CoreBatch {
  refMarshallBulkSG: number;
  specimens: CoreSpecimenComputed[];
  averageCompaction: number;
}

export function computeCoreSpecimen(core: CoreSpecimenInput): CoreSpecimenComputed {
  const massAir = parseFloat(core.massInAir) || 0;
  const massSSD = parseFloat(core.massAtSSD) || 0;
  const massWater = parseFloat(core.massInWater) || 0;
  const refMarshall = parseFloat(core.refMarshallBulkSG) || 0;

  const specimenVolume = massSSD - massWater;
  const coreBulkSG = specimenVolume > 0 ? massAir / specimenVolume : 0;
  const compactionPercent = refMarshall > 0 ? (coreBulkSG / refMarshall) * 100 : 0;

  return {
    ...core,
    specimenVolume: parseFloat(specimenVolume.toFixed(1)),
    coreBulkSG: parseFloat(coreBulkSG.toFixed(3)),
    compactionPercent: parseFloat(compactionPercent.toFixed(1)),
  };
}

export function groupCoreBatches(computedCores: CoreSpecimenComputed[]): CoreBatch[] {
  const grouped = new Map<string, CoreSpecimenComputed[]>();

  computedCores.forEach((core) => {
    const refKey = core.refMarshallBulkSG?.trim() || "";
    if (!refKey) return;
    const list = grouped.get(refKey) ?? [];
    list.push(core);
    grouped.set(refKey, list);
  });

  const batches: CoreBatch[] = [];
  grouped.forEach((specimens, refKey) => {
    const refMarshallBulkSG = parseFloat(refKey);
    if (Number.isNaN(refMarshallBulkSG) || specimens.length === 0) return;
    const avgCompaction =
      specimens.reduce((sum, s) => sum + s.compactionPercent, 0) / specimens.length;
    batches.push({
      refMarshallBulkSG,
      specimens,
      averageCompaction: parseFloat(avgCompaction.toFixed(1)),
    });
  });

  return batches.sort((a, b) => a.refMarshallBulkSG - b.refMarshallBulkSG);
}

export function createCoreSpecimen(id: string, specimenNumber: number): CoreSpecimenInput {
  return {
    id,
    specimenNumber,
    heightMm: "",
    spotLocation: "",
    offset: "",
    massInAir: "",
    massAtSSD: "",
    massInWater: "",
    refMarshallBulkSG: "",
  };
}
