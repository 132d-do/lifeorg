import type {
  CycleAdjustmentRequest,
  CycleCheckInRequest,
  CycleCreateRequest,
  CycleReviewRequest,
} from "./contracts.ts";
import type { CycleStatus } from "./state-machine.ts";

export type OperatingCycle = {
  id: string;
  userId: string;
  clientRequestId: string;
  activeSlot: "primary" | null;
  source: CycleCreateRequest["source"];
  commitment: string;
  startLocalDate: string;
  reviewLocalDate: string;
  timeZone: string;
  successCriterion: string;
  stopOrAdjustCondition: string;
  status: CycleStatus;
  projection: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CycleEventRecord = {
  id: string;
  userId: string;
  cycleId: string;
  clientRequestId: string;
  sequence: number;
  type: "activated" | "checked_in" | "adjusted" | "adjustment_rejected" | "stopped" | "reviewed";
  representedLocalDate: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export class CycleRepositoryError extends Error {
  readonly code: "not_found" | "invalid_state" | "idempotency_conflict" | "active_cycle_exists";

  constructor(code: "not_found" | "invalid_state" | "idempotency_conflict" | "active_cycle_exists") {
    super(code);
    this.code = code;
  }
}

export interface CycleRepository {
  createCycle(userId: string, request: CycleCreateRequest): Promise<{ cycle: OperatingCycle; created: boolean }>;
  getCurrent(userId: string): Promise<OperatingCycle | null>;
  list(userId: string): Promise<OperatingCycle[]>;
  get(userId: string, cycleId: string): Promise<OperatingCycle | null>;
  listEvents(userId: string, cycleId: string): Promise<CycleEventRecord[]>;
  appendCheckIn(userId: string, cycleId: string, request: CycleCheckInRequest): Promise<CycleEventRecord>;
  applyAdjustment(userId: string, cycleId: string, request: CycleAdjustmentRequest): Promise<OperatingCycle>;
  review(userId: string, cycleId: string, request: CycleReviewRequest): Promise<OperatingCycle>;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function cycleRequestFingerprint(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
