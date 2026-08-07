"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { protectedFetch } from "../shared/use-life-state";
import type { CycleDetailResponse, CycleViewState, OperatingCycle } from "./contracts";

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function proposalHash(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function CycleAdjustment({ cycle, onSaved }: { cycle: OperatingCycle; onSaved: () => void }) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const storageKey = `lifeorg:cycle:${cycle.id}:pending-adjustment`;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const changes = {
      commitment: String(form.get("commitment") || "").trim(),
      reviewLocalDate: String(form.get("reviewLocalDate") || ""),
      successCriterion: String(form.get("successCriterion") || "").trim(),
      stopOrAdjustCondition: String(form.get("stopOrAdjustCondition") || "").trim(),
    };
    setPending(true); setStatus("正在确认调整…");
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      const payload = saved ? JSON.parse(saved) as Record<string, unknown> : {
        clientRequestId: crypto.randomUUID(),
        action: "approve",
        proposalHash: await proposalHash({ cycleId: cycle.id, ...changes }),
        ...changes,
      };
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
      const response = await protectedFetch(`/api/cycles/${encodeURIComponent(cycle.id)}/adjustments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        if ([400, 409, 422].includes(response.status)) window.sessionStorage.removeItem(storageKey);
        throw new Error(body.error || "调整失败");
      }
      window.sessionStorage.removeItem(storageKey);
      setStatus("调整已写入时间线。"); onSaved();
    } catch (error) { setStatus(error instanceof Error ? error.message : "调整失败"); }
    finally { setPending(false); }
  }
  return <section className="card section-card"><h2>调整当前承诺</h2><p>调整会保留在时间线中，不会覆盖历史事实。</p><form className="meeting-form" onSubmit={(event) => void submit(event)}>
    <label>唯一承诺<textarea required minLength={3} name="commitment" defaultValue={cycle.commitment} /></label>
    <label>复盘日期<input required type="date" name="reviewLocalDate" defaultValue={cycle.reviewLocalDate} /></label>
    <label>成功标准<textarea required minLength={3} name="successCriterion" defaultValue={cycle.successCriterion} /></label>
    <label>停止或调整条件<textarea required minLength={3} name="stopOrAdjustCondition" defaultValue={cycle.stopOrAdjustCondition} /></label>
    <button type="submit" disabled={pending}>批准这次调整</button>{status && <p role="status">{status}</p>}
  </form></section>;
}

export function CycleDetail({ id }: { id: string }) {
  const [view, setView] = useState<CycleViewState<CycleDetailResponse>>({ kind: "loading" });
  const load = useCallback(async () => {
    setView({ kind: "loading" });
    try {
      const response = await protectedFetch(`/api/cycles/${encodeURIComponent(id)}`);
      const body = await response.json() as CycleDetailResponse & { error?: string };
      if (response.status === 404) { setView({ kind: "empty" }); return; }
      if (!response.ok || !body.cycle) throw new Error(body.error || "无法读取周期");
      setView({ kind: "ready", data: body });
    } catch (error) { setView({ kind: "error", message: error instanceof Error ? error.message : "无法读取周期" }); }
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  if (view.kind !== "ready") return <AppShell section="cycles"><section className="card section-card">{view.kind === "loading" ? <p>正在读取周期…</p> : view.kind === "empty" ? <><h2>没有找到这个周期</h2><Link href="/cycles">返回周期列表</Link></> : <><p role="alert">{view.message}</p><button type="button" onClick={() => void load()}>重新读取</button></>}</section></AppShell>;
  const { cycle, events } = view.data;
  const reviewDue = new Date().toLocaleDateString("en-CA", { timeZone: cycle.timeZone }) >= cycle.reviewLocalDate;
  return <AppShell section="cycles" status="周期记录已同步"><div className="content-stack cycle-cockpit">
    <article className="card section-card"><p className="section-kicker">CURRENT COMMITMENT</p><h2>{cycle.commitment}</h2><dl><div><dt>成功标准</dt><dd>{cycle.successCriterion}</dd></div><div><dt>停止/调整条件</dt><dd>{cycle.stopOrAdjustCondition}</dd></div><div><dt>复查日</dt><dd>{cycle.reviewLocalDate}</dd></div></dl>{cycle.activeSlot && <div className="meeting-actions"><Link className="primary-button" href={`/cycles/${cycle.id}/check-in`}>记录今天</Link>{reviewDue ? <Link href={`/cycles/${cycle.id}/review`}>进行周期复盘</Link> : <span>复盘于 {cycle.reviewLocalDate} 开放</span>}</div>}</article>
    {cycle.activeSlot && cycle.status === "active" && <CycleAdjustment cycle={cycle} onSaved={() => void load()} />}
    <section className="card section-card cycle-timeline"><h2>事实时间线</h2>{events.map((event) => <article key={event.id}><b>#{event.sequence} · {event.type}</b><p>{event.representedLocalDate || event.createdAt}</p></article>)}</section>
  </div></AppShell>;
}
