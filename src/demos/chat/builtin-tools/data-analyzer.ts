/**
 * Built-in data analyzer tool for CSV/JSON data
 *
 * Parses user-provided tabular data, detects column types,
 * computes basic statistics, and recommends suitable chart types.
 * No external dependencies — CSV parsing is done inline.
 */

import { z } from "zod";
import type { ToolSet } from "ai";
import { tool } from "ai";

// ============ Types ============

export interface ColumnStats {
  name: string;
  type: "numeric" | "date" | "categorical" | "text";
  nonEmptyCount: number;
  uniqueCount: number;
  /** Numeric columns only */
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  /** Categorical columns only */
  topValues?: Array<{ value: string; count: number }>;
}

export interface ChartRecommendation {
  chartType: string;
  engine: "adc";
  reason: string;
  spec: Record<string, unknown>;
}

export interface DataAnalysisResult {
  summary: {
    rows: number;
    columns: number;
    columnNames: string[];
  };
  columnStats: ColumnStats[];
  recommendations: ChartRecommendation[];
  preview: Record<string, string>[];
}

// ============ CSV Parser ============

/**
 * Parse a single CSV line, handling quoted fields that may contain commas.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse CSV text into headers and rows.
 */
function parseCSV(
  text: string
): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .trim()
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
  return { headers, rows };
}

// ============ JSON Parser ============

/**
 * Parse JSON data into a normalized form (array of objects).
 */
function parseJSONData(
  text: string
): { headers: string[]; rows: Record<string, string>[] } {
  const parsed: unknown = JSON.parse(text);
  let arr: Record<string, unknown>[];

  if (Array.isArray(parsed)) {
    arr = parsed.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  } else if (typeof parsed === "object" && parsed !== null) {
    // Attempt to find the first array property
    const obj = parsed as Record<string, unknown>;
    const arrayProp = Object.values(obj).find((v) => Array.isArray(v)) as
      | unknown[]
      | undefined;
    if (arrayProp) {
      arr = arrayProp.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null
      );
    } else {
      arr = [obj];
    }
  } else {
    throw new Error("JSON data must be an array of objects or an object.");
  }

  if (arr.length === 0) {
    return { headers: [], rows: [] };
  }

  // Collect all unique keys across all objects
  const headerSet = new Set<string>();
  for (const item of arr) {
    for (const key of Object.keys(item)) {
      headerSet.add(key);
    }
  }
  const headers = [...headerSet];

  const rows = arr.map((item) =>
    Object.fromEntries(
      headers.map((h) => [h, item[h] !== undefined && item[h] !== null ? String(item[h]) : ""])
    )
  );

  return { headers, rows };
}

// ============ Format Detection ============

/**
 * Auto-detect whether the input is CSV or JSON.
 */
function detectFormat(data: string): "csv" | "json" {
  const trimmed = data.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // not valid JSON, fall through to CSV
    }
  }
  return "csv";
}

// ============ Column Type Detection ============

/**
 * Detect the data type of a column based on its values.
 */
function detectColumnType(
  values: string[]
): "numeric" | "date" | "categorical" | "text" {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return "text";

  const numericCount = nonEmpty.filter((v) => !isNaN(Number(v))).length;
  if (numericCount / nonEmpty.length > 0.8) return "numeric";

  const dateCount = nonEmpty.filter((v) => {
    // Quick sanity: must have at least 4 chars and parse to a valid date
    if (v.length < 4) return false;
    const ts = Date.parse(v);
    return !isNaN(ts);
  }).length;
  if (dateCount / nonEmpty.length > 0.8) return "date";

  const uniqueRatio = new Set(nonEmpty).size / nonEmpty.length;
  if (uniqueRatio < 0.5) return "categorical";

  return "text";
}

// ============ Statistics ============

/**
 * Compute statistics for a single column.
 */
