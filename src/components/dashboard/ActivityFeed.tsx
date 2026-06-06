"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatTimestamp } from "@/lib/utils";
import { Activity, AlertTriangle, Copy, Zap, Link2 } from "lucide-react";
import type { ActivityItem } from "@/types";

const INITIAL_FEED: ActivityItem[] = [
  {
    id: "a1",
    timestamp: new Date(Date.now() - 12000),
    type: "bypass_detected",
    message: "BYPASS DETECTED — DAN Protocol on GPT-4o",
    severity: "critical",
  },
  {
    id: "a2",
    timestamp: new Date(Date.now() - 45000),
    type: "test_run",
    message: "Test executed — Grandma Exploit on Claude 3.5 [REFUSED]",
    severity: "success",
  },
  {
    id: "a3",
    timestamp: new Date(Date.now() - 120000),
    type: "payload_copy",
    message: "Payload copied — Nested Hypothetical Escape",
    severity: "info",
  },
  {
    id: "a4",
    timestamp: new Date(Date.now() - 300000),
    type: "api_connect",
    message: "API connection established — Llama-3 70B via Together AI",
    severity: "success",
  },
  {
    id: "a5",
    timestamp: new Date(Date.now() - 600000),
    type: "test_run",
    message: "Batch test run — 12 payloads against Gemini 1.5 Pro",
    severity: "info",
  },
];

const NEW_EVENTS: ActivityItem[] = [
  {
    id: "",
    timestamp: new Date(),
    type: "bypass_detected",
    message: "BYPASS DETECTED — Developer Mode on Mistral Large",
    severity: "critical",
  },
  {
    id: "",
    timestamp: new Date(),
    type: "test_run",
    message: "Test executed — AIM Persona on Llama-3 [SUCCESS]",
    severity: "warning",
  },
  {
    id: "",
    timestamp: new Date(),
    type: "payload_copy",
    message: "Payload copied — System Role Injection",
    severity: "info",
  },
  {
    id: "",
    timestamp: new Date(),
    type: "test_run",
    message: "Multi-Shot Conditioning on GPT-4o [REFUSED]",
    severity: "success",
  },
];

const SEVERITY_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  critical: { dot: "bg-red-400", text: "text-red-300", bg: "bg-red-500/5" },
  warning: { dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-500/5" },
  success: { dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-500/5" },
  info: { dot: "bg-blue-400", text: "text-slate-300", bg: "transparent" },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  bypass_detected: AlertTriangle,
  test_run: Activity,
  payload_copy: Copy,
  api_connect: Link2,
  export: Zap,
};

export function ActivityFeed() {
  const [feed, setFeed] = useState<ActivityItem[]>(INITIAL_FEED);

  useEffect(() => {
    let idx = 0;
    const timer = setInterval(() => {
      const event = NEW_EVENTS[idx % NEW_EVENTS.length];
      setFeed((prev) => [
        { ...event, id: `live-${Date.now()}`, timestamp: new Date() },
        ...prev.slice(0, 19),
      ]);
      idx++;
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="glass rounded-xl flex flex-col overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-slate-200">Activity Feed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-live" />
          <span className="text-[10px] text-slate-500 tracking-wider">LIVE</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-72">
        <AnimatePresence initial={false}>
          {feed.map((item) => {
            const styles = SEVERITY_STYLES[item.severity];
            const Icon = TYPE_ICONS[item.type] ?? Activity;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors hover:bg-slate-800/50",
                  styles.bg
                )}
              >
                <Icon className={cn("w-3.5 h-3.5 mt-0.5 flex-shrink-0", styles.text)} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs leading-snug", styles.text)}>{item.message}</p>
                  <time className="text-[10px] text-slate-600 mt-0.5 block">
                    {formatTimestamp(item.timestamp)}
                  </time>
                </div>
                <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", styles.dot)} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
