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
}

export interface CoreSpecimenComputed extends CoreSpecimenInput {
  refMarshallBulkSG: string;
  specimenVolume: number;
  coreBulkSG: number;
  compactionPercent: number;
}

export interface CoreBatchInput {
  id: string;
  refMarshallBulkSG: string;
  specimens: CoreSpecimenInput[];
}

export interface CoreBatchComputed extends CoreBatchInput {
  averageCompaction: number;
  specimens: CoreSpecimenComputed[];
}

export function createCoreSpecimen(
  batchId: string,
  specimenNumber: number,
): CoreSpecimenInput {
  return {
    id: `${batchId}-s${specimenNumber}`,
    specimenNumber,
    heightMm: "",
    spotLocation: "",
    offset: "",
    massInAir: "",
    massAtSSD: "",
    massInWater: "",
  };
}

export function createCoreBatch(id: string): CoreBatchInput {
  return { id, refMarshallBulkSG: "", specimens: [] };
}

export function renumberBatchSpecimens(specimens: CoreSpecimenInput[]): CoreSpecimenInput[] {
  return specimens.map((s, i) => ({ ...s, specimenNumber: i + 1 }));
}

export function computeCoreSpecimen(
  specimen: CoreSpecimenInput,
  refMarshallBulkSG: string,
): CoreSpecimenComputed {
  const massAir = parseFloat(specimen.massInAir) || 0;
  const massSSD = parseFloat(specimen.massAtSSD) || 0;
  const massWater = parseFloat(specimen.massInWater) || 0;
  const refMarshall = parseFloat(refMarshallBulkSG) || 0;

  const specimenVolume = massSSD - massWater;
  const coreBulkSG = specimenVolume > 0 ? massAir / specimenVolume : 0;
  const compactionPercent = refMarshall > 0 ? (coreBulkSG / refMarshall) * 100 : 0;

  return {
    ...specimen,
    refMarshallBulkSG,
    specimenVolume: parseFloat(specimenVolume.toFixed(1)),
    coreBulkSG: parseFloat(coreBulkSG.toFixed(3)),
    compactionPercent: parseFloat(compactionPercent.toFixed(1)),
  };
}

export function computeCoreBatch(batch: CoreBatchInput): CoreBatchComputed {
  const computedSpecimens = batch.specimens.map((s) =>
    computeCoreSpecimen(s, batch.refMarshallBulkSG),
  );
  const withCompaction = computedSpecimens.filter((s) => s.compactionPercent > 0);
  const averageCompaction =
    withCompaction.length > 0
      ? parseFloat(
          (
            withCompaction.reduce((sum, s) => sum + s.compactionPercent, 0) /
            withCompaction.length
          ).toFixed(1),
        )
      : 0;

  return { ...batch, specimens: computedSpecimens, averageCompaction };
}

export function computeCoreBatches(batches: CoreBatchInput[]): CoreBatchComputed[] {
  return batches.map(computeCoreBatch);
}

/** Flatten batches for legacy `cores` field and reports. */
export function flattenBatchesToCores(batches: CoreBatchComputed[]): CoreSpecimenComputed[] {
  let globalNum = 1;
  return batches.flatMap((batch) =>
    batch.specimens.map((s) => ({
      ...s,
      specimenNumber: globalNum++,
    })),
  );
}

function legacyCoreToSpecimen(
  c: Record<string, unknown>,
  batchId: string,
  index: number,
): CoreSpecimenInput {
  return {
    id: String(c.id ?? `${batchId}-s${index + 1}`),
    specimenNumber: Number(c.specimenNumber ?? index + 1),
    heightMm: String(c.heightMm ?? c.avgThickness ?? ""),
    spotLocation: String(c.spotLocation ?? c.location ?? ""),
    offset: (c.offset as CoreOffset) ?? "",
    massInAir: String(c.massInAir ?? c.weightInAir ?? ""),
    massAtSSD: String(c.massAtSSD ?? c.weightSSD ?? ""),
    massInWater: String(c.massInWater ?? c.weightInWater ?? ""),
  };
}

/** Group legacy per-core Ref Marshall values into batches. */
export function migrateFlatCoresToBatches(
  cores: Array<Record<string, unknown>>,
  defaultRef = "",
): CoreBatchInput[] {
  if (cores.length === 0) {
    return [createCoreBatch("1")];
  }

  const groups: { ref: string; specimens: CoreSpecimenInput[] }[] = [];
  const refOrder: string[] = [];

  cores.forEach((c, i) => {
    const ref = String(c.refMarshallBulkSG ?? defaultRef).trim();
    let group = groups.find((g) => g.ref === ref);
    if (!group) {
      group = { ref, specimens: [] };
      groups.push(group);
      refOrder.push(ref);
    }
    group.specimens.push(
      legacyCoreToSpecimen(c, `batch-${refOrder.indexOf(ref) + 1}`, group.specimens.length),
    );
  });

  return groups.map((g, i) => ({
    id: String(i + 1),
    refMarshallBulkSG: g.ref,
    specimens: renumberBatchSpecimens(g.specimens),
  }));
}

/** Load batch-first or legacy flat cores from saved formData. */
export function parseBatchesFromFormData(fd: Record<string, unknown>): CoreBatchInput[] {
  const savedBatches = fd.batches as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(savedBatches) && savedBatches.length > 0) {
    const first = savedBatches[0];
    if (first && (Array.isArray(first.specimens) || first.specimenCount != null)) {
      return savedBatches.map((b, bi) => {
        const batchId = String(b.id ?? bi + 1);
        const rawSpecimens = (b.specimens as Array<Record<string, unknown>>) ?? [];
        const specimens =
          rawSpecimens.length > 0
            ? rawSpecimens.map((s, si) => legacyCoreToSpecimen(s, batchId, si))
            : [];
        return {
          id: batchId,
          refMarshallBulkSG: String(b.refMarshallBulkSG ?? ""),
          specimens: renumberBatchSpecimens(specimens),
        };
      });
    }
  }

  const savedCores = fd.cores as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(savedCores) && savedCores.length > 0) {
    return migrateFlatCoresToBatches(
      savedCores,
      String(fd.marshallDensity ?? fd.marshallDensityStr ?? ""),
    );
  }

  return [createCoreBatch("1")];
}
