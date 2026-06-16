import { useMemo } from "react";
import { Search, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TEST_CATALOG_CATEGORIES,
  filterCatalogTests,
  groupCatalogTests,
  type CatalogTest,
} from "@/lib/testCatalogCategories";

type TestCatalogViewProps = {
  tests: CatalogTest[];
  lang: "ar" | "en";
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  /** Admin inline price editing */
  isAdmin?: boolean;
  editingPrice?: { testId: number; value: string } | null;
  onStartEditPrice?: (test: CatalogTest) => void;
  onCancelEditPrice?: () => void;
  onSavePrice?: (testId: number, value: string) => void;
  onPriceInputChange?: (testId: number, value: string) => void;
  isSavingPrice?: boolean;
};

function formatPrice(value: string | number | null | undefined): string {
  return Number(value ?? 0).toFixed(2);
}

function PriceCell({
  test,
  lang,
  isAdmin,
  editingPrice,
  onStartEditPrice,
  onCancelEditPrice,
  onSavePrice,
  onPriceInputChange,
  isSavingPrice,
}: {
  test: CatalogTest;
  lang: "ar" | "en";
} & Pick<
  TestCatalogViewProps,
  | "isAdmin"
  | "editingPrice"
  | "onStartEditPrice"
  | "onCancelEditPrice"
  | "onSavePrice"
  | "onPriceInputChange"
  | "isSavingPrice"
>) {
  const isEditing = editingPrice?.testId === test.id;

  if (!isAdmin) {
    return (
      <span className="font-mono font-semibold text-sm tabular-nums whitespace-nowrap">
        {formatPrice(test.unitPrice)} <span className="text-xs font-normal text-muted-foreground">AED</span>
      </span>
    );
  }

  if (isEditing && editingPrice) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={editingPrice.value}
          onChange={(e) => onPriceInputChange?.(test.id, e.target.value)}
          className="w-24 h-8 text-right font-mono text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSavePrice?.(test.id, editingPrice.value);
            if (e.key === "Escape") onCancelEditPrice?.();
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-8 w-8 p-0 shrink-0"
          onClick={() => onSavePrice?.(test.id, editingPrice.value)}
          disabled={isSavingPrice}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={onCancelEditPrice}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span className="font-mono font-semibold text-sm tabular-nums whitespace-nowrap">
        {formatPrice(test.unitPrice)} <span className="text-xs font-normal text-muted-foreground">AED</span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={() => onStartEditPrice?.(test)}
        title={lang === "ar" ? "تعديل السعر" : "Edit price"}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function TestCatalogView({
  tests,
  lang,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  isAdmin,
  editingPrice,
  onStartEditPrice,
  onCancelEditPrice,
  onSavePrice,
  onPriceInputChange,
  isSavingPrice,
}: TestCatalogViewProps) {
  const filteredTests = useMemo(
    () => filterCatalogTests(tests, searchQuery, categoryFilter),
    [tests, searchQuery, categoryFilter]
  );

  const groupedTests = useMemo(() => groupCatalogTests(filteredTests), [filteredTests]);

  const categoryPills = useMemo(
    () => [
      {
        key: "all",
        label: lang === "ar" ? "الكل" : "All",
        count: filterCatalogTests(tests, searchQuery, "all").length,
      },
      ...TEST_CATALOG_CATEGORIES.map((cat) => ({
        key: cat.key,
        label: lang === "ar" ? cat.nameAr : cat.nameEn,
        count: filterCatalogTests(tests, searchQuery, cat.key).length,
      })),
    ],
    [tests, searchQuery, lang]
  );

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={lang === "ar" ? "بحث بالاسم أو الرمز…" : "Search by name or code…"}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="ps-9 h-10 rounded-lg"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {categoryPills.map((pill) => {
          const active = categoryFilter === pill.key;
          const catMeta = TEST_CATALOG_CATEGORIES.find((c) => c.key === pill.key);
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => onCategoryFilterChange(pill.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
                active
                  ? catMeta
                    ? cn(catMeta.bgColor, catMeta.textColor, catMeta.borderColor, "shadow-sm")
                    : "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {pill.label}
              <Badge variant={active ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px] font-mono">
                {pill.count}
              </Badge>
            </button>
          );
        })}
      </div>

      {groupedTests.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground text-sm">
          {lang === "ar" ? "لا توجد اختبارات تطابق البحث" : "No tests match your search"}
        </div>
      ) : (
        <div
          className={cn(
            "rounded-xl border bg-card shadow-sm overflow-hidden divide-y",
            categoryFilter === "all" && "max-h-[min(560px,calc(100vh-18rem))] overflow-y-auto"
          )}
        >
          {groupedTests.map((category) => {
            const Icon = category.icon;

            return (
              <section key={category.key}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 border-b",
                    category.bgColor
                  )}
                >
                  <div className={cn("p-2 rounded-lg bg-white/80 shadow-sm shrink-0", category.borderColor, "border")}>
                    <Icon className={cn("h-4 w-4", category.textColor)} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm">
                      {lang === "ar" ? `${category.nameAr} — ${category.nameEn}` : `${category.nameEn} Tests`}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {category.tests.length} {lang === "ar" ? "اختبار" : "tests"}
                    </p>
                  </div>
                </div>

                <ul className="divide-y divide-border/60">
                  {category.tests.map((test, idx) => (
                    <li
                      key={test.code}
                      className="group grid grid-cols-1 md:grid-cols-[2rem_1fr_auto] gap-3 md:gap-4 items-center px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <span className="hidden md:block text-xs text-muted-foreground font-mono tabular-nums">
                        {String(idx + 1).padStart(2, "0")}
                      </span>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-sm leading-snug">{test.nameEn}</p>
                          <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">
                            {test.code}
                          </code>
                        </div>
                        {test.nameAr && (
                          <p className="text-xs text-muted-foreground leading-snug" dir="rtl">
                            {test.nameAr}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {test.standardRef && (
                            <span>
                              {lang === "ar" ? "المعيار:" : "Std:"} {test.standardRef}
                            </span>
                          )}
                          {test.unit && (
                            <span>
                              {lang === "ar" ? "الوحدة:" : "Unit:"} {test.unit}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="md:text-end ps-8 md:ps-0">
                        <PriceCell
                          test={test}
                          lang={lang}
                          isAdmin={isAdmin}
                          editingPrice={editingPrice}
                          onStartEditPrice={onStartEditPrice}
                          onCancelEditPrice={onCancelEditPrice}
                          onSavePrice={onSavePrice}
                          onPriceInputChange={onPriceInputChange}
                          isSavingPrice={isSavingPrice}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
