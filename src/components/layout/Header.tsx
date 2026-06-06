"use client";

import { motion } from "framer-motion";
import { Bell, Search, Settings, Activity } from "lucide-react";
import type { ViewId } from "./Sidebar";

const VIEW_TITLES: Record<ViewId, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard Analytics", subtitle: "Real-time threat intelligence overview" },
  payloads: { title: "Payload Matrix", subtitle: "G0DM0D3 exploit library & deep filter" },
  sandbox: { title: "Live Testing Sandbox", subtitle: "Execute & analyze LLM vulnerability probes" },
  audit: { title: "Security & Audit Logs", subtitle: "Compliance ledger & forensic trail" },
};

interface HeaderProps {
  activeView: ViewId;
}

export function Header({ activeView }: HeaderProps) {
  const { title, subtitle } = VIEW_TITLES[activeView];

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-10">
      <motion.div
        key={activeView}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="text-base font-semibold text-slate-100">{title}</h1>
        <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
      </motion.div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Quick search..."
            className="w-48 pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Activity className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400 tracking-wider">LIVE</span>
        </div>

        {/* Notifications */}
        <button className="relative p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </button>

        {/* Settings */}
        <button className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
