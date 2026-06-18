export const LAB_SECTORS = [
  { value: "sector_1", labelEn: "Sector 1", labelAr: "قطاع/1" },
  { value: "sector_2", labelEn: "Sector 2", labelAr: "قطاع/2" },
  { value: "sector_3", labelEn: "Sector 3", labelAr: "قطاع/3" },
  { value: "sector_4", labelEn: "Sector 4", labelAr: "قطاع/4" },
  { value: "sector_5", labelEn: "Sector 5", labelAr: "قطاع/5" },
] as const;

export const SAMPLE_TYPE_FILTER_VALUES = [
  "concrete",
  "soil",
  "steel",
  "asphalt",
  "aggregates",
  "metal",
  "water",
] as const;

const SAMPLE_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  concrete: { en: "Concrete", ar: "خرسانة" },
  soil: { en: "Soil", ar: "تربة" },
  steel: { en: "Steel", ar: "حديد" },
  asphalt: { en: "Asphalt", ar: "أسفلت" },
  aggregates: { en: "Aggregates", ar: "ركام" },
  metal: { en: "Metal", ar: "معادن" },
  water: { en: "Water", ar: "مياه" },
};

export function sectorFilterLabel(value: string | null | undefined, lang: string): string {
  if (!value) return "—";
  const sector = LAB_SECTORS.find((s) => s.value === value);
  if (!sector) return value;
  return lang === "ar" ? sector.labelAr : sector.labelEn;
}

export function sampleTypeFilterLabel(type: string, lang: string): string {
  const entry = SAMPLE_TYPE_LABELS[type];
  if (!entry) return type;
  return lang === "ar" ? entry.ar : entry.en;
}

export function matchesListSearch(
  query: string | undefined,
  fields: (string | number | null | undefined)[],
): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => String(field ?? "").toLowerCase().includes(q));
}

export function matchesSectorFilter(sector: string | undefined, itemSector: string | null | undefined): boolean {
  if (!sector || sector === "all") return true;
  return itemSector === sector;
}

export function matchesSampleTypeFilter(
  sampleType: string | undefined,
  itemType: string | null | undefined,
): boolean {
  if (!sampleType || sampleType === "all") return true;
  return itemType === sampleType;
}

export type ListFilters = {
  search?: string;
  sector?: string;
  sampleType?: string;
  technicianId?: string;
};

export function applySampleFilters<
  T extends {
    sampleCode?: string | null;
    contractorName?: string | null;
    contractNumber?: string | null;
    contractName?: string | null;
    sector?: string | null;
    sampleType?: string | null;
  },
>(items: T[], filters: ListFilters): T[] {
  return items.filter((item) => {
    if (!matchesSectorFilter(filters.sector, item.sector)) return false;
    if (!matchesSampleTypeFilter(filters.sampleType, item.sampleType)) return false;
    return matchesListSearch(filters.search, [
      item.sampleCode,
      item.contractorName,
      item.contractNumber,
      item.contractName,
    ]);
  });
}

export function applyOrderFilters<
  T extends {
    orderCode?: string | null;
    contractorName?: string | null;
    contractNumber?: string | null;
    sampleCode?: string | null;
    sampleType?: string | null;
    assignedTechnicianId?: number | null;
    assignedTechnicianName?: string | null;
  },
>(items: T[], filters: ListFilters): T[] {
  return items.filter((item) => {
    if (filters.technicianId && filters.technicianId !== "all") {
      if (String(item.assignedTechnicianId ?? "") !== filters.technicianId) return false;
    }
    if (!matchesSampleTypeFilter(filters.sampleType, item.sampleType)) return false;
    return matchesListSearch(filters.search, [
      item.orderCode,
      item.contractorName,
      item.contractNumber,
      item.sampleCode,
      item.assignedTechnicianName,
    ]);
  });
}

export function applyClearanceFilters<
  T extends {
    requestCode?: string | null;
    contractorName?: string | null;
    contractNumber?: string | null;
    contractName?: string | null;
  },
>(items: T[], filters: Pick<ListFilters, "search">): T[] {
  return items.filter((item) =>
    matchesListSearch(filters.search, [
      item.requestCode,
      item.contractorName,
      item.contractNumber,
      item.contractName,
    ]),
  );
}

export function hasActiveListFilters(filters: ListFilters): boolean {
  return Boolean(
    filters.search?.trim() ||
      (filters.sector && filters.sector !== "all") ||
      (filters.sampleType && filters.sampleType !== "all") ||
      (filters.technicianId && filters.technicianId !== "all"),
  );
}
