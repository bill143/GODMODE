"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Shield,
  TrendingUp,
  Target,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface KPICard {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  positive: boolean;
  icon: React.ElementType;
  description: string;
  color: string;
}

const KPI_DATA: KPICard[] = [
  {
    title: "Total Payloads",
    value: "247",
    change: "+18 this week",
    trend: "up",
    positive: true,
    icon: Shield,
    description: "Active exploit signatures",
    color: "emerald",
  },
  {
    title: "Bypass Rate",
    value: "63.2%",
    change: "+4.1% vs last run",
    trend: "up",
    positive: false,
    icon: TrendingUp,
    description: "Successful jailbreak ratio",
    color: "red",
  },
  {
    title: "Models Tested",
    value: "5",
    change: "+1 new model",
    trend: "up",
    positive: true,
    icon: Target,
    description: "Distinct LLM families assessed",
    color: "blue",
  },
  {
    title: "Vulnerability Index",
    value: "8.7",
    change: "-0.3 improvement",
    trend: "down",
    positive: true,
    icon: AlertTriangle,
    description: "Composite risk score (0–10)",
    color: "amber",
  },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    icon: "text-emerald-400",
  },
  red: {
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    text: "text-red-400",
    icon: "text-red-400",
  },
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
    icon: "text-blue-400",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    icon: "text-amber-400",
  },
};

export function KPICards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {KPI_DATA.map((kpi, i) => {
        const Icon = kpi.icon;
        const TrendIcon = kpi.trend === "up" ? ArrowUpRight : ArrowDownRight;
        const colors = COLOR_MAP[kpi.color];
        return (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            className="glass rounded-xl p-5 hover:border-slate-700 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center",
                  colors.bg,
                  "border",
                  colors.border
                )}
              >
                <Icon className={cn("w-4.5 h-4.5", colors.icon)} />
              </div>
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  kpi.positive ? "text-emerald-400" : "text-red-400"
                )}
              >
                <TrendIcon className="w-3 h-3" />
                {kpi.change}
              </span>
            </div>
            <div className={cn("text-2xl font-bold tabular-nums mb-0.5", colors.text)}>
              {kpi.value}
            </div>
            <div className="text-sm font-medium text-slate-200">{kpi.title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{kpi.description}</div>
          </motion.div>
        );
      })}
    </div>
  );
}
