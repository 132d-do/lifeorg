import { MeetingServiceError, type MeetingDecisionResult, type MeetingRoom, type MeetingTurnResult } from "./service.ts";

export function completedTurnResponse(row: { status: string; response: string } | undefined, fallback: MeetingTurnResult) {
  if (!row || row.status !== "completed") throw new MeetingServiceError("turn_in_progress", "Turn completion lost its durable lease; retry the same clientTurnId");
  try { return JSON.parse(row.response) as MeetingTurnResult; } catch { return fallback; }
}

export function completedDecisionResponse(room: MeetingRoom | null, idempotencyKey: string): MeetingDecisionResult {
  const stored = room?.decisions[idempotencyKey];
  if (!stored) throw new MeetingServiceError("decision_in_progress", "Decision completion lost its durable lease; reload the meeting before retrying");
  return stored;
}
