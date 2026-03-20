import { useState, useMemo, useCallback, type ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InteractiveTableProps {
  headers: string[];
  rows: string[][];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Heuristic: a string is "numeric" if it parses to a finite number after
 *  stripping common formatting (commas, currency symbols, percent signs). */
function parseNumeric(raw: string): number | null {
  const cleaned = raw
    .replace(/[$€£¥₹%,\s]/g, "")
    .replace(/\u00a0/g, ""); // non-breaking space
  if (cleaned === "" || cleaned === "-" || cleaned === "--") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Returns true when >50 % of non-empty values in a column are numeric. */
function isNumericColumn(rows: string[][], colIndex: number): boolean {
  let total = 0;
  let numeric = 0;
  for (const row of rows) {
    const cell = row[colIndex];
    if (cell == null || cell.trim() === "") continue;
    total++;
    if (parseNumeric(cell) !== null) numeric++;
  }
  return total > 0 && numeric / total > 0.5;
}

/** Format a number with thousand separators (locale-aware). */
function formatNumber(raw: string): string {
  const n = parseNumeric(raw);
  if (n === null) return raw;

  // Preserve original decorations (currency, percent)
  const prefix = raw.match(/^[\s$€£¥₹]*/)?.[0] ?? "";
  const suffix = raw.match(/[%]?\s*$/)?.[0] ?? "";

  // Detect original decimal places
  const cleaned = raw.replace(/[$€£¥₹%,\s\u00a0]/g, "");
  const dotIndex = cleaned.indexOf(".");
  const decimals = dotIndex >= 0 ? cleaned.length - dotIndex - 1 : 0;

  return `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
}

// Sort icon indicators
function SortIndicator({ direction }: { direction: "asc" | "desc" | false }) {
  if (!direction) {
    return (
      <span className="ml-1 inline-block w-3 text-foreground-subtle opacity-0 group-hover:opacity-60 transition-opacity select-none">
        ↕
      </span>
    );
  }
  return (
    <span className="ml-1 inline-block w-3 text-foreground-muted select-none">
      {direction === "asc" ? "↑" : "↓"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InteractiveTable({ headers, rows }: InteractiveTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  // Pre-compute which columns are numeric
  const numericFlags = useMemo(
    () => headers.map((_, i) => isNumericColumn(rows, i)),
    [headers, rows],
  );

  // Build column definitions
  const columns = useMemo<ColumnDef<string[], string>[]>(
    () =>
      headers.map((header, index) => ({
        id: String(index),
        accessorFn: (row: string[]) => row[index] ?? "",
        header: () => header,
        cell: (info) => {
          const raw = info.getValue();
          if (numericFlags[index]) {
            return (
              <span className="tabular-nums">{formatNumber(raw)}</span>
            );
          }
          return raw;
        },
        sortingFn: numericFlags[index]
          ? (rowA, rowB, columnId) => {
              const a = parseNumeric(rowA.getValue(columnId) as string) ?? -Infinity;
              const b = parseNumeric(rowB.getValue(columnId) as string) ?? -Infinity;
              return a - b;
            }
          : "alphanumeric",
      })),
    [headers, numericFlags],
  );

  // Pagination: auto-enable for >20 rows
  const enablePagination = rows.length > 20;

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(enablePagination
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    initialState: enablePagination ? { pagination: { pageSize: 20 } } : undefined,
  });

  const handleFilterChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setGlobalFilter(e.target.value),
    [],
  );

  const totalRows = table.getFilteredRowModel().rows.length;

  return (
    <div className="my-3 not-prose rounded-xl border border-border overflow-hidden bg-surface-elevated">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs text-foreground-muted whitespace-nowrap">
          {totalRows} row{totalRows !== 1 ? "s" : ""}
        </span>
        <input
          type="text"
          value={globalFilter}
          onChange={handleFilterChange}
          placeholder="Search table..."
          className="w-full max-w-xs text-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-foreground placeholder:text-foreground-subtle focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border bg-muted/30">
                {headerGroup.headers.map((header) => {
                  const colIdx = Number(header.id);
                  const isNumeric = numericFlags[colIdx];
                  return (
                    <th
                      key={header.id}
                      className={`group px-4 py-2.5 font-semibold text-foreground select-none cursor-pointer transition-colors hover:bg-muted/50 ${
                        isNumeric ? "text-right" : "text-left"
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {flexRender(header.column.columnDef.header, header.getContext()) as ReactNode}
                        <SortIndicator direction={header.column.getIsSorted()} />
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIndex) => (
              <tr
                key={row.id}
                className={`border-b border-border/50 transition-colors hover:bg-accent/5 ${
                  rowIndex % 2 === 1 ? "bg-muted/15" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => {
                  const colIdx = Number(cell.column.id);
                  const isNumeric = numericFlags[colIdx];
                  return (
                    <td
                      key={cell.id}
                      className={`px-4 py-2 text-foreground ${isNumeric ? "text-right font-mono text-[13px]" : ""}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext()) as ReactNode}
                    </td>
                  );
                })}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-4 py-6 text-center text-foreground-muted text-xs"
                >
                  No matching rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {enablePagination && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-muted/40 text-xs text-foreground-muted">
          <span>
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <div className="flex items-center gap-1">
            <PaginationButton
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              ««
            </PaginationButton>
            <PaginationButton
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              «
            </PaginationButton>
            <PaginationButton
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              »
            </PaginationButton>
            <PaginationButton
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              »»
            </PaginationButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded px-2 py-1 text-xs font-medium transition-colors border border-border bg-surface hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
