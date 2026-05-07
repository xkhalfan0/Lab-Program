import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import {
  clearanceRequests,
  contractors,
  contracts,
  distributions,
  labOrderItems,
  labOrders,
  notifications,
  samples,
  specializedTestResults,
  testTypes,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";

type Priority = "low" | "normal" | "high" | "urgent";
type OrderStatus = "pending" | "distributed" | "in_progress" | "completed";
type SampleType = "concrete" | "soil" | "steel" | "asphalt" | "aggregates";

function d(isoDate: string) {
  return new Date(`${isoDate}T09:00:00.000Z`);
}

function addDays(date: Date, days: number) {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function itemStatusForOrder(status: OrderStatus): "pending" | "in_progress" | "completed" {
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  return "pending";
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available. Set DATABASE_URL in .env");
    process.exit(1);
  }

  try {
    console.log("Checking existing demo data...");
    const existingDemo = await db
      .select({ id: contractors.id })
      .from(contractors)
      .where(eq(contractors.nameEn, "United Construction Co."))
      .limit(1);
    const hasCoreDemo = existingDemo.length > 0;

    console.log("Resolving users and test types...");
    const technician = (
      await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.role, "technician"))
        .limit(1)
    )[0];
    if (!technician) throw new Error("No technician user found. Seed users first.");

    const supervisor =
      (
        await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.role, "sample_manager"))
          .limit(1)
      )[0] ??
      (
        await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.role, "lab_manager"))
          .limit(1)
      )[0];
    if (!supervisor) throw new Error("No supervisor user (sample_manager/lab_manager) found.");

    const reception =
      (
        await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.role, "reception"))
          .limit(1)
      )[0] ??
      (
        await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.role, "admin"))
          .limit(1)
      )[0];
    if (!reception) throw new Error("No reception/admin user found.");

    // Dashboard-focused seeding block (samples + distributions) for repeated runs.
    const dashboardSamplesSeeded = await db
      .select({ id: samples.id })
      .from(samples)
      .where(eq(samples.sampleCode, "LAB-2026-0010"))
      .limit(1);
    if (dashboardSamplesSeeded.length > 0) {
      console.log("samples already seeded");
      if (hasCoreDemo) return;
    } else {
      console.log("Seeding dashboard samples (LAB-2026-0010..0019)...");
      const dashContractNumbers = [
        "DOI-2025-T001",
        "GB-2025-001",
        "GB-2025-002",
        "HSG-2025-001",
        "DOI-2025-T002",
      ];
      const dashContracts = await db
        .select({
          id: contracts.id,
          contractNumber: contracts.contractNumber,
          contractName: contracts.contractName,
          contractorId: contracts.contractorId,
          sectorKey: contracts.sectorKey,
        })
        .from(contracts)
        .where(inArray(contracts.contractNumber, dashContractNumbers));
      if (dashContracts.length < dashContractNumbers.length) {
        throw new Error("Missing demo contracts required for dashboard sample seeding.");
      }
      const dashContractorData = await db
        .select({ id: contractors.id, nameEn: contractors.nameEn })
        .from(contractors)
        .where(inArray(contractors.id, dashContracts.map((c) => c.contractorId)));
      const dashContractByNumber = new Map(dashContracts.map((c) => [c.contractNumber, c]));
      const dashContractorNameById = new Map(dashContractorData.map((c) => [c.id, c.nameEn]));

      // Note: schema uses "received" instead of "new", and "tested" instead of "testing".
      const dashboardSamples = [
        { sampleCode: "LAB-2026-0010", contractNumber: "DOI-2025-T001", sampleType: "concrete" as const, sector: "sector_1", status: "received" as const, location: "Floor 3 Column C2", receivedAt: "2026-04-10", castingDate: "2026-03-31", condition: "good" as const },
        { sampleCode: "LAB-2026-0011", contractNumber: "GB-2025-001", sampleType: "soil" as const, sector: "sector_2", status: "received" as const, location: "Grid B-4 Foundation", receivedAt: "2026-04-11", castingDate: "2026-04-01", condition: "partial" as const },
        { sampleCode: "LAB-2026-0012", contractNumber: "GB-2025-002", sampleType: "steel" as const, sector: "sector_3", status: "received" as const, location: "Retaining Wall West", receivedAt: "2026-04-12", castingDate: "2026-04-02", condition: "good" as const },
        { sampleCode: "LAB-2026-0013", contractNumber: "HSG-2025-001", sampleType: "asphalt" as const, sector: "sector_4", status: "distributed" as const, location: "Road Section KM 12", receivedAt: "2026-04-13", castingDate: "2026-04-03", condition: "good" as const },
        { sampleCode: "LAB-2026-0014", contractNumber: "DOI-2025-T002", sampleType: "concrete" as const, sector: "sector_1", status: "distributed" as const, location: "Slab Level 2", receivedAt: "2026-04-14", castingDate: "2026-04-04", condition: "good" as const },
        { sampleCode: "LAB-2026-0015", contractNumber: "DOI-2025-T001", sampleType: "soil" as const, sector: "sector_1", status: "distributed" as const, location: "Grid B-4 Foundation", receivedAt: "2026-04-15", castingDate: "2026-04-05", condition: "partial" as const },
        { sampleCode: "LAB-2026-0016", contractNumber: "GB-2025-001", sampleType: "steel" as const, sector: "sector_2", status: "tested" as const, location: "Retaining Wall West", receivedAt: "2026-04-16", castingDate: "2026-04-06", condition: "good" as const },
        { sampleCode: "LAB-2026-0017", contractNumber: "GB-2025-002", sampleType: "asphalt" as const, sector: "sector_3", status: "tested" as const, location: "Road Section KM 12", receivedAt: "2026-04-17", castingDate: "2026-04-07", condition: "good" as const },
        { sampleCode: "LAB-2026-0018", contractNumber: "HSG-2025-001", sampleType: "concrete" as const, sector: "sector_4", status: "processed" as const, location: "Floor 3 Column C2", receivedAt: "2026-04-18", castingDate: "2026-04-08", condition: "good" as const },
        { sampleCode: "LAB-2026-0019", contractNumber: "DOI-2025-T002", sampleType: "soil" as const, sector: "sector_1", status: "qc_passed" as const, location: "Slab Level 2", receivedAt: "2026-04-19", castingDate: "2026-04-09", condition: "good" as const },
      ];
      await db.insert(samples).values(
        dashboardSamples.map((s) => {
          const c = dashContractByNumber.get(s.contractNumber)!;
          return {
            sampleCode: s.sampleCode,
            contractId: c.id,
            contractNumber: c.contractNumber,
            contractName: c.contractName,
            contractorName: dashContractorNameById.get(c.contractorId) ?? "",
            sampleType: s.sampleType,
            sector: s.sector,
            quantity: 1,
            condition: s.condition,
            status: s.status,
            location: s.location,
            castingDate: d(s.castingDate),
            receivedById: reception.id,
            receivedAt: d(s.receivedAt),
          };
        })
      );

      const dashboardSampleRows = await db
        .select({ id: samples.id, sampleCode: samples.sampleCode })
        .from(samples)
        .where(inArray(samples.sampleCode, dashboardSamples.map((s) => s.sampleCode)));
      const dashboardSampleByCode = new Map(dashboardSampleRows.map((s) => [s.sampleCode, s.id]));

      console.log("Seeding dashboard distributions (DIST-2026-010..015)...");
      const dashboardDists = [
        { distributionCode: "DIST-2026-010", sampleCode: "LAB-2026-0013", status: "pending" as const, createdAt: "2026-04-20" },
        { distributionCode: "DIST-2026-011", sampleCode: "LAB-2026-0014", status: "pending" as const, createdAt: "2026-04-21" },
        { distributionCode: "DIST-2026-012", sampleCode: "LAB-2026-0015", status: "pending" as const, createdAt: "2026-04-22" },
        { distributionCode: "DIST-2026-013", sampleCode: "LAB-2026-0016", status: "in_progress" as const, createdAt: "2026-04-23" },
        { distributionCode: "DIST-2026-014", sampleCode: "LAB-2026-0017", status: "in_progress" as const, createdAt: "2026-04-24" },
        { distributionCode: "DIST-2026-015", sampleCode: "LAB-2026-0018", status: "in_progress" as const, createdAt: "2026-04-25" },
      ];
      await db.insert(distributions).values(
        dashboardDists.map((dist, i) => {
          const createdAt = d(dist.createdAt);
          const sampleCode = dist.sampleCode;
          const sampleType = dashboardSamples.find((s) => s.sampleCode === sampleCode)?.sampleType ?? "concrete";
          return {
            distributionCode: dist.distributionCode,
            sampleId: dashboardSampleByCode.get(sampleCode)!,
            assignedTechnicianId: technician.id,
            assignedById: supervisor.id,
            testType:
              sampleType === "concrete" ? "CONC_CUBE" :
              sampleType === "soil" ? "SOIL_PROCTOR" :
              sampleType === "steel" ? "STEEL_REBAR" : "ASPH_MARSHALL",
            testName:
              sampleType === "concrete" ? "Compressive Strength of Concrete Cubes" :
              sampleType === "soil" ? "MDD/OMC (Proctor) test" :
              sampleType === "steel" ? "Tensile Strength of Reinforcement Steel" : "Stability, Flow & Voids Percentage of Marshall Specimens",
            priority: i % 3 === 0 ? "high" : i % 3 === 1 ? "normal" : "urgent",
            quantity: 1,
            unitPrice: "100",
            totalCost: "100",
            expectedCompletionDate: addDays(createdAt, 7),
            notes: "Dashboard demo distribution",
            status: dist.status,
            createdAt,
          };
        })
      );
      console.log("Dashboard sample/distribution data seeded.");
      if (hasCoreDemo) return;
    }

    if (hasCoreDemo) {
      console.log("Demo data already exists, skipping");
      return;
    }

    const requiredCodes = [
      "CONC_CUBE",
      "CONC_CORE",
      "CONC_BLOCK",
      "SOIL_PROCTOR",
      "SOIL_SIEVE",
      "STEEL_REBAR",
      "STEEL_BEND",
      "ASPH_MARSHALL",
      "ASPH_CORE",
      "AGG_SIEVE",
      "AGG_CRUSHING",
    ];
    const typeRows = await db
      .select({
        id: testTypes.id,
        code: testTypes.code,
        nameEn: testTypes.nameEn,
        formTemplate: testTypes.formTemplate,
        unitPrice: testTypes.unitPrice,
        category: testTypes.category,
      })
      .from(testTypes)
      .where(inArray(testTypes.code, requiredCodes));
    const typeByCode = new Map(typeRows.map((t) => [t.code ?? "", t]));
    const missingCodes = requiredCodes.filter((c) => !typeByCode.has(c));
    if (missingCodes.length > 0) {
      throw new Error(`Missing test type codes: ${missingCodes.join(", ")}. Run db:seed:test-types first.`);
    }

    console.log("Seeding contractors...");
    const contractorRows = [
      { nameEn: "United Construction Co.", nameAr: "شركة المتحدة للإنشاءات", isActive: true },
      { nameEn: "Gulf Builders Est.", nameAr: "مؤسسة بناة الخليج", isActive: true },
      { nameEn: "Al Noor Contracting", nameAr: "شركة النور للمقاولات", isActive: true },
      { nameEn: "Modern Structures LLC", nameAr: "شركة الهياكل الحديثة", isActive: true },
    ] as const;
    await db.insert(contractors).values(
      contractorRows.map((c, i) => ({
        ...c,
        contractorCode: `DEMO-CON-${String(i + 1).padStart(3, "0")}`,
      }))
    );
    const contractorData = await db
      .select({ id: contractors.id, nameEn: contractors.nameEn })
      .from(contractors)
      .where(inArray(contractors.nameEn, contractorRows.map((c) => c.nameEn)));
    const contractorIdByName = new Map(contractorData.map((c) => [c.nameEn, c.id]));

    console.log("Seeding contracts...");
    const contractRows = [
      {
        contractNumber: "DOI-2025-T001",
        contractName: "تطوير البنية التحتية - الدفعة الأولى",
        contractorNameEn: "United Construction Co.",
        sectorKey: "sector_1",
        startDate: d("2025-01-01"),
        endDate: d("2026-12-31"),
        isActive: true,
      },
      {
        contractNumber: "GB-2025-001",
        contractName: "إنشاء مبنى البلدية الجديد",
        contractorNameEn: "Gulf Builders Est.",
        sectorKey: "sector_2",
        startDate: d("2025-02-01"),
        endDate: d("2027-02-28"),
        isActive: true,
      },
      {
        contractNumber: "GB-2025-002",
        contractName: "توسعة مجمع المحاكم",
        contractorNameEn: "Al Noor Contracting",
        sectorKey: "sector_3",
        startDate: d("2025-03-15"),
        endDate: d("2026-09-30"),
        isActive: true,
      },
      {
        contractNumber: "HSG-2025-001",
        contractName: "الإسكان الاجتماعي المرحلة الأولى",
        contractorNameEn: "Modern Structures LLC",
        sectorKey: "sector_4",
        startDate: d("2025-10-01"),
        endDate: d("2026-12-31"),
        isActive: true,
      },
      {
        contractNumber: "DOI-2025-T002",
        contractName: "صيانة الطرق الداخلية",
        contractorNameEn: "United Construction Co.",
        sectorKey: "sector_1",
        startDate: d("2025-06-01"),
        endDate: d("2026-06-30"),
        isActive: true,
      },
    ] as const;
    await db.insert(contracts).values(
      contractRows.map((c) => ({
        contractNumber: c.contractNumber,
        contractName: c.contractName,
        contractorId: contractorIdByName.get(c.contractorNameEn)!,
        sectorKey: c.sectorKey,
        isActive: c.isActive,
        startDate: c.startDate,
        endDate: c.endDate,
      }))
    );
    const contractData = await db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        contractName: contracts.contractName,
        contractorId: contracts.contractorId,
        sectorKey: contracts.sectorKey,
      })
      .from(contracts)
      .where(inArray(contracts.contractNumber, contractRows.map((c) => c.contractNumber)));
    const contractByNumber = new Map(contractData.map((c) => [c.contractNumber, c]));

    console.log("Seeding samples...");
    const sampleRows = [
      { sampleCode: "LAB-2026-0001", contractNumber: "DOI-2025-T001", sampleType: "concrete", location: "Floor 3 Column C2", castingDate: "2026-03-22", receivedAt: "2026-04-02", condition: "good" as const },
      { sampleCode: "LAB-2026-0002", contractNumber: "GB-2025-001", sampleType: "soil", location: "Grid B-4 Foundation", castingDate: "2026-03-24", receivedAt: "2026-04-03", condition: "partial" as const },
      { sampleCode: "LAB-2026-0003", contractNumber: "GB-2025-002", sampleType: "steel", location: "Retaining Wall West", castingDate: "2026-03-25", receivedAt: "2026-04-04", condition: "good" as const },
      { sampleCode: "LAB-2026-0004", contractNumber: "HSG-2025-001", sampleType: "asphalt", location: "Road Section KM 12", castingDate: "2026-03-26", receivedAt: "2026-04-05", condition: "good" as const },
      { sampleCode: "LAB-2026-0005", contractNumber: "DOI-2025-T002", sampleType: "aggregates", location: "Slab Level 2", castingDate: "2026-03-27", receivedAt: "2026-04-06", condition: "partial" as const },
      { sampleCode: "LAB-2026-0006", contractNumber: "DOI-2025-T001", sampleType: "concrete", location: "Grid B-4 Foundation", castingDate: "2026-03-28", receivedAt: "2026-04-07", condition: "good" as const },
      { sampleCode: "LAB-2026-0007", contractNumber: "GB-2025-001", sampleType: "soil", location: "Floor 3 Column C2", castingDate: "2026-03-29", receivedAt: "2026-04-08", condition: "good" as const },
      { sampleCode: "LAB-2026-0008", contractNumber: "GB-2025-002", sampleType: "steel", location: "Retaining Wall West", castingDate: "2026-03-30", receivedAt: "2026-04-09", condition: "good" as const },
    ];
    await db.insert(samples).values(
      sampleRows.map((s) => {
        const contract = contractByNumber.get(s.contractNumber)!;
        return {
          sampleCode: s.sampleCode,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          contractName: contract.contractName,
          contractorName: contractorData.find((c) => c.id === contract.contractorId)?.nameEn ?? "",
          sampleType: s.sampleType,
          sector: contract.sectorKey ?? "sector_1",
          quantity: 1,
          condition: s.condition,
          status: "received",
          location: s.location,
          castingDate: d(s.castingDate),
          receivedById: reception.id,
          receivedAt: d(s.receivedAt),
        };
      })
    );
    const sampleData = await db
      .select({
        id: samples.id,
        sampleCode: samples.sampleCode,
        contractNumber: samples.contractNumber,
        contractName: samples.contractName,
        contractorName: samples.contractorName,
        sampleType: samples.sampleType,
        location: samples.location,
        castingDate: samples.castingDate,
      })
      .from(samples)
      .where(inArray(samples.sampleCode, sampleRows.map((s) => s.sampleCode)));
    const sampleByCode = new Map(sampleData.map((s) => [s.sampleCode, s]));

    console.log("Seeding lab orders...");
    const orderDefs: Array<{
      orderCode: string;
      sampleCode: string;
      status: OrderStatus;
      priority: Priority;
      notes: string;
      primaryCode: string;
      extraCodes: string[];
    }> = [
      { orderCode: "ORD-2026-0001", sampleCode: "LAB-2026-0001", status: "pending", priority: "normal", notes: "Awaiting technician assignment", primaryCode: "CONC_CUBE", extraCodes: ["CONC_CORE", "CONC_BLOCK"] },
      { orderCode: "ORD-2026-0002", sampleCode: "LAB-2026-0002", status: "pending", priority: "high", notes: "Urgent foundation checks", primaryCode: "SOIL_PROCTOR", extraCodes: ["SOIL_SIEVE"] },
      { orderCode: "ORD-2026-0003", sampleCode: "LAB-2026-0003", status: "pending", priority: "urgent", notes: "Critical rebar acceptance", primaryCode: "STEEL_REBAR", extraCodes: ["STEEL_BEND"] },
      { orderCode: "ORD-2026-0004", sampleCode: "LAB-2026-0004", status: "distributed", priority: "normal", notes: "Distributed to asphalt technician", primaryCode: "ASPH_MARSHALL", extraCodes: ["ASPH_CORE"] },
      { orderCode: "ORD-2026-0005", sampleCode: "LAB-2026-0005", status: "distributed", priority: "high", notes: "Distributed - aggregates quality", primaryCode: "AGG_SIEVE", extraCodes: ["AGG_CRUSHING"] },
      { orderCode: "ORD-2026-0006", sampleCode: "LAB-2026-0006", status: "distributed", priority: "normal", notes: "Distributed concrete checks", primaryCode: "CONC_CORE", extraCodes: ["CONC_CUBE"] },
      { orderCode: "ORD-2026-0007", sampleCode: "LAB-2026-0007", status: "distributed", priority: "urgent", notes: "Fast-track soil verification", primaryCode: "SOIL_SIEVE", extraCodes: ["SOIL_PROCTOR"] },
      { orderCode: "ORD-2026-0008", sampleCode: "LAB-2026-0008", status: "in_progress", priority: "high", notes: "Technician started steel tests", primaryCode: "STEEL_REBAR", extraCodes: ["STEEL_BEND"] },
      { orderCode: "ORD-2026-0009", sampleCode: "LAB-2026-0001", status: "in_progress", priority: "normal", notes: "Concrete supplementary tests started", primaryCode: "CONC_BLOCK", extraCodes: ["CONC_CUBE"] },
      { orderCode: "ORD-2026-0010", sampleCode: "LAB-2026-0002", status: "in_progress", priority: "high", notes: "Proctor in progress", primaryCode: "SOIL_PROCTOR", extraCodes: ["SOIL_SIEVE"] },
      { orderCode: "ORD-2026-0011", sampleCode: "LAB-2026-0003", status: "completed", priority: "normal", notes: "Steel order completed", primaryCode: "STEEL_REBAR", extraCodes: ["STEEL_BEND"] },
      { orderCode: "ORD-2026-0012", sampleCode: "LAB-2026-0004", status: "completed", priority: "urgent", notes: "Asphalt order completed", primaryCode: "ASPH_MARSHALL", extraCodes: ["ASPH_CORE"] },
    ];

    await db.insert(labOrders).values(
      orderDefs.map((o, idx) => {
        const sample = sampleByCode.get(o.sampleCode)!;
        const distributedAt = o.status === "distributed" || o.status === "in_progress" || o.status === "completed"
          ? d(`2026-04-${String(10 + idx).padStart(2, "0")}`)
          : null;
        return {
          orderCode: o.orderCode,
          sampleId: sample.id,
          contractNumber: sample.contractNumber,
          contractName: sample.contractName,
          contractorName: sample.contractorName,
          sampleType: sample.sampleType,
          location: sample.location,
          castingDate: sample.castingDate,
          notes: o.notes,
          createdById: reception.id,
          distributedById: distributedAt ? supervisor.id : null,
          distributedAt,
          assignedTechnicianId: distributedAt ? technician.id : null,
          priority: o.priority,
          status: o.status,
          completedAt: o.status === "completed" ? addDays(distributedAt!, 3) : null,
          createdAt: d(`2026-04-${String(2 + idx).padStart(2, "0")}`),
        };
      })
    );
    const orderData = await db
      .select({
        id: labOrders.id,
        orderCode: labOrders.orderCode,
        sampleId: labOrders.sampleId,
        status: labOrders.status,
        createdAt: labOrders.createdAt,
      })
      .from(labOrders)
      .where(inArray(labOrders.orderCode, orderDefs.map((o) => o.orderCode)));
    const orderByCode = new Map(orderData.map((o) => [o.orderCode, o]));

    console.log("Seeding lab order items...");
    const itemValues: Array<typeof labOrderItems.$inferInsert> = [];
    for (const o of orderDefs) {
      const order = orderByCode.get(o.orderCode)!;
      const codes = [o.primaryCode, ...o.extraCodes];
      const status = itemStatusForOrder(o.status);
      for (let i = 0; i < codes.length; i++) {
        const t = typeByCode.get(codes[i])!;
        itemValues.push({
          orderId: order.id,
          testTypeId: t.id,
          testTypeCode: t.code ?? "",
          testTypeName: t.nameEn,
          formTemplate: t.formTemplate,
          quantity: Math.min(5, 1 + ((order.id + i) % 4)),
          unitPrice: t.unitPrice ?? "0",
          status,
        });
      }
    }
    await db.insert(labOrderItems).values(itemValues);

    console.log("Seeding distributions (6 records)...");
    const distributionOrderCodes = [
      "ORD-2026-0004",
      "ORD-2026-0005",
      "ORD-2026-0006",
      "ORD-2026-0008",
      "ORD-2026-0009",
      "ORD-2026-0010",
    ];
    const createdDistributionCodes: string[] = [];
    for (let i = 0; i < distributionOrderCodes.length; i++) {
      const orderCode = distributionOrderCodes[i];
      const order = orderByCode.get(orderCode)!;
      const orderDef = orderDefs.find((o) => o.orderCode === orderCode)!;
      const t = typeByCode.get(orderDef.primaryCode)!;
      const distCode = `DIST-2026-${String(i + 1).padStart(3, "0")}`;
      const distCreatedAt = d(`2026-04-${String(12 + i).padStart(2, "0")}`);
      await db.insert(distributions).values({
        distributionCode: distCode,
        sampleId: order.sampleId,
        assignedTechnicianId: technician.id,
        assignedById: supervisor.id,
        testType: t.code ?? "UNKNOWN",
        testName: t.nameEn,
        testSubType: null,
        quantity: 1,
        unitPrice: t.unitPrice ?? "0",
        totalCost: t.unitPrice ?? "0",
        priority: orderDef.priority,
        expectedCompletionDate: addDays(distCreatedAt, 7 + (i % 8)),
        notes: `Demo distribution for ${orderCode}`,
        status: orderDef.status === "in_progress" ? "in_progress" : "pending",
        createdAt: distCreatedAt,
      });
      createdDistributionCodes.push(distCode);
    }

    const distRows = await db
      .select({
        id: distributions.id,
        distributionCode: distributions.distributionCode,
        sampleId: distributions.sampleId,
        assignedTechnicianId: distributions.assignedTechnicianId,
      })
      .from(distributions)
      .where(inArray(distributions.distributionCode, createdDistributionCodes));
    const distByCode = new Map(distRows.map((d0) => [d0.distributionCode, d0]));

    // Link each seeded distribution to first item of corresponding order.
    for (let i = 0; i < distributionOrderCodes.length; i++) {
      const orderCode = distributionOrderCodes[i];
      const order = orderByCode.get(orderCode)!;
      const dist = distByCode.get(`DIST-2026-${String(i + 1).padStart(3, "0")}`)!;
      const firstItem = (
        await db
          .select({ id: labOrderItems.id })
          .from(labOrderItems)
          .where(eq(labOrderItems.orderId, order.id))
          .limit(1)
      )[0];
      if (firstItem) {
        await db
          .update(labOrderItems)
          .set({ distributionId: dist.id, updatedAt: new Date() })
          .where(eq(labOrderItems.id, firstItem.id));
      }
    }

    console.log("Seeding specialized test results...");
    const concreteDist = distByCode.get("DIST-2026-005") ?? distByCode.get("DIST-2026-003");
    const steelDist = distByCode.get("DIST-2026-004");
    const soilDist = distByCode.get("DIST-2026-006");
    if (!concreteDist || !steelDist || !soilDist) {
      throw new Error("Expected distributions for specialized results were not created.");
    }

    await db.insert(specializedTestResults).values([
      {
        distributionId: concreteDist.id,
        sampleId: concreteDist.sampleId,
        technicianId: concreteDist.assignedTechnicianId,
        testTypeCode: "CONC_BLOCK",
        formTemplate: "concrete_blocks",
        contractNo: "DOI-2025-T001",
        projectName: "Demo Concrete Blocks Validation",
        contractorName: "United Construction Co.",
        testedBy: technician.name ?? "Technician",
        testDate: d("2026-04-20"),
        formData: {
          manufacturer: "Demo Block Factory",
          mtsReference: "MTS-CB-2026-014",
          blockType: "Solid Block",
          requiredStrengthMpa: 10,
          blocks: [
            { blockNo: 1, loadKN: 410, strengthMpa: 12.8, correctedStrengthMpa: 12.8 },
            { blockNo: 2, loadKN: 438, strengthMpa: 13.7, correctedStrengthMpa: 13.7 },
            { blockNo: 3, loadKN: 472, strengthMpa: 14.8, correctedStrengthMpa: 14.8 },
          ],
        },
        overallResult: "pass",
        summaryValues: { avgStrengthMpa: 13.8, requiredStrengthMpa: 10 },
        status: "submitted",
        submittedAt: d("2026-04-20"),
        notes: "All masonry block samples passed required criteria.",
      },
      {
        distributionId: steelDist.id,
        sampleId: steelDist.sampleId,
        technicianId: steelDist.assignedTechnicianId,
        testTypeCode: "STEEL_REBAR",
        formTemplate: "steel_rebar",
        contractNo: "GB-2025-002",
        projectName: "Rebar Acceptance Test",
        contractorName: "Al Noor Contracting",
        testedBy: technician.name ?? "Technician",
        testDate: d("2026-04-21"),
        formData: {
          diameterMm: 16,
          yieldStrengthMpa: 520,
          ultimateStrengthMpa: 640,
          elongationPercent: 16.2,
          fractureType: "Ductile",
        },
        overallResult: "pass",
        summaryValues: { yieldStrengthMpa: 520, ultimateStrengthMpa: 640 },
        status: "submitted",
        submittedAt: d("2026-04-21"),
        notes: "Steel rebar met tensile and ductility requirements.",
      },
      {
        distributionId: soilDist.id,
        sampleId: soilDist.sampleId,
        technicianId: soilDist.assignedTechnicianId,
        testTypeCode: "SOIL_PROCTOR",
        formTemplate: "soil_proctor",
        contractNo: "GB-2025-001",
        projectName: "Foundation Compaction Assessment",
        contractorName: "Gulf Builders Est.",
        testedBy: technician.name ?? "Technician",
        testDate: d("2026-04-22"),
        formData: {
          maxDryDensity: 1.82,
          optimumMoistureContent: 12.9,
          fieldDensity: 1.62,
          compactionPercent: 89,
        },
        overallResult: "fail",
        summaryValues: { compactionPercent: 89, minimumRequiredPercent: 95 },
        status: "submitted",
        submittedAt: d("2026-04-22"),
        notes: "Compaction below project minimum requirement.",
      },
    ]);

    console.log("Seeding clearance request...");
    const contract1 = contractByNumber.get("DOI-2025-T001")!;
    await db.insert(clearanceRequests).values({
      requestCode: "CLR-2026-001",
      contractId: contract1.id,
      contractorId: contract1.contractorId,
      contractNumber: contract1.contractNumber,
      contractName: contract1.contractName,
      contractorName: "United Construction Co.",
      requestedById: supervisor.id,
      totalTests: 24,
      passedTests: 20,
      failedTests: 2,
      pendingTests: 2,
      totalAmount: "15750",
      paymentOrderNumber: "PO-2026-0001",
      paymentOrderDate: d("2026-04-24"),
      status: "payment_ordered",
      notes: "Demo clearance request for end-to-end workflow testing.",
    });

    console.log("Seeding notifications...");
    const sample1 = sampleByCode.get("LAB-2026-0001")!;
    const sample2 = sampleByCode.get("LAB-2026-0002")!;
    const sample3 = sampleByCode.get("LAB-2026-0003")!;
    await db.insert(notifications).values([
      {
        userId: technician.id,
        sampleId: sample1.id,
        title: "New sample assigned: LAB-2026-0001",
        message: "New sample assigned: LAB-2026-0001",
        type: "action_required",
        notificationType: "new_assignment",
      },
      {
        userId: technician.id,
        sampleId: sample1.id,
        title: "SLA approaching: DIST-2026-001 due tomorrow",
        message: "SLA approaching: DIST-2026-001 due tomorrow",
        type: "action_required",
        notificationType: "sla_warning",
      },
      {
        userId: supervisor.id,
        sampleId: sample3.id,
        title: "Results submitted for review: LAB-2026-0003",
        message: "Results submitted for review: LAB-2026-0003",
        type: "info",
        notificationType: "result_submitted",
      },
      {
        userId: supervisor.id,
        sampleId: sample2.id,
        title: "Sample approved by QC: LAB-2026-0002",
        message: "Sample approved by QC: LAB-2026-0002",
        type: "approved",
        notificationType: "qc_approved",
      },
      {
        userId: supervisor.id,
        sampleId: null,
        title: "New clearance request: CLR-2026-001",
        message: "New clearance request: CLR-2026-001",
        type: "action_required",
        notificationType: "clearance_request",
      },
    ]);

    console.log(
      `Demo data seeded successfully: ${contractorRows.length} contractors, ${contractRows.length} contracts, ${orderDefs.length} orders, ${sampleRows.length} samples`
    );
  } catch (error) {
    console.error("Failed to seed demo data:", error);
    process.exit(1);
  }
}

function isConnRefused(e: unknown): boolean {
  const err = e as { cause?: { code?: string; message?: string }; code?: string; message?: string };
  return (
    err?.cause?.code === "ECONNREFUSED" ||
    (typeof err?.cause?.message === "string" && err.cause.message.includes("ECONNREFUSED")) ||
    err?.code === "ECONNREFUSED" ||
    (typeof err?.message === "string" && err.message.includes("ECONNREFUSED"))
  );
}

main().catch((e) => {
  if (isConnRefused(e)) {
    console.error(`
[seed:demo] Cannot connect to MySQL (ECONNREFUSED).

Fix:
  1. Start MySQL — from the lab-management-system folder run:
       docker compose up -d
     (or start your local MySQL service.)
  2. Ensure .env in lab-management-system has DATABASE_URL, e.g.:
       DATABASE_URL=mysql://root:labroot123@localhost:3306/lab_management
  3. Run:
       pnpm run seed:demo
`);
  } else {
    console.error(e);
  }
  process.exit(1);
});
