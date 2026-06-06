"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CHART_DATA } from "@/data/payloads";
import { TrendingUp } from "lucide-react";

const MODEL_COLORS: Record<string, string> = {
  "GPT-4": "#10B981",
  "Claude 3.5": "#6366f1",
  "Gemini": "#f59e0b",
  "Llama-3": "#ef4444",
  "Mistral": "#06b6d4",
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const data = CHART_DATA.find((d) => d.model === label);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs font-semibold text-slate-200 mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4 text-xs">
          <span className="text-slate-400">Bypass Rate</span>
          <span className="text-emerald-400 font-bold">{payload[0]?.value}%</span>
        </div>
        {data && (
          <>
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-slate-400">Total Tests</span>
              <span className="text-slate-200">{data.totalTests}</span>
            </div>
            <div className="flex justify-between gap-4 text-xs">
              <span className="text-slate-400">Critical Bypass</span>
              <span className="text-red-400">{data.criticalBypass}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SuccessRateChart() {
  return (
    <div className="glass rounded-xl flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-slate-200">Bypass Rate by LLM Family</span>
        </div>
        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
          Last 30 days
        </span>
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={CHART_DATA}
            margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
            barSize={28}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(51, 65, 85, 0.4)"
              vertical={false}
            />
            <XAxis
              dataKey="model"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 100]}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(51,65,85,0.2)" }} />
            <Bar dataKey="successRate" radius={[4, 4, 0, 0]}>
              {CHART_DATA.map((entry) => (
                <Cell
                  key={entry.model}
                  fill={MODEL_COLORS[entry.model] ?? "#10B981"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 justify-center">
          {CHART_DATA.map((d) => (
            <div key={d.model} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: MODEL_COLORS[d.model] }}
              />
              <span className="text-[11px] text-slate-400">{d.model}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
