/** Shared Recharts settings for lab gradation curves (% passing vs sieve). */

export const GRADATION_CHART_HEIGHT = 500;

export const GRADATION_CHART_MARGIN = {
  top: 25,
  right: 40,
  left: 20,
  bottom: 80,
} as const;

export const GRADATION_TOOLTIP_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  border: "2px solid #cbd5e1",
  borderRadius: "8px",
  padding: "8px 12px",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  fontSize: "12px",
} as const;

export const GRADATION_TOOLTIP_LABEL_STYLE = {
  fontWeight: 700,
  color: "#1e293b",
  marginBottom: "4px",
} as const;

export const GRADATION_AXIS_LABEL_STYLE = {
  fontSize: 13,
  fontWeight: 700,
  fill: "#1e293b",
  letterSpacing: "0.5px",
} as const;

export function gradationTooltipFormatter(
  labelMap: Record<string, string>,
): (value: number, name: string) => [string, string] {
  return (value: number, name: string) => [
    `${Number(value).toFixed(1)}%`,
    labelMap[name] ?? name,
  ];
}

export function gradationXAxisProps(
  ar: boolean,
  dataKey: string,
  options?: { logScale?: boolean; tickFormatter?: (v: number) => string },
) {
  const base = {
    dataKey,
    tick: { fontSize: 11, fill: "#475569", fontWeight: 500 },
    axisLine: { stroke: "#cbd5e1", strokeWidth: 2 },
    tickLine: { stroke: "#cbd5e1" },
  };
  if (options?.logScale) {
    return {
      ...base,
      type: "number" as const,
      scale: "log" as const,
      domain: [0.05, 10] as [number, number],
      tickFormatter: options.tickFormatter ?? ((v: number) => String(v)),
      label: {
        value: ar ? "مقاس المنخل (مم)" : "Sieve Size (mm)",
        position: "insideBottom" as const,
        offset: -22,
        style: { fontSize: 11, fontWeight: 600, fill: "#1e293b" },
      },
    };
  }
  return {
    ...base,
    angle: -45,
    textAnchor: "end" as const,
    height: 80,
    interval: 0,
    label: {
      value: ar ? "المناخل (mm)" : "SIEVES (mm)",
      position: "insideBottom" as const,
      offset: -50,
      style: GRADATION_AXIS_LABEL_STYLE,
    },
  };
}

export function gradationYAxisProps(ar?: boolean) {
  return {
    domain: [0, 100] as [number, number],
    ticks: [0, 25, 50, 75, 100],
    tick: { fontSize: 11, fill: "#475569", fontWeight: 500 },
    axisLine: { stroke: "#cbd5e1", strokeWidth: 2 },
    tickLine: { stroke: "#cbd5e1" },
    width: ar ? 52 : undefined,
    label: {
      value: ar === false ? "% Passing" : "% Passing",
      angle: -90,
      position: "insideLeft" as const,
      offset: 0,
      style: GRADATION_AXIS_LABEL_STYLE,
    },
  };
}
