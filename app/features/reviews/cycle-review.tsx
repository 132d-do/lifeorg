"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { protectedFetch } from "../shared/use-life-state";
import type { OperatingCycle } from "../cycles/contracts";

export function CycleReview({ id }: { id: string }) {
  const [cycle, setCycle] = useState<OperatingCycle | null>(null);
  const [status, setStatus] = useState("正在读取周期…");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => void protectedFetch(`/api/cycles/${encodeURIComponent(id)}`).then(async (response) => {
      const body = await response.json() as { cycle?: OperatingCycle; error?: string };
      if (!response.ok || !body.cycle) throw new Error(body.error || "无法读取周期");
      setCycle(body.cycle); setStatus("请只根据实际结果评分");
    }).catch((error) => setStatus(error instanceof Error ? error.message : "无法读取周期")), 0);
    return () => window.clearTimeout(timer);
  }, [id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!cycle) return;
    setPending(true);
    const form = new FormData(event.currentTarget);
    const storageKey = `lifeorg:cycle:${id}:pending-review`;
    const prior = window.sessionStorage.getItem(storageKey);
    const payload = prior ? JSON.parse(prior) as Record<string, unknown> : {
      clientRequestId: crypto.randomUUID(), observedEvidence: String(form.get("observedEvidence") || ""),
      actionCompletion: Number(form.get("actionCompletion")),
      recommendationAccuracy: cycle.source.type === "manual_goal" ? null : Number(form.get("recommendationAccuracy")),
      decisionValue: Number(form.get("decisionValue")),
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    try {
      const response = await protectedFetch(`/api/cycles/${encodeURIComponent(id)}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "复盘保存失败");
      window.sessionStorage.removeItem(storageKey); setStatus("周期已复盘，原建议与结果评分均已保留。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "复盘保存失败"); }
    finally { setPending(false); }
  }

  return <AppShell section="cycles" status={status}><section className="card section-card cycle-cockpit"><p className="section-kicker">DAY-SEVEN REVIEW</p><h2>{cycle?.commitment || "周期复盘"}</h2><form className="meeting-form" onSubmit={(event) => void submit(event)}><label>实际观察到的证据<textarea required name="observedEvidence" /></label><label>行动完成度（1–5）<input required name="actionCompletion" type="number" min="1" max="5" defaultValue="3" /></label><label>Agent 建议准确度（1–5）<input required name="recommendationAccuracy" type="number" min="1" max="5" defaultValue="3" disabled={cycle?.source.type === "manual_goal"} /></label><label>这个决定的价值（1–5）<input required name="decisionValue" type="number" min="1" max="5" defaultValue="3" /></label><button className="primary-button" type="submit" disabled={pending || !cycle}>完成周期复盘</button><Link href={`/cycles/${id}`}>返回周期</Link></form></section></AppShell>;
}

