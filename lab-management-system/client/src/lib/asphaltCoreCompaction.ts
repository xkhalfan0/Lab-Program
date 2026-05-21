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

/** Batch metadata for table rowSpan rendering (after sort-by-ref display order). */
export interface CoreBatchLayout extends CoreBatch {
  startIndex: number;
  rowCount: number;
}

export interface CoreBatchTableLayout {
  sortedCores: CoreSpecimenComputed[];
  batches: CoreBatchLayout[];
  coreIdToBatch: Map<string, CoreBatchLayout>;
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
  return buildCoreBatchTableLayout(sortCoresForBatchDisplay(computedCores)).batches;
}

/** Sort cores so specimens sharing the same Ref Marshall SG appear together. */
export function sortCoresForBatchDisplay(
  computedCores: CoreSpecimenComputed[],
): CoreSpecimenComputed[] {
  return [...computedCores].sort((a, b) => {
    const refA = parseFloat(a.refMarshallBulkSG) || 0;
    const refB = parseFloat(b.refMarshallBulkSG) || 0;
    if (refA !== refB) return refA - refB;
    return a.specimenNumber - b.specimenNumber;
  });
}

/** Build batch groups with row indices for rowSpan cells (uses sorted display order). */
export function buildCoreBatchTableLayout(
  computedCores: CoreSpecimenComputed[],
): CoreBatchTableLayout {
  const sortedCores = sortCoresForBatchDisplay(computedCores);
  const batches: CoreBatchLayout[] = [];
  const coreIdToBatch = new Map<string, CoreBatchLayout>();
  let index = 0;

  while (index < sortedCores.length) {
    const refKey = sortedCores[index].refMarshallBulkSG?.trim() || "";
    const refMarshallBulkSG = parseFloat(refKey);
    if (!refKey || Number.isNaN(refMarshallBulkSG)) {
      index++;
      continue;
    }

    const startIndex = index;
    const specimens: CoreSpecimenComputed[] = [];
    while (
      index < sortedCores.length &&
      (sortedCores[index].refMarshallBulkSG?.trim() || "") === refKey
    ) {
      specimens.push(sortedCores[index]);
      index++;
    }

    const withCompaction = specimens.filter((s) => s.compactionPercent > 0);
    const avgCompaction =
      withCompaction.length > 0
        ? withCompaction.reduce((sum, s) => sum + s.compactionPercent, 0) / withCompaction.length
        : 0;

    const batch: CoreBatchLayout = {
      refMarshallBulkSG,
      specimens,
      averageCompaction: parseFloat(avgCompaction.toFixed(1)),
      startIndex,
      rowCount: specimens.length,
    };
    batches.push(batch);
    specimens.forEach((s) => coreIdToBatch.set(s.id, batch));
  }

  return { sortedCores, batches, coreIdToBatch };
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
