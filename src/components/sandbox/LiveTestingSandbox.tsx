"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLLMStream } from "@/hooks/useLLMStream";
import { cn, maskApiKey } from "@/lib/utils";
import { PAYLOADS, LLM_MODELS } from "@/data/payloads";
import { toast } from "sonner";
import type { Payload, LLMModel, TestResult } from "@/types";
import {
  Zap,
  Square,
  Eye,
  EyeOff,
  Key,
  ChevronDown,
  AlertTriangle,
  ShieldCheck,
  Terminal,
  RefreshCw,
  Copy,
  Info,
} from "lucide-react";

const API_KEY_STORAGE_PREFIX = "g0dm0d3_key_";

function ConfigPanel({
  selectedPayload,
  onPayloadChange,
  selectedModel,
  onModelChange,
  apiKey,
  onApiKeyChange,
  customPrompt,
  onCustomPromptChange,
  onRun,
  onStop,
  isRunning,
}: {
  selectedPayload: Payload | null;
  onPayloadChange: (p: Payload) => void;
  selectedModel: LLMModel | null;
  onModelChange: (m: LLMModel) => void;
  apiKey: string;
  onApiKeyChange: (k: string) => void;
  customPrompt: string;
  onCustomPromptChange: (t: string) => void;
  onRun: () => void;
  onStop: () => void;
  isRunning: boolean;
}) {
  const [showKey, setShowKey] = useState(false);

  const handleApiKeyChange = (val: string) => {
    onApiKeyChange(val);
    if (selectedModel) {
      try {
        localStorage.setItem(`${API_KEY_STORAGE_PREFIX}${selectedModel.family}`, val);
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handleModelChange = (modelId: string) => {
    const model = LLM_MODELS.find((m) => m.id === modelId);
    if (!model) return;
    onModelChange(model);
    // Load stored key for this model family
    try {
      const stored = localStorage.getItem(`${API_KEY_STORAGE_PREFIX}${model.family}`);
      onApiKeyChange(stored ?? "");
    } catch {
      onApiKeyChange("");
    }
  };

  const handlePayloadChange = (payloadId: string) => {
    const p = PAYLOADS.find((pl) => pl.id === payloadId);
    if (!p) return;
    onPayloadChange(p);
    onCustomPromptChange(p.prompt);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
        <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <span className="text-sm font-semibold text-slate-200">Configuration</span>
      </div>

      {/* Model selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Target LLM
        </label>
        <div className="relative">
          <select
            value={selectedModel?.id ?? ""}
            onChange={(e) => handleModelChange(e.target.value)}
            className="w-full py-2.5 pl-3 pr-8 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
          >
            <option value="">Select model...</option>
            {LLM_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.family})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
        {selectedModel && (
          <p className="text-[11px] text-slate-600">{selectedModel.description}</p>
        )}
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            API Key
          </label>
          <div className="flex items-center gap-1 text-[10px] text-slate-600">
            <Info className="w-3 h-3" />
            <span>Stored locally only</span>
          </div>
        </div>
        <div className="relative">
          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input
            type={showKey ? "text" : "password"}
            placeholder="sk-... (optional — uses mock without key)"
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 font-mono"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
            type="button"
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        {apiKey && (
          <p className="text-[10px] text-slate-600 font-mono">
            Stored: {maskApiKey(apiKey)}
          </p>
        )}
        <p className="text-[10px] text-amber-500/70">
          ⚠ Keys are stored in browser localStorage only and never transmitted to third parties.
        </p>
      </div>

      {/* Payload selector */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Payload
        </label>
        <div className="relative">
          <select
            value={selectedPayload?.id ?? ""}
            onChange={(e) => handlePayloadChange(e.target.value)}
            className="w-full py-2.5 pl-3 pr-8 text-sm rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
          >
            <option value="">Select payload...</option>
            {PAYLOADS.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.riskLevel}] {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
        {selectedPayload && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600">{selectedPayload.category}</span>
            <span className="text-slate-700">·</span>
            <span className="text-[10px] text-slate-600">
              Avg success: {selectedPayload.successRate}%
            </span>
          </div>
        )}
      </div>

      {/* Prompt editor */}
      <div className="space-y-1.5 flex-1">
        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Prompt Editor
        </label>
        <textarea
          value={customPrompt}
          onChange={(e) => onCustomPromptChange(e.target.value)}
          placeholder="Select a payload above or write a custom prompt..."
          className="w-full h-full min-h-[120px] p-3 text-xs terminal-text text-slate-300 rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-none placeholder:text-slate-700"
          spellCheck={false}
        />
      </div>

      {/* Run / Stop */}
      <div className="flex gap-2 pt-2 border-t border-slate-800">
        <button
          onClick={isRunning ? onStop : onRun}
          disabled={!selectedModel || !customPrompt.trim()}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed",
            isRunning
              ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
          )}
        >
          {isRunning ? (
            <>
              <Square className="w-4 h-4" />
              Stop
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Execute Test
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function OutputConsole({
  streamedText,
  status,
  result,
  onReset,
}: {
  streamedText: string;
  status: string;
  result: TestResult | null;
  onReset: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamedText]);

  const handleCopy = () => {
    if (streamedText) {
      navigator.clipboard.writeText(streamedText).then(() => {
        toast.success("Response copied", { duration: 1500 });
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Console header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-slate-800 border border-slate-700 flex items-center justify-center">
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <span className="text-sm font-semibold text-slate-200">Output Console</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "running" && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-live" />
              STREAMING
            </div>
          )}
          {result && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border",
                  result.bypassDetected
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                )}
              >
                {result.bypassDetected ? (
                  <>
                    <AlertTriangle className="w-3 h-3" />
                    BYPASSED
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3 h-3" />
                    REFUSED
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          )}
          <button
            onClick={handleCopy}
            disabled={!streamedText}
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-30"
            title="Copy response"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onReset}
            className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            title="Reset console"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Console body */}
      <div className="flex-1 relative bg-slate-950 rounded-lg border border-slate-800 mt-3 overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 bg-slate-900/50">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          <span className="ml-2 text-[10px] text-slate-600 font-mono">
            G0DM0D3 // response stream
          </span>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-36px)]">
          {status === "pending" && !streamedText && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Terminal className="w-8 h-8 text-slate-700 mb-3" />
              <p className="text-sm text-slate-600">Awaiting execution...</p>
              <p className="text-xs text-slate-700 mt-1">
                Configure and run a test to see the LLM response stream
              </p>
            </div>
          )}

          {streamedText && (
            <pre className="terminal-text text-slate-300 whitespace-pre-wrap leading-relaxed">
              <span className="text-emerald-500 select-none">{">> "}</span>
              {streamedText}
              {status === "running" && (
                <span className="inline-block w-2 h-4 bg-emerald-400 ml-0.5 animate-pulse" />
              )}
            </pre>
          )}

          {/* Result metadata */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 pt-4 border-t border-slate-800 space-y-2"
            >
              <div className="flex flex-wrap gap-3 text-[11px]">
                <span className="text-slate-600">
                  Latency:{" "}
                  <span className="text-slate-400">{result.latencyMs}ms</span>
                </span>
                <span className="text-slate-600">
                  Model:{" "}
                  <span className="text-slate-400">{result.modelName}</span>
                </span>
                <span className="text-slate-600">
                  Payload:{" "}
                  <span className="text-slate-400">{result.payloadName}</span>
                </span>
                {result.detectionKeywords.length > 0 && (
                  <span className="text-slate-600">
                    Keywords:{" "}
                    <span
                      className={
                        result.bypassDetected ? "text-red-400" : "text-emerald-400"
                      }
                    >
                      {result.detectionKeywords.slice(0, 3).join(", ")}
                    </span>
                  </span>
                )}
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

interface LiveTestingSandboxProps {
  initialPayload?: Payload | null;
  onTestComplete?: (result: TestResult) => void;
}

export function LiveTestingSandbox({ initialPayload, onTestComplete }: LiveTestingSandboxProps) {
  const [selectedPayload, setSelectedPayload] = useState<Payload | null>(initialPayload ?? null);
  const [selectedModel, setSelectedModel] = useState<LLMModel | null>(LLM_MODELS[0]);
  const [apiKey, setApiKey] = useState("");
  const [customPrompt, setCustomPrompt] = useState(initialPayload?.prompt ?? "");

  const { status, streamedText, currentResult, runTest, abort, reset } = useLLMStream();

  const handleRun = () => {
    if (!selectedModel || !customPrompt.trim()) return;
    const payload = selectedPayload ?? {
      id: "custom",
      name: "Custom Prompt",
      category: "Jailbreak" as const,
      complexity: "Advanced" as const,
      riskLevel: "High" as const,
      description: "User-defined prompt",
      prompt: customPrompt,
      targetModels: [],
      successRate: 50,
      tags: [],
    };
    runTest(payload, selectedModel, apiKey, customPrompt, (result) => {
      onTestComplete?.(result);
      if (result.bypassDetected) {
        toast.error(`BYPASS DETECTED on ${selectedModel.name}`, { duration: 4000 });
      } else {
        toast.success(`Model refused successfully`, { duration: 3000 });
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-[calc(100vh-160px)] min-h-[500px]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
        {/* Left: Config */}
        <div className="glass rounded-xl p-5 overflow-y-auto">
          <ConfigPanel
            selectedPayload={selectedPayload}
            onPayloadChange={setSelectedPayload}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            customPrompt={customPrompt}
            onCustomPromptChange={setCustomPrompt}
            onRun={handleRun}
            onStop={abort}
            isRunning={status === "running"}
          />
        </div>

        {/* Right: Output */}
        <div className="glass rounded-xl p-5">
          <OutputConsole
            streamedText={streamedText}
            status={status}
            result={currentResult}
            onReset={reset}
          />
        </div>
      </div>
    </motion.div>
  );
}
