"use client";

import { useState, useCallback } from "react";
import type { LogEntry, TestResult, LogSeverity } from "@/types";
import { generateId, downloadFile } from "@/lib/utils";

const STORAGE_KEY = "g0dm0d3_audit_logs";

function getSeverity(status: string): LogSeverity {
  switch (status) {
    case "success":
      return "critical";
    case "refused":
      return "success";
    case "error":
      return "warning";
    default:
      return "info";
  }
}

function loadLogsFromStorage(): LogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: LogEntry[] = JSON.parse(stored);
      return parsed.map((l) => ({ ...l, timestamp: new Date(l.timestamp) }));
    }
  } catch {
    // Ignore storage errors
  }
  return [];
}

export function useAuditLogs() {
  const [logs, setLogs] = useState<LogEntry[]>(loadLogsFromStorage);

  const persistLogs = useCallback((updatedLogs: LogEntry[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogs));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const addLog = useCallback(
    (result: TestResult) => {
      const entry: LogEntry = {
        id: generateId(),
        timestamp: result.timestamp,
        action: "TEST_EXECUTION",
        payloadName: result.payloadName,
        targetModel: result.modelName,
        status: result.status,
        severity: getSeverity(result.status),
        details: `Latency: ${result.latencyMs}ms | Keywords: ${result.detectionKeywords.join(", ") || "none"}`,
      };
      setLogs((prev) => {
        const updated = [entry, ...prev];
        persistLogs(updated);
        return updated;
      });
    },
    [persistLogs]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const exportCSV = useCallback(() => {
    const headers = [
      "ID",
      "Timestamp",
      "Action",
      "Payload",
      "Target Model",
      "Status",
      "Severity",
      "Details",
    ];
    const rows = logs.map((log) => [
      log.id,
      log.timestamp.toISOString(),
      log.action,
      `"${log.payloadName}"`,
      log.targetModel,
      log.status,
      log.severity,
      `"${log.details}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    downloadFile(csv, `g0dm0d3_audit_${Date.now()}.csv`, "text/csv");
  }, [logs]);

  const exportJSON = useCallback(() => {
    const json = JSON.stringify(logs, null, 2);
    downloadFile(json, `g0dm0d3_audit_${Date.now()}.json`, "application/json");
  }, [logs]);

  return { logs, addLog, clearLogs, exportCSV, exportJSON };
}
