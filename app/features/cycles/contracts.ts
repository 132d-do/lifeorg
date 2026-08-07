export type CycleSource =
  | { type: "approved_meeting"; meetingId: number; mutationHash: string }
  | { type: "manual_goal"; goalId: number };

export type OperatingCycle = {
  id: string;
  activeSlot: "primary" | null;
  source: CycleSource;
  commitment: string;
  startLocalDate: string;
  reviewLocalDate: string;
  timeZone: string;
  successCriterion: string;
  stopOrAdjustCondition: string;
  status: "draft" | "active" | "adjusted" | "review_due" | "stopped" | "reviewed";
  projection: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CycleEvent = {
  id: string;
  sequence: number;
  type: "activated" | "checked_in" | "adjusted" | "adjustment_rejected" | "stopped" | "reviewed";
  representedLocalDate: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CycleDetailResponse = { cycle: OperatingCycle; events: CycleEvent[] };

export type CycleViewState<T> =
  | { kind: "loading" }
  | { kind: "ready"; data: T }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export const cycleOutcomeLabels = {
  completed: "完成",
  progressed: "推进",
  blocked: "受阻",
  reduced: "缩小",
  rescheduled: "改期",
  stopped: "停止",
} as const;

export type CycleOutcome = keyof typeof cycleOutcomeLabels;

