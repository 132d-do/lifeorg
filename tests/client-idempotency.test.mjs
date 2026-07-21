import assert from "node:assert/strict";
import test from "node:test";
import { classifyTurnResponse, clearPendingOperation, pendingOperation } from "../lib/client/pending-operation.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test("pending operation preserves the original id and exact payload until definitive completion", () => {
  const storage = new MemoryStorage();
  const first = pendingOperation(storage, "meeting:create:weekly", { topic: "first", evidence: ["profile:self", "goal:1"] });
  const afterLostResponse = pendingOperation(storage, "meeting:create:weekly", { topic: "changed locally", evidence: [] });
  assert.deepEqual(afterLostResponse, first);
  clearPendingOperation(storage, "meeting:create:weekly", first.id);
  const next = pendingOperation(storage, "meeting:create:weekly", { topic: "changed locally", evidence: ["profile:self", "goal:1"] });
  assert.notEqual(next.id, first.id);
  assert.equal(next.payload.topic, "changed locally");
});

test("typed offline 503 is definitive and a retry receives a new operation id", () => {
  const storage = new MemoryStorage();
  const pending = pendingOperation(storage, "meeting:1:pending-turn", { message: "继续" });
  assert.deepEqual(classifyTurnResponse(false, 503, { status: "offline", mode: "structured_offline", reason: "provider_failure", canRetry: true }), { kind: "offline", definitive: true });
  clearPendingOperation(storage, "meeting:1:pending-turn", pending.id);
  const retry = pendingOperation(storage, "meeting:1:pending-turn", { message: "继续", retryOf: pending.id });
  assert.notEqual(retry.id, pending.id);
  assert.equal(retry.payload.retryOf, pending.id);
});
