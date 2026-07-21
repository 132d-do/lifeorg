import { structuredOffline, type OfflineReason } from "./offline.ts";
import type { InternalOrchestrationResult } from "./orchestrate.ts";

export function legacyAgentResult(result: InternalOrchestrationResult, model?: string) {
  const contribution = (role: string) => result.contributions.find((item) => item.role.toLowerCase().includes(role))?.conclusion ?? "";
  const turn = result.turn;
  const chief = turn.status === "ready" ? turn.recommendation.recommendation : turn.status === "needs_input" ? turn.question : "评议已完成，等待幕僚长综合。";
  return {
    strategy: contribution("strategy"),
    operations: contribution("operation"),
    audit: contribution("audit"),
    chief,
    recommendation: turn.status === "ready" ? turn.recommendation.recommendation : "",
    source: "openai" as const,
    ...(model ? { model } : {}),
    turn,
  };
}

export function legacyOfflineResult(reason: OfflineReason) {
  return {
    strategy: "",
    operations: "",
    audit: "",
    chief: "",
    recommendation: "",
    source: "structured_offline" as const,
    offline: structuredOffline(reason),
  };
}
