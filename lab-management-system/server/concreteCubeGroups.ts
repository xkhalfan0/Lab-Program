/**
 * Auto-create concrete test groups + placeholder cubes from reception plan.
 */

import {
  createConcreteGroup,
  getConcreteGroupsByDistribution,
  getCubesByGroup,
  getDistributionById,
  getSampleById,
  upsertConcreteCube,
  updateConcreteGroupSummary,
} from "./db";
import {
  parseConcCubePlan,
  mmToNominalCubeSize,
  type ConcCubeReceptionPlan,
} from "@shared/concreteCubeReception";
import { cubeEdgeMmFromNominal } from "@shared/concreteCubeBs1881";

export async function getConcCubePlanForDistribution(
  distributionId: number,
): Promise<ConcCubeReceptionPlan | null> {
  const dist = await getDistributionById(distributionId);
  if (!dist || dist.testType !== "CONC_CUBE") return null;
  return parseConcCubePlan(dist.testSubType);
}

export async function ensureConcreteGroupsFromReceptionPlan(
  distributionId: number,
  technicianId: number,
  technicianName?: string | null,
): Promise<{ created: number; plan: ConcCubeReceptionPlan | null }> {
  const dist = await getDistributionById(distributionId);
  if (!dist) return { created: 0, plan: null };

  const plan = parseConcCubePlan(dist.testSubType);
  if (!plan) return { created: 0, plan: null };

  const sample = await getSampleById(dist.sampleId);
  if (!sample) return { created: 0, plan };

  const existing = await getConcreteGroupsByDistribution(distributionId);
  const edge = String(plan.cubeSizeMm);
  const nominalStr = mmToNominalCubeSize(plan.cubeSizeMm);
  let created = 0;

  for (const ag of plan.ageGroups) {
    let group = existing.find(g => g.testAge === ag.nominalAge);
    if (!group) {
      const cast = sample.castingDate ? new Date(sample.castingDate) : null;
      const castYmd = cast && !isNaN(cast.getTime()) ? cast.toISOString().split("T")[0] : undefined;
      group = await createConcreteGroup({
        distributionId,
        sampleId: dist.sampleId,
        technicianId,
        testAge: ag.nominalAge,
        contractNo: sample.contractNumber ?? undefined,
        projectName: sample.contractName ?? undefined,
        contractorName: sample.contractorName ?? undefined,
        testedBy: technicianName ?? undefined,
        minAcceptable: String(plan.designStrength),
        classOfConcrete: `C${Math.round(plan.designStrength)}`,
        batchDateTime: castYmd,
        dateSampled: cast ?? undefined,
        nominalCubeSize: nominalStr,
        status: "draft",
      });
      created++;
    } else if (!group.minAcceptable) {
      await updateConcreteGroupSummary(group.id, {
        minAcceptable: String(plan.designStrength),
        classOfConcrete: `C${Math.round(plan.designStrength)}`,
      });
    }

    if (!group) continue;

    const cubes = await getCubesByGroup(group.id);
    const targetCount = ag.cubeCount;
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
  }

  return { created, plan };
}
