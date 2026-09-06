import type { Agent, AgentOutputType } from "@openai/agents";
import { chiefOfStaffAgent, operationsOfficerAgent, riskAuditorAgent, strategyArchitectAgent } from "./registry.ts";
import { AgentContributionSchema, CompletenessSchema, MeetingTurnResponseSchema, type AgentContribution, type EvidenceRecord, type MeetingTurnResponse } from "./schemas.ts";
import { meetingAgendas } from "../../agent-contracts.ts";
import { gateRecommendation } from "./quality-gate.ts";
import { classifyMeetingMode, type MeetingPolicy, type MeetingPolicyInput } from "./meeting-policy.ts";
import { AgentRunMetadataSchema, type AgentRunMetadata } from "../observability/agent-run-metadata.ts";

export function observeAgentRunMetadata(candidate: unknown, observer?: (metadata: AgentRunMetadata) => void) {
  const metadata = AgentRunMetadataSchema.parse(candidate);
  observer?.(metadata);
  return metadata;
}

export type RunRequest = {
  phase: "completeness" | "specialist" | "synthesis";
  agent: Agent<unknown, AgentOutputType>;
  input: Record<string, unknown>;
  signal: AbortSignal;
};

export type AgentExecutor = (request: RunRequest) => Promise<unknown>;
export type InternalOrchestrationResult = { turn: MeetingTurnResponse; contributions: AgentContribution[]; policy: MeetingPolicy };

type OrchestrationPacket = {
  records: EvidenceRecord[];
  topic: string;
  latestUserMessage: string;
  kind?: MeetingPolicyInput["kind"];
  reversibility?: MeetingPolicyInput["reversibility"];
  charterConflict?: boolean;
  unknownCount?: number;
  explicitDepth?: MeetingPolicyInput["explicitDepth"];
  [key: string]: unknown;
};

export async function orchestrateMeetingTurnDetailed(
  packet: OrchestrationPacket,
  execute: AgentExecutor,
): Promise<InternalOrchestrationResult> {
  packet = { ...packet, agenda: meetingAgendas[packet.kind ?? "decision"], serverNow: new Date().toISOString() };
  const policy = classifyMeetingMode({
    kind: packet.kind ?? "decision",
    reversibility: packet.reversibility ?? "low",
    charterConflict: packet.charterConflict ?? false,
    unknownCount: packet.unknownCount ?? 0,
    ...(packet.explicitDepth ? { explicitDepth: packet.explicitDepth } : {}),
  });
  const runController = new AbortController();
  const completeness = CompletenessSchema.parse(await execute({ phase: "completeness", agent: chiefOfStaffAgent, input: packet, signal: runController.signal }));
  if (!completeness.sufficient) {
    return {
      turn: {
        status: "needs_input",
        question: completeness.question ?? "请补充当前最关键的现实约束。",
        missingEvidence: completeness.missingEvidence,
      },
      contributions: [], policy,
    };
  }

  const agentsByRole = {
    strategy: strategyArchitectAgent,
    operations: operationsOfficerAgent,
    risk: riskAuditorAgent,
  } as const;
  const specialistAgents = policy.specialistRoles.map((role) => agentsByRole[role]);
  let contributions: AgentContribution[];
  try {
    contributions = await Promise.all(specialistAgents.map(async (agent) => {
      const contribution = AgentContributionSchema.parse(await execute({ phase: "specialist", agent, input: packet, signal: runController.signal }));
      if (contribution.role !== agent.name || contribution.evidenceIds.some((id) => !packet.records.some((record) => record.id === id))) {
        throw Object.assign(new Error("Invalid specialist identity or evidence"), { code: "invalid_output" });
      }
      return contribution;
    }));
  } catch (error) {
    runController.abort();
    throw error;
  }
  const synthesis = await execute({
    phase: "synthesis",
    agent: chiefOfStaffAgent,
    input: { ...packet, meetingPolicy: policy, contributions },
    signal: runController.signal,
  });
  const clarification = MeetingTurnResponseSchema.safeParse(synthesis);
  return { turn: clarification.success && clarification.data.status === "needs_input" ? clarification.data : gateRecommendation(synthesis, packet.records), contributions, policy };
}

export async function orchestrateMeetingTurn(
  packet: OrchestrationPacket,
  execute: AgentExecutor,
): Promise<MeetingTurnResponse> {
  return (await orchestrateMeetingTurnDetailed(packet, execute)).turn;
}
