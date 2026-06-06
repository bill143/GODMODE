"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Database,
  FlaskConical,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Zap,
  Terminal,
} from "lucide-react";

export type ViewId = "dashboard" | "payloads" | "sandbox" | "audit";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "payloads", label: "Payload Matrix", icon: Database, badge: "12" },
  { id: "sandbox", label: "Live Sandbox", icon: FlaskConical },
  { id: "audit", label: "Audit Logs", icon: ShieldAlert },
];

interface SidebarProps {
  activeView: ViewId;
  onViewChange: (id: ViewId) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ activeView, onViewChange, collapsed, onToggle }: SidebarProps) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="relative flex flex-col h-full bg-slate-900 border-r border-slate-800 overflow-hidden flex-shrink-0"
    >
      {/* Logo area */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800 min-h-[64px]">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center neon-border-emerald">
          <Terminal className="w-4 h-4 text-emerald-400" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="text-sm font-bold text-emerald-400 neon-emerald tracking-wider whitespace-nowrap">
                G0DM0D3
              </div>
              <div className="text-[10px] text-slate-500 tracking-widest whitespace-nowrap">
                COMMAND CENTER
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-2 py-2.5 rounded-lg transition-all duration-150 group text-left",
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 flex-shrink-0",
                  isActive ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"
                )}
              />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm font-medium whitespace-nowrap flex-1"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {!collapsed && item.badge && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
                  >
                    {item.badge}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* Status indicator */}
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-live flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-[11px] text-slate-500 whitespace-nowrap"
              >
                System Online
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[72px] w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-colors z-10"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3 text-slate-400" />
        ) : (
          <ChevronLeft className="w-3 h-3 text-slate-400" />
        )}
      </button>

      {/* Version */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-4 py-2 border-t border-slate-800"
          >
            <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
              <Zap className="w-3 h-3" />
              <span>v2.4.1 — Red Team Edition</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
