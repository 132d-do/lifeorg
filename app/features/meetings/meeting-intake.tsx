"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { ActionForm, MoodChoices } from "../../components/action-controls";
import { clearPendingOperation, pendingOperation, readPendingOperation } from "../../../lib/client/pending-operation";
import { EvidenceBoard, type EvidenceItem } from "../evidence/evidence-board";
import { protectedFetch, useLifeState } from "../shared/use-life-state";

const meetingNames: Record<string, string> = { daily: "每日站会", weekly: "周经营会", monthly: "月度战略会", decision: "专项决策会" };

export function MeetingIntake({ kind }: { kind: string }) {
  const state = useLifeState();
  const router = useRouter();
  const [selectedEvidence, setSelectedEvidence] = useState(() => new Set(["profile:self"]));
  const [mood, setMood] = useState("平稳");
  const [status, setStatus] = useState("");
  const [explicitDepth, setExplicitDepth] = useState<"fast" | "deep">(kind === "decision" || kind === "monthly" ? "deep" : "fast");

  const evidenceItems = useMemo<EvidenceItem[]>(() => [
    { id: "profile:self", kind: "profile", title: "个人经营章程", summary: state.data.profile.vision || "价值观、愿景与现实边界", verification: "record_backed", locked: true },
    ...state.data.goals.map((item) => ({ id: `goal:${item.id}`, kind: "goal" as const, title: item.title, summary: `${item.domain} · ${item.horizon} · 进度 ${item.progress}%`, verification: "record_backed" as const })),
    ...state.data.decisions.map((item) => ({ id: `decision:${item.id}`, kind: "decision" as const, title: item.title, summary: item.choice, verification: "record_backed" as const })),
    ...state.data.meetings.slice(0, 8).map((item) => ({ id: `meeting:${item.id}`, kind: "meeting" as const, title: item.title, summary: item.summary, verification: "record_backed" as const })),
  ], [state.data]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const topic = String(form.get("topic") || "").trim();
    const energy = Number(form.get("energy") || 7);
    const operationKey = `lifeorg:meeting:create:${kind}`;
    try {
      const prior = readPendingOperation<Record<string, unknown>>(window.sessionStorage, operationKey);
      const evidence = evidenceItems.filter((item) => selectedEvidence.has(item.id)).map((item) => {
        const [type, id] = item.id.split(":");
        return { type, id };
      });
      if (!prior && evidence.length < 2) { setStatus("请至少选择两条不同的真实记录；个人章程之外，还需要一项目标、决策或历史会议。"); return; }
      const operation = pendingOperation(window.sessionStorage, operationKey, {
        kind, topic, intake: { message: topic, energy, mood }, evidence, explicitDepth,
        reversibility: kind === "decision" ? "low" : "high", unknownCount: 0, charterConflict: false,
      });
      const response = await protectedFetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation.payload, clientRequestId: operation.id }) });
      const created = await response.json() as { meetingId?: string; error?: string };
      if (!response.ok || !created.meetingId) {
        if ([400, 409, 422].includes(response.status)) clearPendingOperation(window.sessionStorage, operationKey, operation.id);
        throw new Error(created.error || "会议创建失败。");
      }
      clearPendingOperation(window.sessionStorage, operationKey, operation.id);
      setStatus("会议材料已锁定，正在进入会议室。");
      router.push(`/meetings/${created.meetingId}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "会议创建失败，请重试。"); }
  }

  return <AppShell section="meetings" status={state.status}><div className="content-stack meeting-intake-flow">
    <section className="card section-card"><p className="section-kicker">GUIDED MEETING · {kind.toUpperCase()}</p><h2>准备{meetingNames[kind] || "经营会议"}</h2><p>先明确要解决的问题，再选择能支持或反驳判断的真实记录。记录编号只用于系统关联，会议里展示人能理解的标题。</p></section>
    <article className="card section-card"><ActionForm onSubmit={(event) => void create(event)} submitLabel="锁定材料并进入会议室">
      <label>这次必须解决的一个问题<textarea required minLength={3} name="topic" placeholder="例如：未来 7 天是否应暂停论文支线，把主要精力投入夏令营材料？" /></label>
      <fieldset><legend>选择判断依据（至少两条）</legend><EvidenceBoard items={evidenceItems} selected={selectedEvidence} onToggle={(id, checked) => setSelectedEvidence((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; })} /></fieldset>
      <fieldset><legend>讨论深度</legend><div className="depth-picker"><label><input type="radio" name="explicitDepth" value="fast" checked={explicitDepth === "fast"} onChange={() => setExplicitDepth("fast")} /><span><b>快速校准</b><small>适合可逆的日常取舍，减少讨论负担</small></span></label><label><input type="radio" name="explicitDepth" value="deep" checked={explicitDepth === "deep"} onChange={() => setExplicitDepth("deep")} /><span><b>深度评议</b><small>适合申请、导师与多项目资源配置等高影响决策</small></span></label></div></fieldset>
      <label>当前精力<input data-action="progress" name="energy" type="range" min="1" max="10" defaultValue="7" /></label>
      <MoodChoices value={mood} onChange={setMood} />
    </ActionForm>{status && <p className="notice" role="status">{status}</p>}</article>
  </div></AppShell>;
}
