import { eq } from "drizzle-orm";
import { testTypes } from "../../drizzle/schema";
import { OFFICIAL_TEST_CATALOG } from "../data/official-test-catalog";
import { FOAM_DENSITY_TEST_CODE, FOAM_STRENGTH_TEST_CODE } from "@shared/foamConcreteTests";

const FOAM_CODES = [FOAM_STRENGTH_TEST_CODE, FOAM_DENSITY_TEST_CODE] as const;

type SchemaDb = ReturnType<typeof import("../db").getDb> extends Promise<infer D> ? NonNullable<D> : never;

/** Idempotent — sync foamed concrete strength/density catalog rows (names + prices). */
export async function ensureFoamConcreteTestTypes(db: SchemaDb): Promise<void> {
  const rows = OFFICIAL_TEST_CATALOG.filter((t) => (FOAM_CODES as readonly string[]).includes(t.code));

  for (const row of rows) {
    const existing = await db
      .select({ id: testTypes.id })
      .from(testTypes)
      .where(eq(testTypes.code, row.code))
      .limit(1);

    if (existing[0]) {
      await db
        .update(testTypes)
        .set({
          category: row.category,
          nameEn: row.nameEn,
          nameAr: row.nameAr,
          unit: row.unit,
          unitPrice: row.unitPrice,
          standardRef: row.standardRef,
          formTemplate: row.formTemplate,
          sortOrder: row.sortOrder,
          isActive: row.isActive ?? true,
        })
        .where(eq(testTypes.id, existing[0].id));
      console.log(`[schema] Updated test_types.${row.code}`);
      continue;
    }

    await db.insert(testTypes).values({
      category: row.category,
      nameEn: row.nameEn,
      nameAr: row.nameAr,
      code: row.code,
      unitPrice: row.unitPrice,
      unit: row.unit,
      standardRef: row.standardRef,
      formTemplate: row.formTemplate,
      isActive: row.isActive ?? true,
      sortOrder: row.sortOrder,
    });
    console.log(`[schema] Inserted test_types.${row.code}`);
  }
}
