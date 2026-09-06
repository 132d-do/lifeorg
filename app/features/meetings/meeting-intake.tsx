"use client";

import Link from "next/link";
import { meetingAgendas } from "../../../lib/agent-contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { ActionForm, MoodChoices } from "../../components/action-controls";
import { clearPendingOperation, pendingOperation, readPendingOperation } from "../../../lib/client/pending-operation";
import { EvidenceBoard, type EvidenceItem } from "../evidence/evidence-board";
import { protectedFetch, useLifeState } from "../shared/use-life-state";

const meetingNames: Record<string, string> = { daily: "每日站会", weekly: "周经营会", monthly: "月度战略会", decision: "专项决策会" };

export function MeetingIntake({ kind }: { kind: string }) {
  const state = useLifeState();
  const router = useRouter();
  const search = useSearchParams();
  const source = search.get("goalId") ? `goal:${search.get("goalId")}` : search.get("decisionId") ? `decision:${search.get("decisionId")}` : null;
  const agenda = meetingAgendas[kind as keyof typeof meetingAgendas] ?? meetingAgendas.decision;
  const [pending, setPending] = useState(false);
  const [energy, setEnergy] = useState(7);
  const [selectedEvidence, setSelectedEvidence] = useState(() => new Set(["profile:self", ...(source ? [source] : [])]));
  const [mood, setMood] = useState("平稳");
  const [status, setStatus] = useState("");
  const [explicitDepth, setExplicitDepth] = useState<"fast" | "deep">(kind === "decision" || kind === "monthly" ? "deep" : "fast");
  const [typedEvidence, setTypedEvidence] = useState<EvidenceItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadTypedEvidence() {
      const groups = await Promise.all(state.data.decisions.filter((decision) => selectedEvidence.has(`decision:${decision.id}`)).map(async (decision) => {
        const response = await protectedFetch(`/api/decisions/${decision.id}/evidence`);
        if (!response.ok) return [];
        const result = await response.json() as { groups?: Record<string, Array<{ id: string; kind: EvidenceItem["kind"]; title: string; content: string; verification: EvidenceItem["verification"] }>> };
        return Object.values(result.groups ?? {}).flat().map((item) => ({
          id: `evidence:${item.id}`, kind: item.kind, title: item.title,
          summary: item.content, verification: item.verification,
        }));
      }));
      if (!cancelled) setTypedEvidence(groups.flat());
    }
    void loadTypedEvidence().catch(() => { if (!cancelled) setStatus("所选决策的证据暂时读取失败，请重新选择或稍后重试。"); });
    return () => { cancelled = true; };
  }, [state.data.decisions, selectedEvidence]);

  const evidenceItems = useMemo<EvidenceItem[]>(() => [
    { id: "profile:self", kind: "profile", title: "个人经营章程", summary: state.data.profile.vision || "价值观、愿景与现实边界", verification: "record_backed", locked: true },
    ...state.data.goals.map((item) => ({ id: `goal:${item.id}`, kind: "goal" as const, title: item.title, summary: `${item.domain} · ${item.horizon} · 进度 ${item.progress}%`, verification: "record_backed" as const })),
    ...state.data.decisions.map((item) => ({ id: `decision:${item.id}`, kind: "decision" as const, title: item.title, summary: item.choice, verification: "record_backed" as const })),
    ...state.data.meetings.slice(0, 8).map((item) => ({ id: `meeting:${item.id}`, kind: "meeting" as const, title: item.title, summary: item.summary, verification: "record_backed" as const })),
    ...typedEvidence,
  ], [state.data, typedEvidence]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const topic = String(form.get("topic") || "").trim();
    const availableMinutes = String(form.get("availableMinutes") || "").trim();
    const operationKey = `lifeorg:meeting:create:${kind}`;
    setPending(true);
    try {
      const prior = readPendingOperation<Record<string, unknown>>(window.sessionStorage, operationKey);
      const evidence = evidenceItems.filter((item) => selectedEvidence.has(item.id)).map((item) => {
        const [type, ...rest] = item.id.split(":");
        const id = rest.join(":");
        return { type, id };
      });
      if (!prior && evidence.length < 2) { setStatus("请至少选择两条不同的真实记录；个人章程之外，还需要一项目标、决策或历史会议。"); return; }
      const operation = pendingOperation(window.sessionStorage, operationKey, {
        kind, topic, intake: { message: topic, energy, mood, ...(availableMinutes ? { availableMinutes: Number(availableMinutes) } : {}), deadline: String(form.get("deadline") || ""), desiredOutcome: String(form.get("desiredOutcome") || ""), constraints: String(form.get("constraints") || ""), alternatives: String(form.get("alternatives") || "").split("\n").map((line) => line.trim()).filter(Boolean), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai" }, evidence, explicitDepth,
        reversibility: String(form.get("reversibility") || "high"), unknownCount: Math.min(20, typedEvidence.filter((item) => item.kind === "unknown" && selectedEvidence.has(item.id)).length), charterConflict: Boolean(form.get("charterConflict")),
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
    finally { setPending(false); }
  }

  return <AppShell section="meetings" status={state.status}><div className="content-stack meeting-intake-flow">
    <section className="card section-card"><p className="section-kicker">GUIDED MEETING · {kind.toUpperCase()}</p><h2>准备{meetingNames[kind] || "经营会议"}</h2><p>先明确要解决的问题，再选择能支持或反驳判断的真实记录。记录编号只用于系统关联，会议里展示人能理解的标题。</p></section>
    <article className="card section-card"><ActionForm pending={pending} onSubmit={(event) => void create(event)} submitLabel="锁定材料并进入会议室">
      <label>这次必须解决的一个问题<textarea required minLength={3} name="topic" maxLength={1200} placeholder={agenda.prompt} /></label>
      <p>本次交付：{agenda.deliverables.join(" · ")}</p>
      <div className="form-grid"><label>本次时间范围内可投入多少分钟？<input name="availableMinutes" type="number" min="0" max="10080" placeholder="不确定可留空，由幕僚长追问" /></label><label>硬性截止日期<input name="deadline" type="date" /></label></div>
      <label>什么产物或结果才算推进？<textarea name="desiredOutcome" maxLength={1000} placeholder="例如：周五前完成导师能评阅的三段讨论提纲" /></label>
      <label>备选方案（每行一个，包含保持现状）<textarea name="alternatives" maxLength={3000} placeholder="集中修改论文\n先完成申请材料\n暂不新增承诺" /></label>
      <label>现实约束与必须保留的时间<textarea name="constraints" maxLength={1000} placeholder="课程、身体状态、休息、他人反馈等" /></label>
      <label>这项选择是否容易撤回？<select name="reversibility" defaultValue={kind === "decision" ? "low" : "high"}><option value="high">容易撤回，适合小步试验</option><option value="low">难以撤回，需要深度评议</option></select></label>
      <label><input type="checkbox" name="charterConflict" />可能冲突于我的核心价值或经营边界</label>
      {state.data.goals.length === 0 && <p>没有足够真实记录？<Link href="/settings/profile">先完善章程</Link>，再<Link href="/goals/new">建立一个自己的目标</Link>。</p>}
      <fieldset><legend>选择判断依据（至少两条）</legend><EvidenceBoard items={evidenceItems} selected={selectedEvidence} onToggle={(id, checked) => setSelectedEvidence((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; })} /></fieldset>
      <fieldset><legend>讨论深度</legend><div className="depth-picker"><label><input type="radio" name="explicitDepth" value="fast" checked={explicitDepth === "fast"} onChange={() => setExplicitDepth("fast")} /><span><b>快速校准</b><small>适合可逆的日常取舍，减少讨论负担</small></span></label><label><input type="radio" name="explicitDepth" value="deep" checked={explicitDepth === "deep"} onChange={() => setExplicitDepth("deep")} /><span><b>深度评议</b><small>适合申请、导师与多项目资源配置等高影响决策</small></span></label></div></fieldset>
      <label>当前精力：{energy}/10<input data-action="progress" name="energy" type="range" min="1" max="10" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} /></label>
      <MoodChoices value={mood} onChange={setMood} />
    </ActionForm>{status && <p className="notice" role="status">{status}</p>}</article>
  </div></AppShell>;
}
