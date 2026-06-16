import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { getOfficialTestCatalog } from "@/lib/officialTestCatalog";
import type { CatalogTest } from "@/lib/testCatalogCategories";

export function useMergedTestCatalog() {
  const { data: dbTestTypes = [], isLoading, isError } = trpc.testTypes.list.useQuery();

  const tests: CatalogTest[] = useMemo(() => {
    const dbByCode = new Map(dbTestTypes.map((t) => [t.code ?? "", t]));
    return getOfficialTestCatalog().map((test) => {
      const db = dbByCode.get(test.code);
      return {
        id: db?.id ?? 0,
        code: test.code,
        nameEn: test.nameEn,
        nameAr: test.nameAr,
        category: test.category,
        unitPrice: db?.unitPrice ?? test.unitPrice,
        unit: test.unit,
        standardRef: test.standardRef ?? "",
      };
    });
  }, [dbTestTypes]);

  return { tests, isLoading, isError };
}