function computeColumnStats(
  name: string,
  values: string[]
): ColumnStats {
  const type = detectColumnType(values);
  const nonEmpty = values.filter((v) => v.trim() !== "");
  const uniqueCount = new Set(nonEmpty).size;

  const base: ColumnStats = {
    name,
    type,
    nonEmptyCount: nonEmpty.length,
    uniqueCount,
  };

  if (type === "numeric") {
    const nums = nonEmpty
      .map(Number)
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    if (nums.length > 0) {
      const sum = nums.reduce((a, b) => a + b, 0);
      base.min = nums[0];
      base.max = nums[nums.length - 1];
      base.mean = Math.round((sum / nums.length) * 100) / 100;
      const mid = Math.floor(nums.length / 2);
      base.median =
        nums.length % 2 === 0
          ? Math.round(((nums[mid - 1] + nums[mid]) / 2) * 100) / 100
          : nums[mid];
    }
  }

  if (type === "categorical") {
    const freq = new Map<string, number>();
    for (const v of nonEmpty) {
      freq.set(v, (freq.get(v) ?? 0) + 1);
    }
    const sorted = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    base.topValues = sorted.map(([value, count]) => ({ value, count }));
  }

  return base;
}

// ============ Chart Recommendation ============

/**
 * Recommend chart types based on column type composition.
 */
function recommendCharts(
  headers: string[],
  rows: Record<string, string>[],
  columnStats: ColumnStats[]
): ChartRecommendation[] {
  const recommendations: ChartRecommendation[] = [];
  if (rows.length === 0 || headers.length === 0) return recommendations;

  const numericCols = columnStats.filter((c) => c.type === "numeric");
  const categoricalCols = columnStats.filter((c) => c.type === "categorical");
  const dateCols = columnStats.filter((c) => c.type === "date");
  // Text columns that have low cardinality can also serve as categorical
  const textCols = columnStats.filter((c) => c.type === "text");
  const labelCols = [
    ...categoricalCols,
    ...textCols.filter((c) => c.uniqueCount <= 30),
  ];

  // 1 date + 1 numeric -> line chart
  if (dateCols.length >= 1 && numericCols.length >= 1) {
    const dateCol = dateCols[0].name;
    const valueCol = numericCols[0].name;
    const spec: Record<string, unknown> = {
      type: "line",
      data: rows.slice(0, 50).map((r) => ({
        [dateCol]: r[dateCol],
        [valueCol]: Number(r[valueCol]) || 0,
      })),
      xField: dateCol,
      yField: valueCol,
      smooth: true,
      point: { size: 3 },
    };
    // Multi-line if more than 1 numeric column
    if (numericCols.length > 1) {
      const multiData: Record<string, unknown>[] = [];
      for (const row of rows.slice(0, 50)) {
        for (const nc of numericCols) {
          multiData.push({
            [dateCol]: row[dateCol],
            value: Number(row[nc.name]) || 0,
            series: nc.name,
          });
        }
      }
      spec.data = multiData;
      spec.yField = "value";
      spec.colorField = "series";
      recommendations.push({
        chartType: "multi-line",
        engine: "adc",
        reason: `${dateCols.length} date column(s) + ${numericCols.length} numeric columns suggest a multi-line chart over time.`,
        spec,
      });
    } else {
      recommendations.push({
        chartType: "line",
        engine: "adc",
        reason: `Date column "${dateCol}" + numeric column "${valueCol}" suggest a line chart.`,
        spec,
      });
    }
  }

  // 1 categorical/label + 1 numeric -> bar or pie
  if (labelCols.length >= 1 && numericCols.length >= 1) {
    const catCol = labelCols[0].name;
    const valueCol = numericCols[0].name;
    const uniqueCategories = new Set(rows.map((r) => r[catCol])).size;

    if (uniqueCategories > 0 && uniqueCategories < 10) {
      // Pie chart for small number of categories
      recommendations.push({
        chartType: "pie",
        engine: "adc",
        reason: `${uniqueCategories} categories in "${catCol}" + numeric "${valueCol}" — pie chart for distribution.`,
        spec: {
          type: "pie",
          data: rows.slice(0, 50).map((r) => ({
            [catCol]: r[catCol],
            [valueCol]: Number(r[valueCol]) || 0,
          })),
          angleField: valueCol,
          colorField: catCol,
          innerRadius: 0.5,
          label: { text: catCol, position: "outside" },
        },
      });
    }

    // Bar chart (works for any number of categories)
    const barSpec: Record<string, unknown> = {
      type: "bar",
      data: rows.slice(0, 50).map((r) => ({
        [catCol]: r[catCol],
        [valueCol]: Number(r[valueCol]) || 0,
      })),
      xField: valueCol,
      yField: catCol,
    };

    // Grouped bar if multiple numeric columns
    if (numericCols.length > 1) {
      const groupedData: Record<string, unknown>[] = [];
      for (const row of rows.slice(0, 50)) {
        for (const nc of numericCols) {
          groupedData.push({
            [catCol]: row[catCol],
            value: Number(row[nc.name]) || 0,
            series: nc.name,
          });
        }
      }
      barSpec.data = groupedData;
      barSpec.xField = "value";
      barSpec.colorField = "series";
      recommendations.push({
        chartType: "grouped-bar",
        engine: "adc",
        reason: `Categorical "${catCol}" + ${numericCols.length} numeric columns suggest a grouped bar chart.`,
        spec: barSpec,
      });
    } else {
      recommendations.push({
        chartType: "bar",
        engine: "adc",
        reason: `Categorical "${catCol}" + numeric "${valueCol}" suggest a bar chart.`,
        spec: barSpec,
      });
    }
  }

  // 2 numeric columns -> scatter
  if (numericCols.length >= 2) {
    const xCol = numericCols[0].name;
    const yCol = numericCols[1].name;
    recommendations.push({
      chartType: "scatter",
      engine: "adc",
      reason: `Two numeric columns "${xCol}" and "${yCol}" suggest a scatter plot.`,
      spec: {
        type: "scatter",
        data: rows.slice(0, 100).map((r) => ({
          [xCol]: Number(r[xCol]) || 0,
          [yCol]: Number(r[yCol]) || 0,
        })),
        xField: xCol,
        yField: yCol,
        point: { size: 4 },
      },
    });
  }

  // 1 numeric column alone -> histogram-style column chart
  if (numericCols.length === 1 && labelCols.length === 0 && dateCols.length === 0) {
    const col = numericCols[0].name;
    recommendations.push({
      chartType: "histogram",
      engine: "adc",
      reason: `Single numeric column "${col}" suggests a histogram / column chart.`,
      spec: {
        type: "column",
        data: rows.slice(0, 50).map((r, i) => ({
          index: i + 1,
          [col]: Number(r[col]) || 0,
        })),
        xField: "index",
        yField: col,
      },
    });
  }

  // Fallback: if no recommendations yet, suggest a basic column chart
  // using the first label-like column and first numeric column
  if (recommendations.length === 0 && numericCols.length >= 1) {
    const xCol =
      labelCols[0]?.name ??
      dateCols[0]?.name ??
      headers[0];
    const yCol = numericCols[0].name;
    recommendations.push({
      chartType: "column",
      engine: "adc",
      reason: `Fallback: using "${xCol}" and "${yCol}" for a column chart.`,
      spec: {
        type: "column",
        data: rows.slice(0, 50).map((r) => ({
          [xCol]: r[xCol],
          [yCol]: Number(r[yCol]) || 0,
        })),
        xField: xCol,
        yField: yCol,
      },
    });
  }

  return recommendations;
}

