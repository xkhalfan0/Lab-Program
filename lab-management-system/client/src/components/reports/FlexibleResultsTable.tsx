import type { CSSProperties, ReactNode } from "react";

/**
 * Generic print-friendly results table (black borders, border-collapse).
 *
 * @example Concrete cubes (column definitions — map your row objects to these `field` keys)
 * ```ts
 * const columns: Column[] = [
 *   { header: "Mark No.", field: "markNo", align: "center" },
 *   { header: "Cube ID", field: "cubeId", align: "center" },
 *   { header: "Date Tested", field: "dateTested", type: "date", align: "center" },
 *   { header: "Test Age (days)", field: "ageDays", align: "center" },
 *   { header: "Length (mm)", field: "lengthMm", type: "number", align: "right" },
 *   { header: "Compressive Strength (N/mm²)", field: "strengthMpa", type: "number", align: "right" },
 *   { header: "Result", field: "result", type: "status", align: "center" },
 * ];
 * ```
 *
 * @example Sieve analysis
 * ```ts
 * const columns: Column[] = [
 *   { header: "Sieve (mm)", field: "sieveSize", align: "center" },
 *   { header: "Mass retained (g)", field: "massRetained", type: "number", align: "right" },
 *   { header: "% Retained", field: "pctRetained", type: "number", align: "right" },
 *   { header: "% Passing", field: "pctPassing", type: "number", align: "right" },
 *   { header: "Within limits", field: "withinLimits", type: "status", align: "center" },
 * ];
 * ```
 *
 * @example Steel tensile
 * ```ts
 * const columns: Column[] = [
 *   { header: "Specimen", field: "specimenId", align: "center" },
 *   { header: "Dia. (mm)", field: "diameter", type: "number", align: "right" },
 *   { header: "Yield (MPa)", field: "yieldStrength", type: "number", align: "right" },
 *   { header: "UTS (MPa)", field: "uts", type: "number", align: "right" },
 *   { header: "Elong. (%)", field: "elongation", type: "number", align: "right" },
 *   { header: "Result", field: "overallResult", type: "status", align: "center" },
 * ];
 * ```
 *
 * @example Generic key–value (Property | Value)
 * ```ts
 * const columns = keyValueColumns("Property", "Value");
 * const rows = Object.entries(data).map(([k, v]) => ({
 *   property: k.replace(/_/g, " "),
 *   value: v == null ? "—" : String(v),
 * }));
 * <FlexibleResultsTable columns={columns} rows={rows} />
 * ```
 */
export type ColumnType = "text" | "number" | "status" | "date";

export interface Column {
  header: string;
  field: string;
  type?: ColumnType;
  /** Used when `type` is `"number"` (default 2). */
  decimals?: number;
  width?: string;
  align?: "left" | "center" | "right";
  render?: (value: unknown, row: Record<string, unknown>) => ReactNode;
}

export interface FlexibleResultsTableProps {
  columns: Column[];
  rows: Array<Record<string, unknown>>;
  summaryRows?: Array<Record<string, unknown>>;
  className?: string;
  /** Applied to `<table>` (e.g. `mb-3`). */
  tableClassName?: string;
  rowClassName?: (row: Record<string, unknown>, index: number) => string | undefined;
}

function getByField(obj: Record<string, unknown>, field: string): unknown {
  if (!field) return undefined;
  const parts = field.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function alignClass(align?: "left" | "center" | "right"): string {
  if (align === "right") return "text-right";
  if (align === "left") return "text-left";
  return "text-center";
}

function fmtNumber(val: unknown, decimals = 2): string {
  if (val === null || val === undefined || val === "") return "";
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (Number.isNaN(n)) return String(val);
  return n.toFixed(decimals);
}

function fmtDateCell(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  const d = val instanceof Date ? val : new Date(String(val));
  if (Number.isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function isPassLike(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return (
      s === "pass" ||
      s === "yes" ||
      s === "ok" ||
      s === "مطابق" ||
      s.includes("pass") ||
      v === "✓"
    );
  }
  return false;
}

function isFailLike(v: unknown): boolean {
  if (v === false) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return (
      s === "fail" ||
      s === "no" ||
      s === "راسب" ||
      s.includes("fail") ||
      v === "✗"
    );
  }
  return false;
}

function renderStatus(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") {
    return (
      <span className={value ? "text-emerald-800 font-semibold" : "text-red-800 font-semibold"}>
        {value ? "✓" : "✗"}
      </span>
    );
  }
  const s = String(value);
  if (isPassLike(value)) {
    return <span className="text-emerald-800 font-semibold">{s}</span>;
  }
  if (isFailLike(value)) {
    return <span className="text-red-800 font-semibold">{s}</span>;
  }
  return <span className="text-gray-900">{s}</span>;
}

