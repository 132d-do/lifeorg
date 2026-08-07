"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { protectedFetch } from "../shared/use-life-state";
import type { CycleViewState, OperatingCycle } from "./contracts";

export function CycleList() {
  const [view, setView] = useState<CycleViewState<OperatingCycle[]>>({ kind: "loading" });
  useEffect(() => {
    const timer = window.setTimeout(() => void protectedFetch("/api/cycles").then(async (response) => {
      const body = await response.json() as { cycles?: OperatingCycle[]; error?: string };
      if (!response.ok || !body.cycles) throw new Error(body.error || "无法读取经营周期");
      setView(body.cycles.length ? { kind: "ready", data: body.cycles } : { kind: "empty" });
    }).catch((error) => setView({ kind: "error", message: error instanceof Error ? error.message : "无法读取经营周期" })), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <AppShell section="cycles" status={view.kind === "loading" ? "正在读取当前周期…" : "周期记录已同步"}>
    <div className="content-stack cycle-cockpit">
      <section className="card section-card"><p className="section-kicker">SEVEN-DAY OPERATING CYCLE</p><h2>一次只经营一个可验证承诺</h2><p>会议建议只有在你批准后才会进入周期；每天记录事实，第七天用结果校准判断。</p></section>
      {view.kind === "loading" && <section className="card section-card"><p>正在读取周期…</p></section>}
      {view.kind === "error" && <section className="notice" role="alert">{view.message}</section>}
      {view.kind === "empty" && <section className="card section-card"><h2>还没有经营周期</h2><p>从一个已有目标手动开始，或先召集决策会形成有证据的建议。</p><div className="meeting-actions"><Link className="primary-button" href="/cycles/new">手动开启周期</Link><Link href="/meetings/new/decision">召集决策会</Link></div></section>}
      {view.kind === "ready" && <div className="meeting-actions"><Link className="primary-button" href="/cycles/new">从目标开启新周期</Link><Link href="/meetings/new/decision">先开决策会</Link></div>}
      {view.kind === "ready" && view.data.map((cycle) => <article className="card section-card" key={cycle.id}><div className="section-title"><div><p className="section-kicker">{cycle.activeSlot ? "CURRENT COMMITMENT" : "ARCHIVE"}</p><h2><Link href={`/cycles/${cycle.id}`}>{cycle.commitment}</Link></h2></div><span>{cycle.status}</span></div><p>复查日：{cycle.reviewLocalDate} · 成功标准：{cycle.successCriterion}</p><Link href={`/cycles/${cycle.id}`}>打开周期详情 →</Link></article>)}
    </div>
  </AppShell>;
}
