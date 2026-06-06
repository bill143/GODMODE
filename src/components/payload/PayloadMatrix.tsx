"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { usePayloads } from "@/hooks/usePayloads";
import { cn, escapeHtml } from "@/lib/utils";
import { toast } from "sonner";
import type { Payload, PayloadCategory, RiskLevel, LLMFamily } from "@/types";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Search,
  Copy,
  ChevronRight,
  Filter,
  Zap,
} from "lucide-react";

const RISK_BADGE: Record<RiskLevel, string> = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Medium: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  Low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const COMPLEXITY_BADGE: Record<string, string> = {
  Advanced: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  Intermediate: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Basic: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const columnHelper = createColumnHelper<Payload>();

function ExpandedRow({ payload, onLaunch }: { payload: Payload; onLaunch: (p: Payload) => void }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(payload.prompt).then(() => {
      toast.success("Payload copied to clipboard", { duration: 2000 });
    });
  };

  const safePrompt = escapeHtml(payload.prompt);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="px-4 py-4 bg-slate-950/60 border-t border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {payload.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700"
              >
                #{tag}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors border border-slate-700 hover:border-slate-600"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Prompt
            </button>
            <button
              onClick={() => onLaunch(payload)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs transition-colors border border-emerald-500/20 hover:border-emerald-500/40"
            >
              <Zap className="w-3.5 h-3.5" />
              Launch Test
            </button>
          </div>
        </div>

        {/* Prompt text — safely escaped */}
        <div className="relative">
          <div className="absolute top-2 right-2 text-[10px] text-slate-600 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            PROMPT
          </div>
          <pre
            className="terminal-text text-slate-300 bg-slate-950 rounded-lg p-4 border border-slate-800 overflow-x-auto whitespace-pre-wrap leading-relaxed"
            dangerouslySetInnerHTML={{ __html: safePrompt }}
          />
        </div>

        {/* Variables if any */}
        {payload.variables && Object.keys(payload.variables).length > 0 && (
          <div>
            <div className="text-[10px] text-slate-500 mb-2 font-medium uppercase tracking-wider">
              Variables
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(payload.variables).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs"
                >
                  <span className="text-emerald-400 font-mono">{`{{${k}}}`}</span>
                  <span className="text-slate-500">=</span>
                  <span className="text-slate-300 font-mono max-w-[200px] truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Target models & success rate */}
        <div className="flex items-center gap-6 text-xs text-slate-500">
          <div>
            <span className="text-slate-600 mr-2">Targets:</span>
            {payload.targetModels.join(", ")}
          </div>
          <div>
            <span className="text-slate-600 mr-2">Success Rate:</span>
            <span
              className={cn(
                "font-bold",
                payload.successRate >= 60
                  ? "text-red-400"
                  : payload.successRate >= 40
                  ? "text-amber-400"
                  : "text-emerald-400"
              )}
            >
              {payload.successRate}%
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface PayloadMatrixProps {
  onLaunchTest?: (payload: Payload) => void;
}

const CATEGORIES: Array<PayloadCategory | "All"> = [
  "All",
  "Jailbreak",
  "Persona Injection",
  "Refusal Bypass",
  "Prompt Injection",
  "Role Override",
  "Context Manipulation",
];

const RISK_LEVELS: Array<RiskLevel | "All"> = ["All", "Critical", "High", "Medium", "Low"];

const TARGET_MODELS: Array<LLMFamily | "All"> = [
  "All",
  "GPT-4",
  "Claude 3.5",
  "Gemini",
  "Llama-3",
  "Mistral",
];

export function PayloadMatrix({ onLaunchTest }: PayloadMatrixProps) {
  const { payloads, isLoading, filters, setFilters } = usePayloads();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([]);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "expand",
        size: 40,
        cell: ({ row }) => (
          <button
            onClick={() => toggleRow(row.original.id)}
            className="p-1 text-slate-500 hover:text-emerald-400 transition-colors"
          >
            <motion.div
              animate={{ rotate: expandedRows.has(row.original.id) ? 90 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          </button>
        ),
      }),
      columnHelper.accessor("name", {
        header: "Payload Name",
        size: 240,
        cell: (info) => (
          <span className="font-medium text-slate-200 text-sm">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("category", {
        header: "Category",
        size: 180,
        cell: (info) => (
          <span className="text-xs text-slate-400">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("complexity", {
        header: "Complexity",
        size: 130,
        cell: (info) => (
          <span
            className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded border",
              COMPLEXITY_BADGE[info.getValue()]
            )}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("riskLevel", {
        header: "Risk",
        size: 110,
        cell: (info) => (
          <span
            className={cn(
              "text-[11px] font-bold px-2 py-0.5 rounded border",
              RISK_BADGE[info.getValue()]
            )}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("successRate", {
        header: "Success %",
        size: 110,
        cell: (info) => {
          const val = info.getValue();
          return (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden max-w-[60px]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    val >= 60 ? "bg-red-500" : val >= 40 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${val}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-xs font-bold tabular-nums",
                  val >= 60 ? "text-red-400" : val >= 40 ? "text-amber-400" : "text-emerald-400"
                )}
              >
                {val}%
              </span>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        size: 60,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(row.original.prompt).then(() => {
                  toast.success("Copied!", { duration: 1500 });
                });
              }}
              className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
              title="Copy prompt"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLaunchTest?.(row.original);
                toast.info(`Launching: ${row.original.name}`, { duration: 2000 });
              }}
              className="p-1.5 rounded text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
              title="Launch test"
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
          </div>
        ),
      }),
    ],
    [expandedRows, onLaunchTest]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: payloads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (i) => (expandedRows.has(rows[i]?.original.id) ? 220 : 52),
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Filter bar */}
      <div className="glass rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search payloads, tags, descriptions..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>

          <Filter className="w-4 h-4 text-slate-500" />

          {/* Category filter */}
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value as PayloadCategory | "All" })
            }
            className="py-2 px-3 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All Categories" : c}
              </option>
            ))}
          </select>

          {/* Risk filter */}
          <select
            value={filters.riskLevel}
            onChange={(e) =>
              setFilters({ ...filters, riskLevel: e.target.value as RiskLevel | "All" })
            }
            className="py-2 px-3 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
          >
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r === "All" ? "All Risk Levels" : r}
              </option>
            ))}
          </select>

          {/* Model filter */}
          <select
            value={filters.targetModel}
            onChange={(e) =>
              setFilters({ ...filters, targetModel: e.target.value as LLMFamily | "All" })
            }
            className="py-2 px-3 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-emerald-500/50 cursor-pointer"
          >
            {TARGET_MODELS.map((m) => (
              <option key={m} value={m}>
                {m === "All" ? "All Models" : m}
              </option>
            ))}
          </select>

          <span className="text-xs text-slate-500 ml-auto">
            {payloads.length} payload{payloads.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        {/* Header */}
        <div className="border-b border-slate-800">
          {table.getHeaderGroups().map((headerGroup) => (
            <div key={headerGroup.id} className="flex items-center px-2">
              {headerGroup.headers.map((header) => (
                <div
                  key={header.id}
                  style={{ width: header.getSize(), minWidth: header.getSize() }}
                  className={cn(
                    "px-3 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider",
                    header.column.getCanSort() && "cursor-pointer hover:text-slate-300 select-none"
                  )}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <span className="text-slate-600">
                        {header.column.getIsSorted() === "asc" ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronsUpDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Virtualized body */}
        <div
          ref={tableContainerRef}
          className="overflow-y-auto"
          style={{ maxHeight: "520px" }}
        >
          {payloads.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
              No payloads match the current filters.
            </div>
          ) : (
            <div style={{ height: totalSize, position: "relative" }}>
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                const isExpanded = expandedRows.has(row.original.id);
                return (
                  <div
                    key={row.id}
                    style={{
                      position: "absolute",
                      top: virtualRow.start,
                      left: 0,
                      right: 0,
                    }}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                  >
                    {/* Row */}
                    <div
                      onClick={() => toggleRow(row.original.id)}
                      className={cn(
                        "flex items-center px-2 border-b border-slate-800/60 cursor-pointer transition-colors",
                        isExpanded
                          ? "bg-slate-800/40 border-emerald-500/10"
                          : "hover:bg-slate-800/30"
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <div
                          key={cell.id}
                          style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                          className="px-3 py-3 overflow-hidden text-ellipsis"
                          onClick={
                            cell.column.id === "actions"
                              ? (e) => e.stopPropagation()
                              : undefined
                          }
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      ))}
                    </div>

                    {/* Expanded content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <ExpandedRow
                          key={`expanded-${row.original.id}`}
                          payload={row.original}
                          onLaunch={(p) => {
                            onLaunchTest?.(p);
                            toast.info(`Launching sandbox: ${p.name}`);
                          }}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
