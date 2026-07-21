import { OpenAIProvider, run, type Agent } from "@openai/agents";
import { z } from "zod";
import type { AgentExecutor } from "./orchestrate.ts";
import { ChiefOutputSchema } from "./schemas.ts";
import type { OfflineReason } from "./offline.ts";

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

export function createOpenAIAgentExecutor(apiKey: string, timeoutMs = 25_000): AgentExecutor {
  const provider = new OpenAIProvider({ apiKey, useResponses: true });
  return async ({ agent, phase, input, signal: parentSignal }) => {
    try {
      const result = await runWithTimeout((signal) => run(agent as Agent, JSON.stringify({ phase, evidencePacket: input }), {
          modelProvider: provider,
          modelSettings: { store: false },
          tracingDisabled: true,
          traceIncludeSensitiveData: false,
          maxTurns: 1,
          signal,
        }), timeoutMs, parentSignal);
      if (phase === "specialist") return result.finalOutput;
      const chief = ChiefOutputSchema.parse(result.finalOutput);
      if (phase === "completeness") {
        if (chief.mode === "recommendation") throw new AgentExecutionError("invalid_output");
        return { sufficient: chief.sufficient, question: chief.question, missingEvidence: chief.missingEvidence };
      }
      if (chief.mode !== "recommendation") throw new AgentExecutionError("invalid_output");
      return chief.recommendation;
    } catch (error) {
      if (error instanceof AgentExecutionError) throw error;
      throw new AgentExecutionError(offlineReasonFromError(error));
    }
  };
}
