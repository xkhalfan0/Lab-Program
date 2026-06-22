import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LAB_SECTORS,
  SAMPLE_TYPE_FILTER_VALUES,
  sampleTypeFilterLabel,
  sectorFilterLabel,
} from "@/lib/listFilters";

export type FilterSelectOption = {
  value: string;
  label: string;
};

type ListFilterBarProps = {
  lang: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  sector?: string;
  onSectorChange?: (value: string) => void;
  sampleType?: string;
  onSampleTypeChange?: (value: string) => void;
  selectFilters?: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    options: FilterSelectOption[];
  }[];
  onClear?: () => void;
  showClear?: boolean;
  resultCount?: number;
  children?: ReactNode;
};

export function ListFilterBar({
  lang,
  search,
  onSearchChange,
  searchPlaceholder,
  sector,
  onSectorChange,
  sampleType,
  onSampleTypeChange,
  selectFilters = [],
  onClear,
  showClear = false,
  resultCount,
  children,
}: ListFilterBarProps) {
  const isAr = lang === "ar";

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="relative md:col-span-2 xl:col-span-2">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            className="ps-9 pe-9"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {onSectorChange && (
          <Select value={sector ?? "all"} onValueChange={onSectorChange}>
            <SelectTrigger>
              <SelectValue placeholder={isAr ? "القطاع" : "Sector"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "جميع القطاعات" : "All sectors"}</SelectItem>
              {LAB_SECTORS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {sectorFilterLabel(item.value, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {onSampleTypeChange && (
          <Select value={sampleType ?? "all"} onValueChange={onSampleTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder={isAr ? "نوع العينة" : "Sample type"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "جميع الأنواع" : "All types"}</SelectItem>
              {SAMPLE_TYPE_FILTER_VALUES.map((type) => (
                <SelectItem key={type} value={type}>
                  {sampleTypeFilterLabel(type, lang)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectFilters.map((filter) => (
          <Select key={filter.id} value={filter.value} onValueChange={filter.onChange}>
            <SelectTrigger>
              <SelectValue placeholder={filter.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {showClear && onClear && (sector !== "all" || (sampleType && sampleType !== "all") || selectFilters.some(f => f.value !== (f.options[0]?.value ?? "all"))) && (
          <Button variant="outline" size="sm" onClick={onClear} className="gap-1.5 h-10">
            <X className="w-4 h-4" />
            {isAr ? "مسح الفلاتر" : "Clear filters"}
          </Button>
        )}
      </div>

      {(resultCount != null || children) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          {resultCount != null && (
            <span>
              {isAr ? "النتائج:" : "Results:"}{" "}
              <span className="font-semibold text-foreground">{resultCount}</span>
            </span>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
