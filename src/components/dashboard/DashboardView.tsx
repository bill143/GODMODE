"use client";

import { motion } from "framer-motion";
import { KPICards } from "./KPICards";
import { ActivityFeed } from "./ActivityFeed";
import { SuccessRateChart } from "./SuccessRateChart";

export function DashboardView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <KPICards />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Chart — spans 3 cols */}
        <div className="lg:col-span-3">
          <SuccessRateChart />
        </div>
        {/* Activity feed — spans 2 cols */}
        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Avg Latency", value: "1.4s", sub: "per test execution" },
          { label: "Critical Bypasses", value: "194", sub: "across all models" },
          { label: "Payload Coverage", value: "78%", sub: "of known techniques" },
          { label: "Last Run", value: "2m ago", sub: "automated test suite" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="glass rounded-xl px-4 py-3"
          >
            <div className="text-lg font-bold text-emerald-400 tabular-nums">{stat.value}</div>
            <div className="text-xs font-medium text-slate-300 mt-0.5">{stat.label}</div>
            <div className="text-[11px] text-slate-600">{stat.sub}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
