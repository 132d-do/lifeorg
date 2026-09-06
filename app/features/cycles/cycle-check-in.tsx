"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { protectedFetch } from "../shared/use-life-state";
import { cycleOutcomeLabels, type CycleOutcome } from "./contracts";

function localDate() { return new Date().toLocaleDateString("en-CA"); }

export function CycleCheckIn({ id }: { id: string }) {
  const [outcome, setOutcome] = useState<CycleOutcome>("progressed");
  const [energy, setEnergy] = useState(5);
  const [protectEnergy, setProtectEnergy] = useState(false);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const lowEnergy = useMemo(() => protectEnergy || energy <= 4, [energy, protectEnergy]);
  const storageKey = `lifeorg:cycle:${id}:pending-check-in`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.sessionStorage.getItem(storageKey);
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved) as { outcome?: CycleOutcome; energy?: number; note?: string; evidence?: string };
        if (parsed.outcome) setOutcome(parsed.outcome);
        if (parsed.energy) setEnergy(parsed.energy);
        setNote(parsed.note ?? ""); setEvidence(parsed.evidence ?? "");
      } catch { window.sessionStorage.removeItem(storageKey); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  async function submit() {
    setPending(true); setStatus("正在保存今天的事实记录…");
    const prior = window.sessionStorage.getItem(storageKey);
    const payload = prior ? JSON.parse(prior) as Record<string, unknown> : {
      clientRequestId: crypto.randomUUID(), representedLocalDate: localDate(), outcome, energy, note, evidence,
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    try {
      const response = await protectedFetch(`/api/cycles/${encodeURIComponent(id)}/check-ins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string };
      if (!response.ok) { if ([400, 409, 422].includes(response.status)) window.sessionStorage.removeItem(storageKey); throw new Error(body.error || "记录失败"); }
      window.sessionStorage.removeItem(storageKey);
      setStatus("今天的事实已经加入周期时间线。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "记录失败；重试会沿用同一请求，不会重复写入。"); }
    finally { setPending(false); }
  }

  return <AppShell section="cycles" status={status || "等待今天的事实记录"}><div className="content-stack cycle-cockpit">
    <section className="card section-card"><p className="section-kicker">DAILY EVIDENCE</p><h2>今天，这个承诺发生了什么？</h2><div className="cycle-outcome-grid">{Object.entries(cycleOutcomeLabels).map(([value, label]) => <button className={outcome === value ? "selected" : ""} type="button" aria-pressed={outcome === value} onClick={() => setOutcome(value as CycleOutcome)} key={value}>{label}</button>)}</div>
      <label>今天的精力：{energy}/10<input type="range" min="1" max="10" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} /></label>
      <label><input type="checkbox" checked={protectEnergy} onChange={(event) => setProtectEnergy(event.target.checked)} /> 主动开启低精力保护</label>
      {lowEnergy && <aside className="energy-protection"><h3>低精力保护：只选一个 5–15 分钟动作</h3><p>恢复/休息 · 收集信息 · 缩小承诺。低精力不是失败信号，不要求追加第二个周期。</p></aside>}
      <label>事实备注<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="发生了什么，而不是你如何评价自己" /></label>
      <label>可验证证据<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="文档、邮件、提交记录或具体观察" /></label>
      <div className="meeting-actions"><button className="primary-button" type="button" disabled={pending} onClick={() => void submit()}>保存今天的记录</button><Link href={`/cycles/${id}`}>返回周期</Link></div>{status && <p role="status">{status}</p>}
    </section>
  </div></AppShell>;
}
