import type { ReactNode } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GradationChartLegend, type GradationLegendItemConfig } from "@/components/GradationChartLegend";
import {
  GRADATION_CHART_HEIGHT,
  GRADATION_CHART_MARGIN,
  GRADATION_TOOLTIP_LABEL_STYLE,
  GRADATION_TOOLTIP_STYLE,
  gradationTooltipFormatter,
  gradationXAxisProps,
  gradationYAxisProps,
} from "@/lib/gradationChartShared";

export interface GradationLineConfig {
  dataKey: string;
  variant: "primary" | "jmf" | "spec" | "custom";
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  connectNulls?: boolean;
  dot?: false | object;
}

const LINE_VARIANTS: Record<
  "primary" | "jmf" | "spec",
  { stroke: string; strokeWidth: number; strokeDasharray?: string; dot: false | object; activeDot?: object }
> = {
  primary: {
    stroke: "#22c55e",
    strokeWidth: 4,
    dot: { r: 6, fill: "#22c55e", strokeWidth: 3, stroke: "#fff" },
    activeDot: { r: 8, stroke: "#22c55e", strokeWidth: 3, fill: "#fff" },
  },
  jmf: {
    stroke: "#3b82f6",
    strokeWidth: 2.5,
    strokeDasharray: "8 4",
    dot: false,
  },
  spec: {
    stroke: "#dc2626",
    strokeWidth: 2.5,
    strokeDasharray: "2 3",
    dot: false,
  },
};

interface GradationCurveChartProps {
  title: string;
  data: Record<string, unknown>[];
  legendItems: GradationLegendItemConfig[];
  lines: GradationLineConfig[];
  xDataKey: string;
  ar?: boolean;
  tooltipLabels?: Record<string, string>;
  height?: number;
  footer?: ReactNode;
  xAxisOptions?: { logScale?: boolean };
  xTickFormatter?: (v: number) => string;
  show?: boolean;
  emptyContent?: ReactNode;
  children?: ReactNode;
}

export function GradationCurveChart({
  title,
  data,
  legendItems,
  lines,
  xDataKey,
  ar = false,
  tooltipLabels = {},
  height = GRADATION_CHART_HEIGHT,
  footer,
  xAxisOptions,
  xTickFormatter,
  show = true,
  emptyContent,
  children,
}: GradationCurveChartProps) {
  const formatter = gradationTooltipFormatter(tooltipLabels);
  const xOptions = xTickFormatter
    ? { ...xAxisOptions, tickFormatter: xTickFormatter }
    : xAxisOptions;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-800">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {show && data.length > 0 ? (
          <>
        <GradationChartLegend items={legendItems} />
        <div
          className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm w-full"
          style={{ height, minHeight: height }}
          dir="ltr"
        >
          <ResponsiveContainer width="100%" height="100%" minHeight={height}>
            <LineChart data={data} margin={GRADATION_CHART_MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeWidth={1} />
              <XAxis {...gradationXAxisProps(ar, xDataKey, xOptions)} />
              <YAxis {...gradationYAxisProps(ar)} />
              <Tooltip
                contentStyle={GRADATION_TOOLTIP_STYLE}
                labelStyle={GRADATION_TOOLTIP_LABEL_STYLE}
                formatter={formatter as (value: number, name: string) => [string, string]}
              />
              <Legend content={() => null} />
              {lines.map((line) => {
                const preset =
                  line.variant !== "custom" ? LINE_VARIANTS[line.variant] : null;
                return (
                  <Line
                    key={line.dataKey}
                    type="monotone"
                    dataKey={line.dataKey}
                    name={line.dataKey}
                    connectNulls={line.connectNulls ?? true}
                    isAnimationActive={false}
                    stroke={line.stroke ?? preset?.stroke ?? "#64748b"}
                    strokeWidth={line.strokeWidth ?? preset?.strokeWidth ?? 2}
                    strokeDasharray={line.strokeDasharray ?? preset?.strokeDasharray}
                    dot={line.dot ?? preset?.dot ?? false}
                    activeDot={preset?.activeDot ?? { r: 6 }}
                  />
                );
              })}
              {children}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {footer ? <div className="mt-4 text-xs text-center text-muted-foreground">{footer}</div> : null}
          </>
        ) : (
          emptyContent ?? null
        )}
      </CardContent>
    </Card>
  );
}