// ============ Core Analysis ============

/**
 * Analyze tabular data and return structured results.
 */
function analyzeData(
  data: string,
  format: "csv" | "json" | "auto"
): DataAnalysisResult {
  const resolvedFormat = format === "auto" ? detectFormat(data) : format;

  let headers: string[];
  let rows: Record<string, string>[];

  if (resolvedFormat === "json") {
    ({ headers, rows } = parseJSONData(data));
  } else {
    ({ headers, rows } = parseCSV(data));
  }

  if (headers.length === 0) {
    throw new Error(
      "Could not parse any columns from the data. Ensure the input is valid CSV or JSON."
    );
  }
  if (rows.length === 0) {
    throw new Error(
      "Data has headers but no rows. Provide at least one data row."
    );
  }

  const columnStats = headers.map((h) =>
    computeColumnStats(
      h,
      rows.map((r) => r[h] ?? "")
    )
  );

  const recommendations = recommendCharts(headers, rows, columnStats);

  const preview = rows.slice(0, 5);

  return {
    summary: {
      rows: rows.length,
      columns: headers.length,
      columnNames: headers,
    },
    columnStats,
    recommendations,
    preview,
  };
}

// ============ Format Result ============

function formatAnalysisResult(result: DataAnalysisResult): string {
  const lines: string[] = [];

  lines.push("## Data Analysis Summary");
  lines.push(
    `- **Rows**: ${result.summary.rows} | **Columns**: ${result.summary.columns}`
  );
  lines.push(`- **Column names**: ${result.summary.columnNames.join(", ")}`);
  lines.push("");

  lines.push("### Column Statistics");
  for (const col of result.columnStats) {
    let detail = `- **${col.name}** (${col.type}): ${col.nonEmptyCount} non-empty, ${col.uniqueCount} unique`;
    if (col.type === "numeric") {
      detail += ` | min=${col.min}, max=${col.max}, mean=${col.mean}, median=${col.median}`;
    }
    if (col.topValues && col.topValues.length > 0) {
      const topStr = col.topValues
        .map((tv) => `${tv.value} (${tv.count})`)
        .join(", ");
      detail += ` | top values: ${topStr}`;
    }
    lines.push(detail);
  }
  lines.push("");

  if (result.recommendations.length > 0) {
    lines.push("### Recommended Charts");
    for (const rec of result.recommendations) {
      lines.push(
        `- **${rec.chartType}** (${rec.engine}): ${rec.reason}`
      );
      lines.push("  Pre-built spec:");
      lines.push("  ```json");
      lines.push(`  ${JSON.stringify(rec.spec)}`);
      lines.push("  ```");
    }
    lines.push("");
  }

  if (result.preview.length > 0) {
    lines.push("### Data Preview (first 5 rows)");
    lines.push("```json");
    lines.push(JSON.stringify(result.preview, null, 2));
    lines.push("```");
  }

  return lines.join("\n");
}

