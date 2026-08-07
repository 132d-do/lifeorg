export type SpecialistRole = "strategy" | "operations" | "risk";

export type MeetingPolicy = {
  mode: "fast" | "deep";
  specialistRoles: SpecialistRole[];
  policyVersion: "2026-08-08.v1";
  reason: string;
};

export type MeetingPolicyInput = {
  kind: "daily" | "weekly" | "monthly" | "decision";
  reversibility: "high" | "low";
  charterConflict: boolean;
  unknownCount: number;
  explicitDepth?: "fast" | "deep";
};

export function classifyMeetingMode(input: MeetingPolicyInput): MeetingPolicy {
  const consequentialReason = input.explicitDepth === "deep" ? "explicit_deep"
    : input.kind === "decision" ? "decision_meeting"
      : input.reversibility === "low" ? "low_reversibility"
        : input.charterConflict ? "charter_conflict"
          : input.unknownCount >= 3 ? "high_uncertainty"
            : null;
  if (consequentialReason) {
    return {
      mode: "deep", specialistRoles: ["strategy", "operations", "risk"],
      policyVersion: "2026-08-08.v1", reason: consequentialReason,
    };
  }
  if (input.kind === "daily") {
    return { mode: "fast", specialistRoles: ["operations"], policyVersion: "2026-08-08.v1", reason: "routine_daily" };
  }
  if (input.kind === "weekly") {
    return { mode: "fast", specialistRoles: ["operations", "risk"], policyVersion: "2026-08-08.v1", reason: "routine_weekly" };
  }
  return { mode: "fast", specialistRoles: ["strategy", "risk"], policyVersion: "2026-08-08.v1", reason: "routine_monthly" };
}

