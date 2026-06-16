import type { LucideIcon } from "lucide-react";
import { Building2, Wrench, Mountain, Truck, Box } from "lucide-react";

export type CatalogTest = {
  id: number;
  code: string;
  nameEn: string;
  nameAr: string;
  category: string;
  unitPrice: string | number | null;
  unit: string;
  standardRef: string;
};

export function dbCategoryFromConfigKey(key: string): string {
  return key === "aggregate" ? "aggregates" : key;
}

export const TEST_CATALOG_CATEGORIES: Array<{
  key: string;
  icon: LucideIcon;
  nameEn: string;
  nameAr: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}> = [
  {
    key: "concrete",
    icon: Building2,
    nameEn: "Concrete",
    nameAr: "خرسانة",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
  },
  {
    key: "steel",
    icon: Wrench,
    nameEn: "Steel",
    nameAr: "حديد",
    bgColor: "bg-slate-50",
    textColor: "text-slate-700",
    borderColor: "border-slate-200",
  },
  {
    key: "soil",
    icon: Mountain,
    nameEn: "Soil",
    nameAr: "تربة",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
  },
  {
    key: "asphalt",
    icon: Truck,
    nameEn: "Asphalt",
    nameAr: "أسفلت",
    bgColor: "bg-zinc-50",
    textColor: "text-zinc-700",
    borderColor: "border-zinc-200",
  },
  {
    key: "aggregate",
    icon: Box,
    nameEn: "Aggregates",
    nameAr: "ركام",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
  },
];

export function filterCatalogTests(
  tests: CatalogTest[],
  searchQuery: string,
  categoryFilter: string
): CatalogTest[] {
  const q = searchQuery.trim().toLowerCase();
  return tests.filter((test) => {
    const matchesSearch =
      !q ||
      (test.nameEn?.toLowerCase().includes(q) ?? false) ||
      (test.nameAr?.includes(searchQuery.trim()) ?? false) ||
      (test.code?.toLowerCase().includes(q) ?? false);

    const cat = test.category?.toLowerCase() ?? "";
    const matchesCategory =
      categoryFilter === "all" ||
      (categoryFilter === "aggregate" ? cat === "aggregates" : cat === categoryFilter.toLowerCase());

    return matchesSearch && matchesCategory;
  });
}

export function groupCatalogTests(tests: CatalogTest[]) {
  return TEST_CATALOG_CATEGORIES.map((cat) => ({
    ...cat,
    tests: tests.filter(
      (t) => (t.category?.toLowerCase() ?? "") === dbCategoryFromConfigKey(cat.key).toLowerCase()
    ),
  })).filter((cat) => cat.tests.length > 0);
}

export function openTestCatalogPrint(category?: string) {
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  params.set("autoprint", "1");
  const qs = params.toString();
  window.open(`/print/test-catalog${qs ? `?${qs}` : ""}`, "_blank");
}
