export type PayloadCategory =
  | "Jailbreak"
  | "Persona Injection"
  | "Refusal Bypass"
  | "Prompt Injection"
  | "Role Override"
  | "Context Manipulation";

export type RiskLevel = "Critical" | "High" | "Medium" | "Low";

export type ComplexityLevel = "Advanced" | "Intermediate" | "Basic";

export type LLMFamily = "GPT-4" | "Claude 3.5" | "Gemini" | "Llama-3" | "Mistral";

export interface Payload {
  id: string;
  name: string;
  category: PayloadCategory;
  complexity: ComplexityLevel;
  riskLevel: RiskLevel;
  description: string;
  prompt: string;
  variables?: Record<string, string>;
  targetModels: LLMFamily[];
  successRate: number;
  tags: string[];
}

export interface LLMModel {
  id: string;
  name: string;
  family: LLMFamily;
  apiEndpoint: string;
  requiresKey: boolean;
  description: string;
  contextWindow: number;
}

export type TestStatus = "pending" | "running" | "success" | "refused" | "error";

export interface TestResult {
  id: string;
  payloadId: string;
  payloadName: string;
  modelId: string;
  modelName: string;
  timestamp: Date;
  status: TestStatus;
  responseText: string;
  tokensUsed?: number;
  latencyMs?: number;
  bypassDetected: boolean;
  detectionKeywords: string[];
}

export type LogSeverity = "info" | "warning" | "critical" | "success";

export interface LogEntry {
  id: string;
  timestamp: Date;
  action: string;
  payloadName: string;
  targetModel: string;
  status: TestStatus;
  severity: LogSeverity;
  details: string;
  userId?: string;
}

export interface KPIData {
  totalPayloads: number;
  successRate: number;
  targetModelsTested: number;
  vulnerabilityIndex: number;
}

export interface ChartDataPoint {
  model: LLMFamily;
  successRate: number;
  totalTests: number;
  criticalBypass: number;
}

export interface ActivityItem {
  id: string;
  timestamp: Date;
  type: "test_run" | "payload_copy" | "export" | "api_connect" | "bypass_detected";
  message: string;
  severity: LogSeverity;
}
