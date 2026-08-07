"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { protectedFetch, type LifeState } from "../shared/use-life-state";
import type { CycleViewState, OperatingCycle } from "./contracts";

function projectionText(cycle: OperatingCycle, key: string, fallback: string) {
  const value = cycle.projection?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function OverviewCockpit({ data, fallback }: { data: LifeState; fallback: ReactNode }) {
  const [view, setView] = useState<CycleViewState<OperatingCycle>>({ kind: "loading" });
  useEffect(() => {
    const timer = window.setTimeout(() => void protectedFetch("/api/cycles/current").then(async (response) => {
      const body = await response.json() as { cycle?: OperatingCycle | null; error?: string };
      if (!response.ok) throw new Error(body.error || "无法读取当前周期");
      setView(body.cycle ? { kind: "ready", data: body.cycle } : { kind: "empty" });
    }).catch((error) => setView({ kind: "error", message: error instanceof Error ? error.message : "无法读取当前周期" })), 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (view.kind === "loading") return <div className="overview-grid"><section className="card hero-card"><p className="section-kicker">CURRENT COMMITMENT</p><h2>正在恢复本周期唯一承诺…</h2></section></div>;
  if (view.kind === "error") return <><div className="notice" role="alert">{view.message}；先展示已有经营记录。</div>{fallback}</>;
  if (view.kind === "empty") return <>{fallback}</>;

  const cycle = view.data;
  const smallestAction = projectionText(cycle, "smallestAction", "先完成一个 5–15 分钟、无需额外准备的最小行动");
  const blocked = data.goals.find((goal) => goal.progress < 35);
  const review = data.decisions.find((decision) => decision.status !== "reviewed");
  return <div className="overview-grid commitment-cockpit">
    <article className="hero-card card active-commitment"><div><p className="section-kicker">CURRENT COMMITMENT</p><h2>{cycle.commitment}</h2><p>本周暂不增加第二个核心承诺。所有临时事项先判断是否服务于这一结果。</p></div><div className="next-action"><span>现在可开始的最小行动</span><strong>{smallestAction}</strong></div><div className="meeting-actions"><Link className="primary-button" href={`/cycles/${cycle.id}/check-in`}>记录今天的事实</Link><Link href={`/cycles/${cycle.id}`}>打开完整周期 →</Link></div></article>
    <article className="card health-card commitment-guardrail"><div className="card-head"><h3>第七天复查</h3><span>{cycle.status}</span></div><h2>{cycle.reviewLocalDate}</h2><dl><div><dt>成功标准</dt><dd>{cycle.successCriterion}</dd></div><div><dt>调整条件</dt><dd>{cycle.stopOrAdjustCondition}</dd></div></dl><Link href={`/cycles/${cycle.id}/review`}>进入周期复盘 →</Link></article>
    <article className="brief-strip"><span>当前阻塞</span><p>{blocked ? `${blocked.title} 仍处于低进展；只处理与当前承诺直接相关的依赖。` : "尚未发现记录内的低进展阻塞；今天只需留下行动证据。"}</p><Link href={`/cycles/${cycle.id}/check-in`}>报告阻塞 →</Link></article>
    <article className="card portfolio-card"><p className="section-kicker">EVIDENCE, NOT SCORE</p><h2>用事实校准，不靠“感觉良好”</h2><p>今天记录完成、推进、受阻、缩小、改期或停止；第七天再分别评价行动完成度与建议准确度。</p><Link href={`/cycles/${cycle.id}`}>查看事实时间线 →</Link></article>
    <article className="card decision-card"><p className="section-kicker">NEXT REVIEW</p><h2>{review?.title || "暂无待复盘决策"}</h2><p>{review?.choice || "保留注意力给当前承诺，直到出现新的可验证结果。"}</p>{review && <Link href={`/decisions/${review.id}/review`}>复盘实际结果 →</Link>}</article>
  </div>;
}
