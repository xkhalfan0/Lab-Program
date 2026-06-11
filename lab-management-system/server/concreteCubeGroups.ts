/**
 * Auto-create a single concrete test group + placeholder cubes for CONC_CUBE distributions.
 */

import {
  createConcreteGroup,
  getConcreteGroupsByDistribution,
  getCubesByGroup,
  getDistributionById,
  getSampleById,
  upsertConcreteCube,
} from "./db";
import {
  parseConcCubePlan,
  mmToNominalCubeSize,
  nominalCubeSizeToMm,
  DEFAULT_CONC_CUBE_COUNT,
  type ConcCubeReceptionPlan,
} from "@shared/concreteCubeReception";

export async function getConcCubePlanForDistribution(
  distributionId: number,
): Promise<ConcCubeReceptionPlan | null> {
  const dist = await getDistributionById(distributionId);
  if (!dist || dist.testType !== "CONC_CUBE") return null;
  return parseConcCubePlan(dist.testSubType);
}

export function resolveCubeSizeMm(
  dist: { testSubType?: string | null },
  sample: { nominalCubeSize?: string | null } | null,
): 100 | 150 {
  const plan = parseConcCubePlan(dist.testSubType);
  if (plan) return plan.cubeSizeMm;
  return nominalCubeSizeToMm(sample?.nominalCubeSize);
}

export async function ensureConcreteGroupsFromReceptionPlan(
  distributionId: number,
  technicianId: number,
  technicianName?: string | null,
): Promise<{ created: number; plan: ConcCubeReceptionPlan | null }> {
  const dist = await getDistributionById(distributionId);
  if (!dist || dist.testType !== "CONC_CUBE") return { created: 0, plan: null };

  const sample = await getSampleById(dist.sampleId);
  if (!sample) return { created: 0, plan: null };

  const plan = parseConcCubePlan(dist.testSubType) ?? {
    v: 2,
    cubeSizeMm: nominalCubeSizeToMm(sample.nominalCubeSize),
  };

  const existing = await getConcreteGroupsByDistribution(distributionId);
  const edge = String(plan.cubeSizeMm);
  const nominalStr = mmToNominalCubeSize(plan.cubeSizeMm);
  let created = 0;

  let group = existing[0];
  if (!group) {
    const cast = sample.castingDate ? new Date(sample.castingDate) : null;
    const castYmd = cast && !isNaN(cast.getTime()) ? cast.toISOString().split("T")[0] : undefined;
    group = await createConcreteGroup({
      distributionId,
      sampleId: dist.sampleId,
      technicianId,
      testAge: 0,
      contractNo: sample.contractNumber ?? undefined,
      projectName: sample.contractName ?? undefined,
      contractorName: sample.contractorName ?? undefined,
      testedBy: technicianName ?? undefined,
      batchDateTime: castYmd,
      dateSampled: cast ?? undefined,
      nominalCubeSize: nominalStr,
      status: "draft",
    });
    created++;
  }

  const cubes = await getCubesByGroup(group.id);
  const targetCount = DEFAULT_CONC_CUBE_COUNT;
  if (cubes.length < targetCount) {
    for (let mark = cubes.length + 1; mark <= targetCount; mark++) {
      await upsertConcreteCube({
        groupId: group.id,
        markNo: mark,
        length: edge,
        width: edge,
        height: edge,
        maxLoadKN: "0",
        fractureType: "SF",
      });
    }
  }

  return { created, plan };
}
