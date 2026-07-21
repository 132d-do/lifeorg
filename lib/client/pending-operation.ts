export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PendingOperation<T> = { id: string; payload: T };

export function pendingOperation<T>(storage: StorageLike, key: string, payload: T): PendingOperation<T> {
  const serialized = storage.getItem(key);
  if (serialized) {
    try {
      const prior = JSON.parse(serialized) as PendingOperation<T>;
      if (typeof prior.id === "string" && prior.id && "payload" in prior) return prior;
    } catch { storage.removeItem(key); }
  }
  const created = { id: crypto.randomUUID(), payload };
  storage.setItem(key, JSON.stringify(created));
  return created;
}

export function readPendingOperation<T>(storage: StorageLike, key: string): PendingOperation<T> | null {
  const serialized = storage.getItem(key);
  if (!serialized) return null;
  try {
    const prior = JSON.parse(serialized) as PendingOperation<T>;
    return typeof prior.id === "string" && prior.id && "payload" in prior ? prior : null;
  } catch { return null; }
}

export function clearPendingOperation(storage: StorageLike, key: string, id: string) {
  const prior = readPendingOperation<unknown>(storage, key);
  if (prior?.id === id) storage.removeItem(key);
}

export function classifyTurnResponse(ok: boolean, httpStatus: number, result: { status?: string }) {
  if (result.status === "offline") return { kind: "offline" as const, definitive: true as const };
  if (!ok) return { kind: "error" as const, definitive: [400, 404, 422].includes(httpStatus) };
  return { kind: "success" as const, definitive: true as const };
}
