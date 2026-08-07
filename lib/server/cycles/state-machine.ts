export type CycleStatus =
  | "draft"
  | "active"
  | "adjusted"
  | "review_due"
  | "stopped"
  | "reviewed";

export type CycleLifecycle = {
  status: CycleStatus;
  activeSlot: "primary" | null;
};

export type CycleEvent =
  | { type: "activate" }
  | { type: "adjust" }
  | { type: "resume" }
  | { type: "review_due" }
  | { type: "stop" }
  | { type: "review" };

export function initialCycleLifecycle(): CycleLifecycle {
  return { status: "draft", activeSlot: null };
}

export function applyCycleEvent(current: CycleLifecycle, event: CycleEvent): CycleLifecycle {
  if (event.type === "activate" && current.status === "draft") {
    return { status: "active", activeSlot: "primary" };
  }
  if (event.type === "adjust" && current.status === "active") {
    return { status: "adjusted", activeSlot: "primary" };
  }
  if (event.type === "resume" && current.status === "adjusted") {
    return { status: "active", activeSlot: "primary" };
  }
  if (event.type === "review_due" && current.status === "active") {
    return { status: "review_due", activeSlot: "primary" };
  }
  if (event.type === "stop" && ["active", "adjusted", "review_due"].includes(current.status)) {
    return { status: "stopped", activeSlot: null };
  }
  if (event.type === "review" && ["active", "review_due", "stopped"].includes(current.status)) {
    return { status: "reviewed", activeSlot: null };
  }
  throw new Error(`Invalid cycle transition: ${current.status} -> ${event.type}`);
}
