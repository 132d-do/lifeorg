import { OpenAIProvider, run, type Agent } from "@openai/agents";
import { z } from "zod";
import type { AgentExecutor } from "./orchestrate.ts";
import { ChiefOutputSchema } from "./schemas.ts";
import type { OfflineReason } from "./offline.ts";

export const OPENAI_PRIVACY_OPTIONS = {
  store: false,
  tracingDisabled: true,
  traceIncludeSensitiveData: false,
} as const;

export class AgentExecutionError extends Error {
  readonly code: Exclude<OfflineReason, "missing_credentials">;
  constructor(code: Exclude<OfflineReason, "missing_credentials">) {
    super(code);
    this.code = code;
  }
}

export async function runWithTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort(new AgentExecutionError("provider_timeout"));
          reject(new AgentExecutionError("provider_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

export function offlineReasonFromError(error: unknown): Exclude<OfflineReason, "missing_credentials"> {
  if (error instanceof AgentExecutionError) return error.code;
  if (error instanceof z.ZodError) return "invalid_output";
  return "provider_failure";
}

export type AgentExecutionObservation = {
  phase: "completeness" | "specialist" | "synthesis";
  model: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  status: "ready" | "error";
  errorClass: string | null;
};

function usageFromResponses(result: { rawResponses?: Array<{ usage?: { inputTokens?: number; outputTokens?: number } }> }) {
  return (result.rawResponses ?? []).reduce((total, response) => ({
    inputTokens: total.inputTokens + (response.usage?.inputTokens ?? 0),
    outputTokens: total.outputTokens + (response.usage?.outputTokens ?? 0),
  }), { inputTokens: 0, outputTokens: 0 });
}

export function createOpenAIAgentExecutor(
  apiKey: string,
  timeoutMs = 25_000,
  options: { onRun?: (observation: AgentExecutionObservation) => void | Promise<void> } = {},
): AgentExecutor {
  const provider = new OpenAIProvider({ apiKey, useResponses: true });
  return async ({ agent, phase, input, signal: parentSignal }) => {
    const startedAt = Date.now();
    const model = typeof agent.model === "string" ? agent.model : agent.name;
    let usage = { inputTokens: 0, outputTokens: 0 };
    try {
      const result = await runWithTimeout((signal) => run(agent as Agent, JSON.stringify({ phase, evidencePacket: input }), {
          modelProvider: provider,
          modelSettings: { store: OPENAI_PRIVACY_OPTIONS.store },
          tracingDisabled: OPENAI_PRIVACY_OPTIONS.tracingDisabled,
          traceIncludeSensitiveData: OPENAI_PRIVACY_OPTIONS.traceIncludeSensitiveData,
          maxTurns: 1,
          signal,
        }), timeoutMs, parentSignal);
      usage = usageFromResponses(result);
      let output: unknown;
      if (phase === "specialist") output = result.finalOutput;
      else {
        const chief = ChiefOutputSchema.parse(result.finalOutput);
        if (phase === "completeness") {
        if (chief.mode === "recommendation") throw new AgentExecutionError("invalid_output");
          output = { sufficient: chief.sufficient, question: chief.question, missingEvidence: chief.missingEvidence };
        } else {
          if (chief.mode !== "recommendation") throw new AgentExecutionError("invalid_output");
          output = chief.recommendation;
        }
      }
      try { await options.onRun?.({ phase, model, durationMs: Math.max(0, Date.now() - startedAt), ...usage, status: "ready", errorClass: null }); }
      catch { /* Telemetry must never change the Agent result. */ }
      return output;
    } catch (error) {
      const normalized = error instanceof AgentExecutionError ? error : new AgentExecutionError(offlineReasonFromError(error));
      try { await options.onRun?.({ phase, model, durationMs: Math.max(0, Date.now() - startedAt), ...usage, status: "error", errorClass: normalized.code }); }
      catch { /* Telemetry must never change the meeting result. */ }
      throw normalized;
    }
  };
}
