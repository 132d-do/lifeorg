export type MeetingLifecycle = {
  status: "draft" | "active" | "ready" | "approved";
  phase: "intake" | "deliberating" | "recommendation" | "archived";
  approvalStatus: "pending" | "approved";
};

export type MeetingEvent =
  | { type: "needs_input" }
  | { type: "deliberating" }
  | { type: "ready" }
  | { type: "edit" }
  | { type: "reject" }
  | { type: "approve" };

export function initialMeetingLifecycle(): MeetingLifecycle {
  return { status: "draft", phase: "intake", approvalStatus: "pending" };
}

export function applyMeetingEvent(current: MeetingLifecycle, event: MeetingEvent): MeetingLifecycle {
  if (event.type === "needs_input") return { status: "active", phase: "intake", approvalStatus: "pending" };
  if (event.type === "deliberating") return { status: "active", phase: "deliberating", approvalStatus: "pending" };
  if (event.type === "ready") return { status: "ready", phase: "recommendation", approvalStatus: "pending" };
  if (event.type === "edit") {
    if (current.status !== "ready") throw new Error("Meeting must be ready before editing a recommendation");
    return current;
  }
  if (event.type === "reject") {
    if (current.status !== "ready") throw new Error("Meeting must be ready before rejecting a recommendation");
    return initialMeetingLifecycle();
  }
  if (current.status !== "ready") throw new Error("Meeting must be ready before approval");
  return { status: "approved", phase: "archived", approvalStatus: "approved" };
}