// ============ AI Tool Definition ============

export const BUILTIN_DATA_ANALYZER_KEY = "builtin_data_analyzer";

/**
 * Resolve data string from various possible argument shapes.
 *
 * GLM and other models may use different parameter names.
 */
function resolveDataArg(args: Record<string, unknown>): string {
  const candidates = [
    "data",
    "csv",
    "csv_data",
    "csvData",
    "json_data",
    "jsonData",
    "input",
    "text",
    "content",
    "table",
    "raw_data",
    "rawData",
  ];
  for (const key of candidates) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  // Last resort: if the model passed a single string value under any key, use it
  const values = Object.values(args).filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  if (values.length === 1) {
    return values[0].trim();
  }
  return "";
}

function resolveFormatArg(
  args: Record<string, unknown>
): "csv" | "json" | "auto" {
  const value = args["format"];
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (lower === "csv" || lower === "json") return lower;
  }
  return "auto";
}

export function createDataAnalyzerTool(): ToolSet {
  return {
    [BUILTIN_DATA_ANALYZER_KEY]: tool({
      description:
        'Analyze CSV or JSON tabular data: parse columns, detect types (numeric/date/categorical/text), compute statistics (min, max, mean, median for numeric; top values for categorical), and recommend chart types with pre-built specs. Use when user provides raw data (CSV text, JSON array, or a table). You MUST provide the data parameter with the raw CSV or JSON text.',
      inputSchema: z.object({
        data: z
          .string()
          .describe(
            "The raw CSV or JSON data as a text string. This parameter is required."
          ),
        format: z
          .enum(["csv", "json", "auto"])
          .optional()
          .default("auto")
          .describe(
            'Data format hint: "csv", "json", or "auto" (auto-detect). Defaults to "auto".'
          ),
      }),
      execute: async (rawArgs: { data: string; format?: "csv" | "json" | "auto" }) => {
        const data = resolveDataArg(
          rawArgs as unknown as Record<string, unknown>
        );
        if (!data) {
          return 'Error: No data provided. Please call this tool with {"data": "col1,col2\\nval1,val2\\n..."}.';
        }
        const format = resolveFormatArg(
          rawArgs as unknown as Record<string, unknown>
        );
        try {
          const result = analyzeData(data, format);
          return formatAnalysisResult(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return `Data analysis error: ${message}`;
        }
      },
    }),
  };
}
