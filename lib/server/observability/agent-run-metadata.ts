import { z } from "zod";

export const AgentRunMetadataSchema = z.object({
  runId: z.string().uuid(),
  pseudonymousUserId: z.string().regex(/^[a-f0-9]{32}$/),
  meetingMode: z.enum(["fast", "deep"]),
  stage: z.enum(["completeness", "specialist", "synthesis", "orchestration"]),
  model: z.string().min(1).max(100),
  promptVersion: z.string().min(1).max(100),
  schemaVersion: z.string().min(1).max(100),
  evalVersion: z.string().min(1).max(100),
  durationMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  status: z.enum(["ready", "needs_input", "offline", "error"]),
  errorClass: z.string().max(100).nullable(),
}).strict();

export type AgentRunMetadata = z.infer<typeof AgentRunMetadataSchema>;
export type AgentRunMetadataInput = Omit<AgentRunMetadata, "pseudonymousUserId"> & { pseudonymousUserId?: never };

async function pseudonymize(trustedUserId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`lifeorg-agent-run:v1:${trustedUserId}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function createAgentRunMetadata(trustedUserId: string, input: AgentRunMetadataInput) {
  return AgentRunMetadataSchema.parse({ ...input, pseudonymousUserId: await pseudonymize(trustedUserId) });
}

type AnalyticsBinding = { writeDataPoint(point: { blobs: string[]; doubles: number[]; indexes: string[] }): void };

export function emitAgentRunMetadata(binding: AnalyticsBinding | undefined, candidate: unknown) {
  if (!binding) return;
  const metadata = AgentRunMetadataSchema.parse(candidate);
  binding.writeDataPoint({
    indexes: [metadata.pseudonymousUserId],
    blobs: [metadata.runId, metadata.meetingMode, metadata.stage, metadata.model, metadata.promptVersion, metadata.schemaVersion, metadata.evalVersion, metadata.status, metadata.errorClass ?? ""],
    doubles: [metadata.durationMs, metadata.inputTokens, metadata.outputTokens],
  });
}
