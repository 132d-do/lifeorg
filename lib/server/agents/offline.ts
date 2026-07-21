export type OfflineReason = "missing_credentials" | "provider_timeout" | "invalid_output" | "provider_failure";

export function structuredOffline(reason: OfflineReason) {
  return {
    mode: "structured_offline" as const,
    reason,
    canRecordPersonalJudgment: true,
    contributions: [] as never[],
  };
}
