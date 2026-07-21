export function findEntityById<T extends { id: string | number }>(rows: T[], id: string): T | null {
  return rows.find((row) => String(row.id) === id) ?? null;
}

export async function settleOptimistic<T>(previous: T, next: T, commit?: (value: T) => Promise<unknown>): Promise<{ value: T; status: "saved" | "failed" }> {
  try {
    await commit?.(next);
    return { value: next, status: "saved" };
  } catch {
    return { value: previous, status: "failed" };
  }
}

export function createCommitGate() {
  let inFlight: Promise<unknown> | null = null;
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      if (inFlight) return inFlight as Promise<T>;
      const operation = Promise.resolve().then(task);
      const tracked = operation.finally(() => { if (inFlight === tracked) inFlight = null; });
      inFlight = tracked;
      return tracked;
    },
  };
}

export function entityDetailState<T>(status: string, notice: string, record: T | null):
  | { kind: "error"; message: string; canRetry: true }
  | { kind: "loading" | "missing"; message: string; canRetry: false }
  | { kind: "ready"; record: T; canRetry: false } {
  if (notice) return { kind: "error", message: notice, canRetry: true };
  if (record) return { kind: "ready", record, canRetry: false };
  if (status === "个人记录已同步") return { kind: "missing", message: "未找到这条记录", canRetry: false };
  return { kind: "loading", message: "正在读取详情…", canRetry: false };
}