function renderCell(col: Column, row: Record<string, unknown>): ReactNode {
  const raw = getByField(row, col.field);
  if (col.render) return col.render(raw, row);

  switch (col.type) {
    case "number": {
      const dec = col.decimals ?? 2;
      const txt = fmtNumber(raw, dec);
      return txt === "" ? "" : txt;
    }
    case "date":
      return fmtDateCell(raw);
    case "status":
      return renderStatus(raw);
    default:
      if (raw === null || raw === undefined) return "";
      if (typeof raw === "object") return JSON.stringify(raw);
      return String(raw);
  }
}

const cellBase = "border border-black px-1 py-1 text-xs align-middle";
const thBase = "border border-black px-1 py-1 text-xs font-semibold bg-gray-100 align-middle";

/** Inline borders so print preview / PDF keep grid lines even if print CSS order fails. */
const printSafeTable: CSSProperties = {
  borderSpacing: 0,
  borderCollapse: "collapse",
  border: "1px solid #000",
};
const printSafeCell: CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#000",
};
const printSafeTh: CSSProperties = {
  ...printSafeCell,
  backgroundColor: "#f3f4f6",
};

export function FlexibleResultsTable({
  columns,
  rows,
  summaryRows,
  className = "",
  tableClassName = "",
  rowClassName,
}: FlexibleResultsTableProps) {
  return (
    <table
      className={`lab-results-table w-full border-collapse text-black ${tableClassName} ${className}`.trim()}
      style={printSafeTable}
    >
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.field + col.header}
              className={`${thBase} ${alignClass(col.align)}`}
              style={col.width ? { ...printSafeTh, width: col.width } : printSafeTh}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className={rowClassName?.(row, ri) ?? ""}>
            {columns.map((col) => {
              const align = col.type === "number" || col.type === "status" ? col.align ?? "right" : col.align;
              const effectiveAlign =
                col.type === "number" ? "right" : col.type === "status" ? col.align ?? "center" : align;
              return (
                <td
                  key={col.field}
                  className={`${cellBase} ${alignClass(effectiveAlign)}`}
                  style={col.width ? { ...printSafeCell, width: col.width } : printSafeCell}
                >
                  {renderCell(col, row)}
                </td>
              );
            })}
          </tr>
        ))}
        {(summaryRows ?? []).map((row, si) => (
          <tr key={`sum-${si}`} className="bg-gray-50 font-semibold">
            {columns.map((col) => (
              <td key={col.field} className={`${cellBase} ${alignClass(col.align)}`} style={printSafeCell}>
                {renderCell(col, row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Two-column layout for unstructured / generic form data. */
export function keyValueColumns(propertyHeader: string, valueHeader: string): Column[] {
  return [
    { header: propertyHeader, field: "property", type: "text", align: "left" },
    { header: valueHeader, field: "value", type: "text", align: "left" },
  ];
}

export function formDataToKeyValueRows(
  fd: Record<string, unknown>,
  options?: { maxDepth?: number; skipKeys?: Set<string> }
): Array<{ property: string; value: string }> {
  const skip = options?.skipKeys ?? new Set();
  const out: Array<{ property: string; value: string }> = [];
  for (const [k, v] of Object.entries(fd ?? {})) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v)) continue;
    if (Array.isArray(v)) {
      out.push({ property: k.replace(/_/g, " "), value: v.length ? `[${v.length} items]` : "—" });
      continue;
    }
    out.push({ property: k.replace(/_/g, " "), value: String(v) });
  }
  return out;
}
