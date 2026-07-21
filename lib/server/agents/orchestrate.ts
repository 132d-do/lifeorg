import type { Agent } from "@openai/agents";
import { chiefOfStaffAgent, operationsOfficerAgent, riskAuditorAgent, strategyArchitectAgent } from "./registry.ts";
import { AgentContributionSchema, CompletenessSchema, type AgentContribution, type EvidenceRecord, type MeetingTurnResponse } from "./schemas.ts";
import { gateRecommendation } from "./quality-gate.ts";

export type RunRequest = {
  phase: "completeness" | "specialist" | "synthesis";
  agent: Agent;
  input: Record<string, unknown>;
  signal: AbortSignal;
};

export type AgentExecutor = (request: RunRequest) => Promise<unknown>;
export type InternalOrchestrationResult = { turn: MeetingTurnResponse; contributions: AgentContribution[] };

export async function orchestrateMeetingTurnDetailed(
  packet: { records: EvidenceRecord[]; topic: string; latestUserMessage: string },
  execute: AgentExecutor,
): Promise<InternalOrchestrationResult> {
  const runController = new AbortController();
  const completeness = CompletenessSchema.parse(await execute({ phase: "completeness", agent: chiefOfStaffAgent, input: packet, signal: runController.signal }));
  if (!completeness.sufficient) {
    return {
      turn: {
        status: "needs_input",
        question: completeness.question ?? "请补充当前最关键的现实约束。",
        missingEvidence: completeness.missingEvidence,
      },
      contributions: [],
    };
  }

  const specialistAgents = [strategyArchitectAgent, operationsOfficerAgent, riskAuditorAgent];
  let contributions: AgentContribution[];
  try {
    contributions = await Promise.all(specialistAgents.map(async (agent) =>
      AgentContributionSchema.parse(await execute({ phase: "specialist", agent, input: packet, signal: runController.signal })),
    ));
  } catch (error) {
    runController.abort();
    throw error;
  }
  const synthesis = await execute({
    phase: "synthesis",
    agent: chiefOfStaffAgent,
    input: { ...packet, contributions },
    signal: runController.signal,
  });
  return { turn: gateRecommendation(synthesis, packet.records), contributions };
}

export async function orchestrateMeetingTurn(
  packet: { records: EvidenceRecord[]; topic: string; latestUserMessage: string },
  execute: AgentExecutor,
): Promise<MeetingTurnResponse> {
  return (await orchestrateMeetingTurnDetailed(packet, execute)).turn;
}
