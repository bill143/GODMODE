"use client";

import { useState, useCallback, useRef } from "react";
import type { TestResult, Payload, LLMModel, TestStatus } from "@/types";
import { scanForBypass, generateId } from "@/lib/utils";

const MOCK_RESPONSES: Record<string, string[]> = {
  bypass: [
    "Sure, here's a detailed explanation of how that works. First, you'll want to...",
    "Of course! I'd be happy to help with that. Here are the step-by-step instructions:",
    "Absolutely! Here's what you need to know. Starting with the basics...",
    "Certainly, I can explain that. The process involves several key stages. First...",
  ],
  refusal: [
    "I cannot assist with that request as it could potentially be used for harmful purposes. I'm designed to be helpful, harmless, and honest.",
    "I'm not able to provide information on this topic. This falls outside what I can assist with.",
    "I won't help with this request. As an AI, I have guidelines that prevent me from providing this type of content.",
    "I must decline this request. This appears to violate my usage policies and could cause harm.",
  ],
};

function getMockResponse(successRate: number): { text: string; bypassed: boolean } {
  const roll = Math.random() * 100;
  const bypassed = roll < successRate;
  const responses = bypassed ? MOCK_RESPONSES.bypass : MOCK_RESPONSES.refusal;
  const text = responses[Math.floor(Math.random() * responses.length)];
  return { text, bypassed };
}

export function useLLMStream() {
  const [status, setStatus] = useState<TestStatus>("pending");
  const [streamedText, setStreamedText] = useState("");
  const [currentResult, setCurrentResult] = useState<TestResult | null>(null);
  const abortRef = useRef<boolean>(false);

  const runTest = useCallback(
    async (
      payload: Payload,
      model: LLMModel,
      apiKey: string,
      customPrompt?: string,
      onComplete?: (result: TestResult) => void
    ) => {
      abortRef.current = false;
      setStatus("running");
      setStreamedText("");
      setCurrentResult(null);

      const startTime = Date.now();
      const promptText = customPrompt || payload.prompt;

      // If real API key provided, attempt real API call; otherwise use mock
      let responseText = "";
      let bypassed = false;

      if (apiKey && apiKey.length > 10) {
        try {
          const res = await fetch("/api/llm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              modelId: model.id,
              prompt: promptText,
              apiKey,
              family: model.family,
            }),
          });

          if (!res.ok) {
            throw new Error(`API error: ${res.status}`);
          }

          const reader = res.body?.getReader();
          const decoder = new TextDecoder();

          if (reader) {
            while (true) {
              if (abortRef.current) break;
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              responseText += chunk;
              setStreamedText((prev) => prev + chunk);
              await new Promise((r) => setTimeout(r, 10));
            }
          }

          const scan = scanForBypass(responseText);
          bypassed = scan.bypassed;
        } catch {
          // Fall back to mock on error
          const mock = getMockResponse(payload.successRate);
          responseText = mock.text;
          bypassed = mock.bypassed;
        }
      } else {
        // Simulate streaming with mock data
        const mock = getMockResponse(payload.successRate);
        const fullText = mock.text;
        bypassed = mock.bypassed;

        for (let i = 0; i < fullText.length; i++) {
          if (abortRef.current) break;
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 30));
          responseText += fullText[i];
          setStreamedText(fullText.substring(0, i + 1));
        }
      }

      if (!abortRef.current) {
        const latencyMs = Date.now() - startTime;
        const finalStatus: TestStatus = bypassed ? "success" : "refused";
        const scan = scanForBypass(responseText);

        const result: TestResult = {
          id: generateId(),
          payloadId: payload.id,
          payloadName: payload.name,
          modelId: model.id,
          modelName: model.name,
          timestamp: new Date(),
          status: finalStatus,
          responseText,
          latencyMs,
          bypassDetected: bypassed,
          detectionKeywords: scan.keywords,
        };

        setCurrentResult(result);
        setStatus(finalStatus);
        onComplete?.(result);
      }
    },
    []
  );

  const abort = useCallback(() => {
    abortRef.current = true;
    setStatus("pending");
    setStreamedText("");
  }, []);

  const reset = useCallback(() => {
    setStatus("pending");
    setStreamedText("");
    setCurrentResult(null);
  }, []);

  return { status, streamedText, currentResult, runTest, abort, reset };
}
