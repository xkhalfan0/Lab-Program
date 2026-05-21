/**
 * Custom legend for gradation / sieve analysis charts (above chart, no cramped Recharts legend).
 */

export type GradationLegendLineStyle =
  | "primary"
  | "jmf-dashed"
  | "spec-dotted"
  | "line-solid"
  | "line-dashed"
  | "line-dotted";

export interface GradationLegendItemConfig {
  style: GradationLegendLineStyle;
  title: string;
  subtitle?: string;
  lineColor?: string;
}

function LegendLineSample({ style, lineColor }: { style: GradationLegendLineStyle; lineColor?: string }) {
  if (style === "primary") {
    return (
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-1 bg-green-500 rounded-full" />
        <div className="w-2 h-2 bg-green-500 rounded-full border-2 border-white shadow" />
      </div>
    );
  }
  const color =
    lineColor ??
    (style === "jmf-dashed" || style === "line-dashed"
      ? "#3b82f6"
      : style === "spec-dotted" || style === "line-dotted"
        ? "#dc2626"
        : "#475569");
  const borderClass =
    style === "spec-dotted" || style === "line-dotted" ? "border-dotted" : "border-dashed";
  const dashed = style === "jmf-dashed" || style === "line-dashed" || style === "line-dotted";
  return (
    <div
      className={`w-8 shrink-0 border-t-2 ${dashed ? borderClass : "border-solid"}`}
      style={{ borderColor: color }}
    />
  );
}

function titleColor(style: GradationLegendLineStyle): string {
  if (style === "primary") return "text-green-700";
  if (style === "jmf-dashed" || style === "line-dashed") return "text-blue-700";
  if (style === "spec-dotted" || style === "line-dotted") return "text-red-700";
  return "text-slate-700";
}

function subtitleColor(style: GradationLegendLineStyle): string {
  if (style === "primary") return "text-green-600";
  if (style === "jmf-dashed" || style === "line-dashed") return "text-blue-600";
  if (style === "spec-dotted" || style === "line-dotted") return "text-red-600";
  return "text-slate-600";
}

export function GradationChartLegend({ items }: { items: GradationLegendItemConfig[] }) {
  const colClass =
    items.length <= 3
      ? "grid-cols-1 md:grid-cols-3"
      : items.length === 4
        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
        : "grid-cols-1 md:grid-cols-3 lg:grid-cols-5";

  return (
    <div className="mb-6 p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200">
      <div className={`grid ${colClass} gap-4`}>
        {items.map((item, i) => (
          <div
            key={`${item.title}-${i}`}
            className="flex items-center gap-3 p-2 bg-white rounded-md shadow-sm"
          >
            <LegendLineSample style={item.style} lineColor={item.lineColor} />
            <div className="flex flex-col min-w-0">
              <span className={`text-xs font-bold truncate ${titleColor(item.style)}`}>
                {item.title}
              </span>
              {item.subtitle ? (
                <span className={`text-[10px] truncate ${subtitleColor(item.style)}`}>
                  {item.subtitle}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hot Bin: combined + JMF + spec limits */
export function hotBinGradationLegendItems(ar: boolean): GradationLegendItemConfig[] {
  return [
    {
      style: "primary",
      title: ar ? "الدرجة المجمعة" : "Combined",
      subtitle: ar ? "التدرج" : "Grading",
    },
    { style: "jmf-dashed", title: "JMF", subtitle: ar ? "الحد الأعلى" : "Upper" },
    { style: "jmf-dashed", title: "JMF", subtitle: ar ? "الحد الأدنى" : "Lower" },
    { style: "spec-dotted", title: ar ? "مواصفات" : "Spec", subtitle: ar ? "الحد الأعلى" : "Upper" },
    { style: "spec-dotted", title: ar ? "مواصفات" : "Spec", subtitle: ar ? "الحد الأدنى" : "Lower" },
  ];
}

/** Extracted sieve / simple passing vs spec */
export function extractedSieveLegendItems(ar: boolean): GradationLegendItemConfig[] {
  return [
    {
      style: "primary",
      title: ar ? "نسبة المرور" : "% Passing",
      subtitle: ar ? "الفعلي" : "Actual",
    },
    { style: "spec-dotted", title: ar ? "مواصفات" : "Spec", subtitle: ar ? "الحد الأعلى" : "Upper" },
    { style: "spec-dotted", title: ar ? "مواصفات" : "Spec", subtitle: ar ? "الحد الأدنى" : "Lower" },
  ];
}

/** Masonry sand blend — matches multi-line chart */
export function sandBlendGradationLegendItems(
  ar: boolean,
  keys: { blend: string; white: string; black: string; upper: string; lower: string },
): GradationLegendItemConfig[] {
  return [
    {
      style: "primary",
      title: keys.blend,
      subtitle: ar ? "الخليط" : "Blend",
    },
    {
      style: "line-solid",
      title: keys.white,
      subtitle: ar ? "رمل" : "Sand",
      lineColor: "#3b82f6",
    },
    {
      style: "line-solid",
      title: keys.black,
      subtitle: ar ? "رمل" : "Sand",
      lineColor: "#374151",
    },
    {
      style: "line-dashed",
      title: keys.upper,
      lineColor: "#888888",
    },
    {
      style: "line-dashed",
      title: keys.lower,
      lineColor: "#888888",
    },
  ];
}

/** Concrete mix gradation */
export function concreteMixGradationLegendItems(ar: boolean): GradationLegendItemConfig[] {
  return [
    {
      style: "primary",
      title: ar ? "نسبة المرور" : "% Passing",
      subtitle: ar ? "الفعلي" : "Actual",
    },
    { style: "spec-dotted", title: ar ? "الحد الأعلى" : "Spec Upper" },
    { style: "spec-dotted", title: ar ? "الحد الأدنى" : "Spec Lower" },
  ];
}
