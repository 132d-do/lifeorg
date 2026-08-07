"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../../components/app-shell";
import { protectedFetch } from "../shared/use-life-state";
import type { CycleDetailResponse, CycleViewState } from "./contracts";

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
  return <AppShell section="cycles" status="周期记录已同步"><div className="content-stack cycle-cockpit">
    <article className="card section-card"><p className="section-kicker">CURRENT COMMITMENT</p><h2>{cycle.commitment}</h2><dl><div><dt>成功标准</dt><dd>{cycle.successCriterion}</dd></div><div><dt>停止/调整条件</dt><dd>{cycle.stopOrAdjustCondition}</dd></div><div><dt>复查日</dt><dd>{cycle.reviewLocalDate}</dd></div></dl>{cycle.activeSlot && <div className="meeting-actions"><Link className="primary-button" href={`/cycles/${cycle.id}/check-in`}>记录今天</Link><Link href={`/cycles/${cycle.id}/review`}>进行周期复盘</Link></div>}</article>
    <section className="card section-card cycle-timeline"><h2>事实时间线</h2>{events.map((event) => <article key={event.id}><b>#{event.sequence} · {event.type}</b><p>{event.representedLocalDate || event.createdAt}</p></article>)}</section>
  </div></AppShell>;
}

