"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar, type ViewId } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { PayloadMatrix } from "@/components/payload/PayloadMatrix";
import { LiveTestingSandbox } from "@/components/sandbox/LiveTestingSandbox";
import { AuditLogs } from "@/components/audit/AuditLogs";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import type { Payload, TestResult } from "@/types";

export default function Home() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [launchPayload, setLaunchPayload] = useState<Payload | null>(null);
  const { addLog } = useAuditLogs();

  const handleLaunchTest = (payload: Payload) => {
    setLaunchPayload(payload);
    setActiveView("sandbox");
  };

  const handleTestComplete = (result: TestResult) => {
    addLog(result);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B0F19] grid-bg">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header activeView={activeView} />

        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {activeView === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <DashboardView />
              </motion.div>
            )}
            {activeView === "payloads" && (
              <motion.div
                key="payloads"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <PayloadMatrix onLaunchTest={handleLaunchTest} />
              </motion.div>
            )}
            {activeView === "sandbox" && (
              <motion.div
                key="sandbox"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <LiveTestingSandbox
                  key={launchPayload?.id ?? "sandbox"}
                  initialPayload={launchPayload}
                  onTestComplete={handleTestComplete}
                />
              </motion.div>
            )}
            {activeView === "audit" && (
              <motion.div
                key="audit"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <AuditLogs />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
