"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AppShell } from "./app-shell";
import { ActionForm, MoodChoices, ProgressControl, ReminderToggle } from "./action-controls";
import { entityDetailState, findEntityById } from "../../lib/ui-contract";
import { classifyTurnResponse, clearPendingOperation, pendingOperation, readPendingOperation } from "../../lib/client/pending-operation";
import { protectedFetch, useLifeState, type LifeState } from "../features/shared/use-life-state";
import { OverviewCockpit } from "../features/cycles/overview-cockpit";
import { MessageContent, recordHref } from "../features/meetings/message-content";
import { AgentDirectory } from "../features/settings/agent-directory";
import { RecommendationEffects } from "../features/meetings/recommendation-effects";

export type Workspace = "overview" | "meetings" | "goals" | "decisions" | "insights" | "settings";
function meetingApprovalKey(meetingId: string) {
  const storageKey = `lifeorg:meeting:${meetingId}:approval-key`;
  const prior = window.sessionStorage.getItem(storageKey);
  if (prior) return prior;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, created);
  return created;
}

export function LifeOrgClient({ view }: { view: Workspace }) {
  const state = useLifeState();
  return <AppShell section={view} status={state.status}>
    {state.notice && <div className="notice" role="alert"><span>{state.notice}</span><button data-action="retry" type="button" onClick={state.retry}>重新连接</button></div>}
    {view === "overview" && <Overview data={state.data} />}
    {view === "meetings" && <Meetings data={state.data} />}
    {view === "goals" && <Goals data={state.data} mutate={state.mutate} />}
    {view === "decisions" && <Decisions data={state.data} />}
    {view === "insights" && <Insights data={state.data} />}
    {view === "settings" && <Settings data={state.data} mutate={state.mutate} />}
  </AppShell>;
}

function Overview({ data }: { data: LifeState }) {
  const pending = data.meetings.filter((meeting) => meeting.lifecycleStatus === "ready" && meeting.approvalStatus === "pending");
  return <div className="content-stack">{pending.length > 0 && <section className="card section-card"><h2>等待你批准 · {pending.length}</h2><div className="decision-list">{pending.map((meeting) => <Link key={meeting.id} href={`/meetings/${meeting.id}`}>{meeting.topic || meeting.title} → 查看证据与批准影响</Link>)}</div></section>}<OverviewCockpit data={data} fallback={<OverviewWithoutActiveCycle data={data} />} /></div>;
}

function OverviewWithoutActiveCycle({ data }: { data: LifeState }) {
  const review = data.decisions.find((decision) => decision.status !== "reviewed");
  const active = data.goals.filter((goal) => goal.status === "active");
  return <div className="overview-grid">
    <article className="hero-card card"><div><p className="section-kicker">ONE REAL COMMITMENT</p><h2>先选一件真正值得完成的事。</h2><p>你还没有进行中的行动周期。先记录自己的目标，再由会议帮助取舍；也可以直接建立一个七天承诺。</p></div><div className="meeting-actions"><Link className="primary-button" href={active.length ? "/cycles/new" : "/goals/new"}>{active.length ? "选定七天唯一承诺" : "建立我的第一个目标"}</Link><Link href="/meetings/new/daily">和幕僚长讨论</Link></div></article>
    <article className="card section-card"><h2>先确认个人经营边界</h2><p>{data.profile.constraints || "目前没有记录现实约束。休息、课程和重要关系也应被保护。"}</p><Link href="/settings/profile">完善章程与容量边界 →</Link></article>
    <article className="card section-card"><h2>目标组合需要你的取舍</h2><p>进行中 {active.length} 项。进度是自报记录，不代表阻塞、价值或健康评分。</p><Link href="/goals">检查目标与暂停事项 →</Link></article>
    <article className="card section-card"><h2>下一项决策复盘</h2>{review ? <><h3>{review.title}</h3><p>{review.choice}</p><Link href={`/decisions/${review.id}/review`}>记录实际结果 →</Link></> : <><p>尚无待复盘决策。</p><Link href="/decisions/new">记录一个自己的判断 →</Link></>}</article>
  </div>;
}

function Meetings({ data }: { data: LifeState }) {
  const kinds = [["daily", "01", "每日站会", "事实 · 一个结果 · 一个阻塞"], ["weekly", "02", "周经营会", "成果 · 资源 · 风险 · 下周承诺"], ["monthly", "03", "月度战略会", "方向 · 目标组合 · 停止事项"], ["decision", "04", "专项决策会", "选项 · 证据 · 机会成本 · 停止条件"]] as const;
  return <div className="content-stack"><div className="meeting-types">{kinds.map(([kind, number, title, detail]) => <article className="card meeting-type" key={kind}><span>{number}</span><h2>{title}</h2><p>{detail}</p><Link href={`/meetings/new/${kind}`}>准备并召集 →</Link></article>)}</div><section className="card section-card"><div className="section-title"><div><p className="section-kicker">MEETING ARCHIVE</p><h2>会议档案</h2></div><span>{data.meetings.length} 条记录（最近 60 条）</span></div><div className="timeline">{data.meetings.length ? data.meetings.map((meeting) => <article key={meeting.id}><span className="timeline-dot" /><div><h3><Link href={`/meetings/${meeting.id}`}>{meeting.topic || meeting.title}</Link></h3><p>{meeting.lifecycleStatus === "ready" ? "等待批准" : meeting.lifecycleStatus === "approved" ? "已批准归档" : "继续会议"} · {meeting.summary}</p></div><div className="meeting-meta">{meeting.energy ? `精力 ${meeting.energy}/10` : "战略复盘"}</div></article>) : <p className="empty">完成第一场会议后，记录会出现在这里。</p>}</div></section></div>;
}

function Goals({ data, mutate }: { data: LifeState; mutate: (action: string, payload: Record<string, unknown>) => Promise<LifeState> }) {
  return <div className="content-stack"><div className="toolbar"><div><b>{data.goals.length}</b><span>个已记录目标（含暂停和完成）</span></div><Link className="primary-button" href="/goals/new">＋ 新建目标</Link></div><div className="goal-grid">{data.goals.map((goal) => <article className="card goal-card" key={goal.id}><div><span className="tag">{goal.domain}</span><span className="tag pale">{goal.horizon}</span></div><h2><Link href={`/goals/${goal.id}`}>{goal.title}</Link></h2><span className="tag">{goal.status === "active" ? "进行中" : goal.status === "paused" ? "暂停" : "完成"}</span><p>{goal.why || "尚未记录这个目标值得投入的理由。"}</p><div className="goal-bottom"><ProgressControl label={goal.title} value={goal.progress} onCommit={(progress) => mutate("goal.progress", { id: goal.id, progress })} /></div></article>)}</div></div>;
}

function Decisions({ data }: { data: LifeState }) {
  return <div className="content-stack"><div className="toolbar"><div><b>{data.decisions.length}</b><span>项有记录的判断</span></div><Link className="primary-button" href="/decisions/new">＋ 记录我的决策</Link></div><article className="card decision-card"><div className="decision-list">{data.decisions.map((decision) => <div className="decision-row" key={decision.id}><span className={`decision-mark ${decision.status === "reviewed" ? "done" : ""}`}>{decision.status === "reviewed" ? "✓" : "?"}</span><div><h3><Link href={`/decisions/${decision.id}`}>{decision.title}</Link></h3><p>{decision.choice} · {decision.reason || "尚未记录证据"}</p></div><span className="tag">{decision.status === "reviewed" ? "已复盘" : "待复盘"}</span>{decision.status !== "reviewed" && <Link href={`/decisions/${decision.id}/review`}>复盘结果</Link>}</div>)}</div></article></div>;
}

function Insights({ data }: { data: LifeState }) {
  const energy = data.meetings.filter((item) => item.energy !== null).slice(0, 8).reverse();
  const domains = [...new Set(data.goals.map((goal) => goal.domain))];
  return <div className="insight-grid"><article className="card insight-card"><p className="section-kicker">OBSERVED ENERGY</p><h2>最近的精力记录</h2><p>只展示你在会议中记录的数值，不预测心理状态。</p><div className="decision-list">{energy.length ? energy.map((meeting) => <Link key={meeting.id} href={`/meetings/${meeting.id}`}>{meeting.createdAt.slice(0, 10)} · {meeting.topic || meeting.title} · {meeting.energy}/10 →</Link>) : <Link href="/meetings/new/daily">记录一次真实站会 →</Link>}</div></article><article className="card insight-card"><p className="section-kicker">GOAL PORTFOLIO</p><h2>目标领域分布</h2><p>这是目标数量，不是时间投入比例；目前未追踪实际工时。</p>{domains.map((domain) => <section key={domain}><h3>{domain}</h3><div className="decision-list">{data.goals.filter((goal) => goal.domain === domain).map((goal) => <Link key={goal.id} href={`/goals/${goal.id}`}>{goal.title} · {goal.progress}% →</Link>)}</div></section>)}<Link href="/goals/new">新增有明确理由的目标 →</Link></article><article className="card insight-card wide"><h2>从记录走向复盘</h2><p>会议、行动结果与决策预测需要一起核对，不能把打卡次数当作建议有效。</p><div className="meeting-actions"><Link href="/cycles">行动周期与实际结果</Link><Link href="/decisions">决策和预测复盘</Link><Link href="/meetings/new/weekly">带证据召开周会</Link></div></article></div>;
}

function Settings({ data, mutate }: { data: LifeState; mutate: (action: string, payload: Record<string, unknown>) => Promise<LifeState> }) {
  return <div className="settings-grid"><article className="card constitution"><div className="section-title"><div><p className="section-kicker">PERSONAL CONSTITUTION</p><h2>个人经营章程</h2></div><Link href="/settings/profile">编辑 →</Link></div><blockquote>{data.profile.vision || "定义你希望长期建设的人生。"}</blockquote><dl><div><dt>核心价值</dt><dd>{data.profile.values || "尚未定义"}</dd></div><div><dt>经营边界</dt><dd>{data.profile.constraints || "尚未定义"}</dd></div></dl></article><article className="card team-card"><p className="section-kicker">AGENT TEAM</p><h2>四个决策角色</h2><p>查看各角色的目标、证据边界和禁止事项。</p><Link href="/settings/agents">管理 Agent 团队 →</Link><hr /><Link href="/settings/integrations/openai">检查 OpenAI 连接 →</Link></article><article className="card reminders"><p className="section-kicker">CADENCE</p><h2>站内会议节奏</h2><p>当前只保存站内节奏偏好，不会发送系统推送或邮件。</p><Link href="/meetings">进入会议中心 →</Link>{data.reminders.map((reminder) => <div className="reminder-row" key={reminder.id}><div><b>{reminder.title}</b><small>{reminder.time}</small></div><ReminderToggle label={reminder.title} initial={reminder.enabled} onToggle={(enabled) => mutate("reminder.update", { id: reminder.id, enabled, time: reminder.time })} /></div>)}</article></div>;
}

export function EntityEditor({ kind }: { kind: "goal" | "decision" }) {
  const state = useLifeState();
  const router = useRouter();
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const section = kind === "goal" ? "goals" : "decisions";
  const title = kind === "goal" ? "创建目标" : "发起决策";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    if (saving) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      if (kind === "goal") {
        const created = await state.mutate("goal.create", { title: String(form.get("title") || ""), domain: String(form.get("domain") || "成长"), horizon: String(form.get("horizon") || "季度"), why: String(form.get("reason") || "") });
        setSaved("目标已保存，正在打开详情。"); router.push(created.createdId ? `/goals/${created.createdId}` : "/goals");
      } else {
        const created = await state.mutate("decision.create", { title: String(form.get("title") || ""), options: String(form.get("options") || "").split("\n").filter(Boolean), choice: String(form.get("choice") || ""), reason: String(form.get("reason") || "") });
        setSaved("决策已保存，正在打开证据与复盘详情。"); router.push(created.createdId ? `/decisions/${created.createdId}` : "/decisions");
      }
    } catch (error) { setSaved(error instanceof Error ? error.message : "保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  return <AppShell section={section} status={state.status}><article className="card section-card"><p className="section-kicker">INTAKE</p><h2>{title}</h2><ActionForm pending={saving} onSubmit={(event) => void submit(event)} submitLabel={kind === "goal" ? "加入目标组合" : "签署并保存决策"}><label>主题<input required name="title" /></label>{kind === "goal" ? <><label>领域<select name="domain" defaultValue="成长"><option>科研</option><option>事业</option><option>成长</option><option>健康</option><option>关系</option><option>生活</option></select></label><label>周期<select name="horizon" defaultValue="季度"><option>月度</option><option>季度</option><option>年度</option><option>长期</option></select></label></> : <><label>可选方案（每行一个）<textarea name="options" /></label><label>最终选择<input required name="choice" /></label></>}<label>{kind === "goal" ? "为什么值得投入？" : "证据、权衡与不确定性"}<textarea name="reason" /></label></ActionForm>{saved && <p role="status">{saved}</p>}</article></AppShell>;
}

type DecisionEvidenceItem = { id: string; kind: string; title: string; content: string; verification: string };

function DecisionEvidencePanel({ decisionId }: { decisionId: string }) {
  const [items, setItems] = useState<DecisionEvidenceItem[]>([]);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("fact");
  const load = useCallback(async () => {
    const response = await protectedFetch(`/api/decisions/${decisionId}/evidence`);
    const body = await response.json() as { groups?: Record<string, DecisionEvidenceItem[]>; error?: string };
    if (!response.ok) throw new Error(body.error || "无法读取证据");
    setItems(Object.values(body.groups ?? {}).flat());
  }, [decisionId]);
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => setStatus("证据读取失败")), 0); return () => window.clearTimeout(timer); }, [load]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const verification = kind === "preference" && form.get("confirmed") ? "user_confirmed" : "unverified";
    const key = `lifeorg:decision:${decisionId}:evidence`;
    try {
      const operation = pendingOperation(window.sessionStorage, key, { kind, title: String(form.get("title") || ""), content: String(form.get("content") || ""), verification, source: null });
      const response = await protectedFetch(`/api/decisions/${decisionId}/evidence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation.payload, clientRequestId: operation.id }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) {
        if ([400, 409, 422].includes(response.status)) clearPendingOperation(window.sessionStorage, key, operation.id);
        throw new Error(body.error || "证据保存失败");
      }
      clearPendingOperation(window.sessionStorage, key, operation.id);
      formElement.reset(); setStatus("证据已保存，可在下一场会议中选择。");
      await load().catch(() => setStatus("证据已保存，但列表刷新失败；刷新页面可重读。"));
    } catch (error) { setStatus(error instanceof Error ? error.message : "保存失败，重试会复用同一请求。"); }
  }

  return <section className="card section-card"><p className="section-kicker">EVIDENCE BOARD</p><h2>事实、偏好、假设与未知</h2><p>这些条目不会自动变成结论；会议会保留类型和核验状态。</p>
    <div className="team-list">{items.map((item) => <article key={item.id}><b>{item.title}</b><p>{item.content}</p><small>{({ fact: "事实", preference: "偏好", assumption: "假设", unknown: "未知", alternative: "替代方案", historical_analogue: "历史类比" } as Record<string, string>)[item.kind] || item.kind} · {item.verification === "user_confirmed" ? "本人已确认" : item.verification === "record_backed" ? "有记录来源" : "尚未核验"}</small></article>)}</div>
    <form className="meeting-form" onSubmit={(event) => void create(event)}><label>类型<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="fact">事实</option><option value="preference">偏好</option><option value="assumption">假设</option><option value="unknown">未知</option><option value="alternative">替代方案</option><option value="historical_analogue">历史类比</option></select></label><label>标题<input required minLength={3} name="title" /></label><label>内容<textarea required minLength={3} name="content" /></label>{kind === "preference" && <label><input type="checkbox" name="confirmed" />这是我本人确认的偏好</label>}<button type="submit">保存到证据板</button></form>{status && <p role="status">{status}</p>}
  </section>;
}

export function EntityDetail({ kind, id, review = false }: { kind: "goal" | "decision" | "meeting"; id: string; review?: boolean }) {
  const state = useLifeState();
  const section = kind === "goal" ? "goals" : kind === "decision" ? "decisions" : "meetings";
  const goalRecord = kind === "goal" ? findEntityById(state.data.goals, id) : null;
  const decisionRecord = kind === "decision" ? findEntityById(state.data.decisions, id) : null;
  const meetingRecord = kind === "meeting" ? findEntityById(state.data.meetings, id) : null;
  const record = goalRecord ?? decisionRecord ?? meetingRecord;
  const detailView = entityDetailState(state.status, state.notice, record);
  const detail = goalRecord ? `${goalRecord.domain} · ${goalRecord.horizon} · 进度 ${goalRecord.progress}%\n${goalRecord.why || "尚未记录投入理由。"}` : decisionRecord ? `当时选择：${decisionRecord.choice}\n${decisionRecord.reason || "尚未记录证据和权衡。"}` : meetingRecord ? `${meetingRecord.summary}\n${meetingRecord.energy ? `当时精力：${meetingRecord.energy}/10` : "未记录精力"}${meetingRecord.mood ? ` · ${meetingRecord.mood}` : ""}` : "";
  return <AppShell section={section} status={state.status}><div className="content-stack">{detailView.kind === "error" && <div className="notice" role="alert"><span>{detailView.message}</span><button data-action="retry" type="button" onClick={state.retry}>重新读取</button></div>}<article className="card section-card"><p className="section-kicker">{kind.toUpperCase()} · {id}</p>{detailView.kind === "ready" ? <><h2>{record?.title}</h2><p style={{ whiteSpace: "pre-line" }}>{detail}</p></> : <><h2>{detailView.message}</h2><p>{detailView.kind === "error" ? "请检查连接后重试；我们不会用占位内容冒充真实记录。" : "页面会根据 URL 中的编号读取对应的个人经营记录。"}</p></>}{detailView.kind === "ready" && <><div className="meeting-actions"><Link href={`/${section}`}>← 返回列表</Link>{goalRecord && <><Link href={`/goals/${id}/edit`}>编辑或暂停目标</Link><Link className="primary-button" href={`/meetings/new/weekly?goalId=${id}`}>围绕这个目标开会</Link><Link href={`/cycles/new?goalId=${id}`}>建立七天行动</Link></>}{decisionRecord && <><Link className="primary-button" href={`/meetings/new/decision?decisionId=${id}`}>带证据重新评议</Link><Link href={`/decisions/${id}/review`}>{review ? "继续填写实际结果" : "记录结果并复盘"}</Link></>}{meetingRecord && <Link href={`/meetings/${id}`}>继续进入会议室</Link>}</div>{decisionRecord && <><h3>当时的备选方案</h3><ul>{(decisionRecord.options ?? []).map((option, index) => <li key={index}>{option}</li>)}</ul><p>计划复查：{decisionRecord.reviewAt?.slice(0, 10) || "尚未设定"}</p><p>历史判断保留原样；新证据通过再次评议或结果复盘追加，不覆盖当时的理由。</p></>}</>}</article>{decisionRecord && detailView.kind === "ready" && <DecisionEvidencePanel decisionId={id} />}</div></AppShell>;
}

export function MeetingIntake({ kind }: { kind: string }) {
  // Governed replacement for the legacy baseline call: await state.mutate("meeting.create", ...)
  const state = useLifeState();
  const router = useRouter();
  const [selectedEvidence, setSelectedEvidence] = useState(() => new Set(["profile:self"]));
  const evidenceOptions = [
    { key: "profile:self", type: "profile", id: "self", title: "个人经营章程" },
    ...state.data.goals.map((item) => ({ key: `goal:${item.id}`, type: "goal", id: String(item.id), title: `目标：${item.title}` })),
    ...state.data.decisions.map((item) => ({ key: `decision:${item.id}`, type: "decision", id: String(item.id), title: `决策：${item.title}` })),
    ...state.data.meetings.slice(0, 8).map((item) => ({ key: `meeting:${item.id}`, type: "meeting", id: String(item.id), title: `会议：${item.title}` })),
  ];
  const [mood, setMood] = useState("平稳"); const [status, setStatus] = useState("");
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const topic = String(form.get("topic") || "");
    const energy = Number(form.get("energy") || 7);
    const operationKey = `lifeorg:meeting:create:${kind}`;
    try {
      const prior = readPendingOperation<Record<string, unknown>>(window.sessionStorage, operationKey);
      const evidence = evidenceOptions.filter((option) => selectedEvidence.has(option.key)).map(({ type, id }) => ({ type, id }));
      if (!prior && evidence.length < 2) { setStatus("请至少选择两条不同的真实记录（个人章程加一项目标、决策或历史会议）。"); return; }
      const operation = pendingOperation(window.sessionStorage, operationKey, { kind, topic, intake: { message: topic, energy, mood }, evidence });
      const response = await protectedFetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation.payload, clientRequestId: operation.id }) });
      const created = await response.json() as { meetingId?: string; error?: string };
      if (!response.ok || !created.meetingId) { if ([400, 409, 422].includes(response.status)) clearPendingOperation(window.sessionStorage, operationKey, operation.id); throw new Error(created.error || "会议创建失败。"); }
      clearPendingOperation(window.sessionStorage, operationKey, operation.id);
      setStatus("会议已创建，正在进入会议室。");
      router.push(`/meetings/${created.meetingId}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "会议创建失败，请重试。"); }
  }
  return <AppShell section="meetings" status={state.status}><article className="card section-card"><p className="section-kicker">GUIDED MEETING · {kind.toUpperCase()}</p><h2>准备会议材料</h2><p>选择真正相关的记录；幕僚长只会引用这些归属于你的证据。</p><ActionForm onSubmit={(event) => void create(event)} submitLabel="创建会议并进入会议室"><label>需要解决的问题<textarea required name="topic" /></label><fieldset><legend>相关 LifeOrg 记录</legend><div className="evidence-picker">{evidenceOptions.map((option) => <label key={option.key}><input type="checkbox" checked={selectedEvidence.has(option.key)} disabled={option.key === "profile:self"} onChange={(event) => setSelectedEvidence((current) => { const next = new Set(current); if (event.target.checked) next.add(option.key); else next.delete(option.key); return next; })} />{option.title}</label>)}</div></fieldset><label>当前精力<input data-action="progress" name="energy" type="range" min="1" max="10" defaultValue="7" /></label><MoodChoices value={mood} onChange={setMood} /></ActionForm>{status && <p role="status">{status}</p>}</article></AppShell>;
}

export function SettingsDetail({ tab }: { tab: "profile" | "agents" | "openai" }) {
  const state = useLifeState();
  const [status, setStatus] = useState("");
  const content = useMemo(() => tab === "profile" ? ["个人经营章程", "愿景、价值观和现实边界只由你确认。"] : tab === "agents" ? ["四名 Agent 的角色与边界", "幕僚长、战略架构师、运营执行官和风险审计官使用不同目标与禁止事项。"] : ["OpenAI 集成", "此处只显示连接状态与有效模型，密钥永远不会进入浏览器。"], [tab]);
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await state.mutate("profile.update", { displayName: String(form.get("displayName") || "人生经营者"), vision: String(form.get("vision") || ""), values: String(form.get("values") || ""), constraints: String(form.get("constraints") || "") });
      setStatus("个人经营章程已更新。所有后续会议都会以此作为边界。");
    } catch (error) { setStatus(error instanceof Error ? error.message : "章程保存失败，请重试。"); }
  }
  return <AppShell section="settings" status={state.status}><div className="settings-grid"><article className="card constitution"><p className="section-kicker">ORGANIZATION SETTINGS</p><h2>{content[0]}</h2><p>{content[1]}</p>{tab === "profile" && state.status === "个人记录已同步" && <ActionForm onSubmit={(event) => void saveProfile(event)} submitLabel="更新个人经营章程"><label>你的称呼<input name="displayName" defaultValue={state.data.profile.displayName} /></label><label>长期愿景<textarea name="vision" defaultValue={state.data.profile.vision} /></label><label>核心价值<textarea name="values" defaultValue={state.data.profile.values} /></label><label>现实约束<textarea name="constraints" defaultValue={state.data.profile.constraints} /></label></ActionForm>}{tab === "agents" && <AgentDirectory />}{tab === "openai" && <OpenAIIntegrationPanel />}{status && <p role="status">{status}</p>}</article><article className="card team-card"><nav aria-label="设置导航"><Link href="/settings/profile">个人章程</Link><br /><Link href="/settings/agents">Agent 团队</Link><br /><Link href="/settings/integrations/openai">OpenAI 集成</Link></nav></article></div></AppShell>;
}

type GuidedTurn =
  | { status: "needs_input"; question: string; missingEvidence: string[] }
  | { status: "deliberating"; contributions: Array<{ role: string; conclusion: string; evidenceIds: string[]; uncertainty: string; disagreements: string[] }> }
  | { status: "ready"; recommendation: GuidedRecommendation }
  | { status: "offline"; mode: "structured_offline"; reason: string; canRetry: true };
type GuidedRecommendation = {
  existingCycle?: { recordId: string; updatedAt: string };
  recommendation: string; evidence: Array<{ recordId: string; claim: string }>; deferredAlternative: string;
  nextAction: string; nextActionWindowHours: number; deadlineOrReviewAt: string; successCriterion: string;
  stopOrAdjustCondition: string; confidence: string; unknowns: string[]; disagreements: string[];
  centralAssumption: string; forecast: { observableOutcome: string; confidencePercent: number; evidenceThatChangesAdvice: string[] };
  sevenDayValidationAction: string; adoptionMode?: "full" | "partial" | "self_directed";
  orchestrationVersion: string; promptVersion: string; schemaVersion: string;
  mutationPreview?: Array<Record<string, unknown>>;
};
type GuidedRoom = {
  id: string; clientRequestId: string; topic: string; kind: string; lifecycle: { status: string; phase: string; approvalStatus: string };
  records: Array<{ id: string; title: string; summary: string }>; messages: Array<{ id: string; role: string; content: unknown; createdAt: string }>;
  recommendation?: GuidedRecommendation; legacyInputs?: Record<string, unknown>; legacyAgentOutput?: Record<string, unknown>; mutationHash?: string;
  orchestrationPolicy?: { mode: "fast" | "deep"; specialistRoles: string[]; policyVersion: string; reason: string };
  decisionHistory: Array<{ id: string; action: string; recommendationSnapshot: GuidedRecommendation; createdAt: string }>;
};

export function GuidedMeetingRoom({ id }: { id: string }) {
  const [room, setRoom] = useState<GuidedRoom | null>(null);
  const [turn, setTurn] = useState<GuidedTurn | null>(null);
  const [message, setMessage] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [lastTurnId, setLastTurnId] = useState("");
  const [hasPendingTurn, setHasPendingTurn] = useState(false);
  const [status, setStatus] = useState("正在恢复会议记录…");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedAdvice, setEditedAdvice] = useState("");
  const [adoptionMode, setAdoptionMode] = useState<"full" | "partial" | "self_directed">("full");

  const load = useCallback(async () => {
    const response = await protectedFetch(`/api/meetings/${encodeURIComponent(id)}`);
    const result = await response.json() as { meeting?: GuidedRoom; error?: string };
    if (!response.ok || !result.meeting) throw new Error(result.error || "无法读取会议");
    setRoom(result.meeting);
    const recentSystem = [...result.meeting.messages].reverse().find((item) => item.content && typeof item.content === "object" && "status" in item.content);
    if (recentSystem) {
      const restored = recentSystem.content as GuidedTurn;
      if (["needs_input", "offline", "ready", "deliberating"].includes(restored.status)) setTurn(restored);
    }
    setEditedAdvice(result.meeting.recommendation?.recommendation ?? ""); setStatus("会议记录已恢复");
  }, [id]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load().then(() => {
      const prior = readPendingOperation<{ message: string; retryOf?: string }>(window.sessionStorage, `lifeorg:meeting:${id}:pending-turn`);
      if (prior) { setMessage(prior.payload.message); setLastMessage(prior.payload.message); setLastTurnId(prior.id); setHasPendingTurn(true); setStatus("检测到上次未确认的发言；再次提交会复用同一请求，不会重复运行 Agent。"); }
    }).catch((error) => setStatus(error instanceof Error ? error.message : "读取失败")), 0);
    return () => window.clearTimeout(timer);
  }, [id, load]);

  async function sendTurn(text: string, retryOf?: string) {
    if (!text.trim()) return;
    setPending(true); setStatus("Agent 正在按本次会议策略处理材料…");
    const operationKey = `lifeorg:meeting:${id}:pending-turn`;
    const operation = pendingOperation(window.sessionStorage, operationKey, { message: text.trim(), ...(retryOf ? { retryOf } : {}) });
    setHasPendingTurn(true);
    try {
      const response = await protectedFetch(`/api/meetings/${encodeURIComponent(id)}/turns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...operation.payload, clientTurnId: operation.id }) });
      const result = await response.json() as GuidedTurn & { error?: string };
      const classification = classifyTurnResponse(response.ok, response.status, result);
      if (classification.kind === "offline") {
        clearPendingOperation(window.sessionStorage, operationKey, operation.id); setHasPendingTurn(false);
        setTurn(result); setLastMessage(operation.payload.message); setLastTurnId(operation.id); setMessage("");
        setStatus("结构化离线模式：本轮已结束且没有虚构 Agent 发言；重试会创建一个新的可追踪轮次。");
        await load(); return;
      }
      if (classification.kind === "error") { if (classification.definitive) { clearPendingOperation(window.sessionStorage, operationKey, operation.id); setHasPendingTurn(false); } throw new Error(result.error || (response.status === 409 ? "本轮仍在处理中，请稍后用同一发言重试。" : "本轮处理失败")); }
      clearPendingOperation(window.sessionStorage, operationKey, operation.id); setHasPendingTurn(false);
      setTurn(result); setLastMessage(operation.payload.message); setLastTurnId(operation.id); setMessage("");
      if (result.status === "needs_input") setStatus("幕僚长还缺一条关键证据。");
      else if (result.status === "deliberating") setStatus("本次召集的专家已完成有边界的评议。");
      else setStatus("具体建议已就绪，等待 CEO 批准、编辑或否决。");
      await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "本轮处理失败"); }
    finally { setPending(false); }
  }

  async function decide(action: "approve" | "edit" | "reject") {
    if (!room?.recommendation) return;
    setPending(true);
    const payload = action === "approve" ? { action, idempotencyKey: meetingApprovalKey(id), mutationHash: room.mutationHash, adoptionMode }
      : action === "edit" ? { action, idempotencyKey: crypto.randomUUID(), recommendation: { ...room.recommendation, recommendation: editedAdvice } }
      : { action, idempotencyKey: crypto.randomUUID() };
    try {
      const response = await protectedFetch(`/api/meetings/${encodeURIComponent(id)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "处理决定失败");
      setStatus(action === "approve" ? "已原子提交批准的变更。" : action === "edit" ? "修改稿已保存，尚未改变任何经营记录。" : "建议已否决，没有改变任何经营记录。");
      if (action === "approve") setAdoptionMode("full");
      setEditing(false); await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "处理决定失败"); }
    finally { setPending(false); }
  }

  const recommendation = room?.recommendation ?? (turn?.status === "ready" ? turn.recommendation : undefined);
  const canDecide = room?.lifecycle.status === "ready" && room.lifecycle.approvalStatus === "pending";
  if (room?.clientRequestId === "legacy") return <AppShell section="meetings" status={status}><div className="content-stack guided-room">
    <section className="card section-card"><p className="section-kicker">LEGACY MEETING ARCHIVE</p><h2>{room.topic}</h2><p>这是升级前保存的会议档案。原始材料和当时的 Agent 结果会保留展示，但旧会议不会伪装成满足新证据门禁的四 Agent 讨论。</p></section>
    <section className="card section-card"><h3>原始会议材料</h3><pre>{JSON.stringify(room.legacyInputs ?? {}, null, 2)}</pre></section>
    <section className="card section-card"><h3>历史 Agent 输出</h3><pre>{JSON.stringify(room.legacyAgentOutput ?? {}, null, 2)}</pre></section>
    <section className="card section-card"><h3>用当前治理流程继续</h3><p>重新召集时，你可以选择至少两条真实目标、决策或个人章程记录作为证据。</p><Link className="primary-button" href={`/meetings/new/${room.kind}`}>用新证据重新召集</Link></section>
  </div></AppShell>;
  return <AppShell section="meetings" status={status}><div className="content-stack guided-room">
    <section className="card section-card"><p className="section-kicker">GUIDED MEETING · {room?.kind?.toUpperCase() ?? "LOADING"}</p><h2>{room?.topic ?? "正在恢复会议"}</h2><p>阶段：{room?.lifecycle.phase ?? "intake"} · 审批：{room?.lifecycle.approvalStatus ?? "pending"}</p></section>
    <section className="card section-card"><h3>本次采用的真实记录</h3><div className="evidence-list">{room?.records.map((record) => <article key={record.id}><b>{recordHref(record.id) ? <Link href={recordHref(record.id)!}>{record.title} →</Link> : record.title}</b><p>{record.summary}</p></article>)}</div></section>
    <section className="card section-card" aria-live="polite"><h3>会议讨论</h3>{turn?.status === "needs_input" && <div className="agent-note"><b>幕僚长只追问一个问题：</b><p>{turn.question}</p><small>缺失：{turn.missingEvidence.join("、")}</small></div>}{turn?.status === "deliberating" && <div className="agent-grid">{turn.contributions.map((item) => <article key={item.role}><span>{item.role}</span><p>{item.conclusion}</p><small>依据：{item.evidenceIds.join("、")} · 未知：{item.uncertainty}</small></article>)}</div>}{turn?.status === "offline" && <div className="notice" role="alert">结构化离线模式：服务暂不可用；你仍可记录个人判断，但这里不会显示虚构的 Agent 发言。</div>}
      {room && room.lifecycle.status !== "approved" && <form className="meeting-form" onSubmit={(event) => { event.preventDefault(); void sendTurn(message); }}><label>回复幕僚长或补充证据<textarea value={message} onChange={(event) => setMessage(event.target.value)} required /></label><button data-action="send-turn" className="primary-button" type="submit" disabled={pending || !message.trim()}>{pending ? "处理中…" : hasPendingTurn ? "重试未确认的同一轮" : "提交本轮"}</button>{turn?.status === "offline" && <button data-action="retry" type="button" disabled={pending} onClick={() => void sendTurn(lastMessage, lastTurnId)}>重试同一轮</button>}</form>}
    </section>
    {recommendation && <section className="card section-card recommendation">
      <p className="section-kicker">CEO DECISION</p><h2>{recommendation.recommendation}</h2>
      <h3>支持这一建议的记录证据</h3><ul>{recommendation.evidence.map((item) => <li key={`${item.recordId}-${item.claim}`}><b>{room?.records.find((record) => record.id === item.recordId)?.title || "已选记录"}：</b>{item.claim}</li>)}</ul>
      <dl>
        <div><dt>核心假设</dt><dd>{recommendation.centralAssumption}</dd></div>
        <div><dt>可观察预测</dt><dd>{recommendation.forecast.observableOutcome}（{recommendation.forecast.confidencePercent}%）</dd></div>
        <div><dt>什么证据会改变建议</dt><dd>{recommendation.forecast.evidenceThatChangesAdvice.join("；")}</dd></div>
        <div><dt>暂缓方案</dt><dd>{recommendation.deferredAlternative}</dd></div>
        <div><dt>24–48 小时下一步</dt><dd>{recommendation.nextAction}</dd></div>
        <div><dt>7 日验证行动</dt><dd>{recommendation.sevenDayValidationAction}</dd></div>
        <div><dt>截止/复查</dt><dd>{recommendation.deadlineOrReviewAt}</dd></div>
        <div><dt>成功标准</dt><dd>{recommendation.successCriterion}</dd></div>
        <div><dt>停止/调整条件</dt><dd>{recommendation.stopOrAdjustCondition}</dd></div>
        <div><dt>信心与未知</dt><dd>{recommendation.confidence} · {recommendation.unknowns.join("；") || "无"}</dd></div>
        <div><dt>Agent 分歧</dt><dd>{recommendation.disagreements.join("；") || "无"}</dd></div>
      </dl>
      <RecommendationEffects existingCycle={recommendation.existingCycle} mutations={recommendation.mutationPreview} evidenceRecords={room?.records ?? []} />
      {recommendation.existingCycle && <Link className="card-link" href={`/cycles/${encodeURIComponent(recommendation.existingCycle.recordId.slice(6))}`}>查看当前行动、记录进展或明确调整 →</Link>}
      {canDecide && <fieldset className="adoption-picker"><legend>你准备如何采用这份建议？</legend><label><input type="radio" name="adoptionMode" checked={adoptionMode === "full"} onChange={() => setAdoptionMode("full")} />完全采用</label><label><input type="radio" name="adoptionMode" checked={adoptionMode === "partial"} onChange={() => setAdoptionMode("partial")} />部分采用</label><label><input type="radio" name="adoptionMode" checked={adoptionMode === "self_directed"} onChange={() => setAdoptionMode("self_directed")} />自主执行并保留原建议</label></fieldset>}
      {canDecide && editing && <label>编辑一句话建议<textarea value={editedAdvice} onChange={(event) => setEditedAdvice(event.target.value)} /></label>}
      {canDecide && <div className="meeting-actions"><button data-action="edit" type="button" disabled={pending} onClick={() => setEditing((value) => !value)}>编辑</button>{editing && <button data-action="edit" type="button" disabled={pending} onClick={() => void decide("edit")}>保存修改稿</button>}<button data-action="reject" type="button" disabled={pending} onClick={() => void decide("reject")}>否决</button><button data-action="approve" className="primary-button" type="button" disabled={pending || !room?.mutationHash} onClick={() => void decide("approve")}>批准并提交</button></div>}
      {room?.lifecycle.status === "approved" && <div className="notice" role="status">建议已批准并归档，相关变更已按预览提交。</div>}
      {room?.lifecycle.status === "draft" && room.decisionHistory.some((event) => event.action === "reject") && <div className="notice" role="status">建议已否决，没有改变经营记录。你可以在上方补充材料，开启新一轮评议。</div>}
    </section>}
    <section className="card section-card"><h3>可恢复的会议历史</h3>{room && <div className="message-history">{room.messages.map((item) => <MessageContent key={item.id} role={item.role} content={item.content} records={room.records} />)}</div>}{room?.decisionHistory?.map((event) => <p className="agent-note" key={event.id}>已记录 {event.action}；原建议快照仍保留：{event.recommendationSnapshot.recommendation}</p>)}</section>
    <p role="status">{status}</p>
  </div></AppShell>;
}

export function DecisionOutcomeReview({ id }: { id: string }) {
  const state = useLifeState(); const router = useRouter(); const [status, setStatus] = useState("");
  const decision = findEntityById(state.data.decisions, id);
  async function launch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!decision) return;
    const form = new FormData(event.currentTarget); const outcome = String(form.get("outcome") || ""); const observedAt = String(form.get("observedAt") || "");
    const clientRequestId = crypto.randomUUID();
    const topic = `复盘决策「${decision.title}」的实际结果；仅在批准后追加 decision.reviewOutcome：${outcome}（observedAt=${observedAt}）`;
    try {
      const lockedMutationIntent = { type: "decision.reviewOutcome", decisionId: Number(id), outcome, observedAt } as const;
      const response = await protectedFetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId, kind: "decision", topic, intake: { message: topic }, evidence: [{ type: "profile", id: "self" }, { type: "decision", id }], lockedMutationIntent }) });
      const result = await response.json() as { meetingId?: string; error?: string }; if (!response.ok || !result.meetingId) throw new Error(result.error || "无法创建复盘会议");
      router.push(`/meetings/${result.meetingId}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "无法创建复盘会议"); }
  }
  return <AppShell section="decisions" status={state.status}><article className="card section-card"><p className="section-kicker">IMMUTABLE OUTCOME REVIEW</p><h2>{decision?.title ?? "正在读取决策"}</h2><p>原始选择与理由不会被改写；会议形成的 outcome 只会在你批准精确预览后追加。</p>{decision && <ActionForm onSubmit={(event) => void launch(event)} submitLabel="召集决策复盘会"><label>实际结果<textarea required name="outcome" /></label><label>观察日期<input required type="date" name="observedAt" /></label></ActionForm>}{status && <p role="alert">{status}</p>}</article></AppShell>;
}

type OpenAIConnectionStatus = {
  configured: boolean;
  mode: "openai" | "structured_offline";
  specialistModel: string;
  chiefModel: string;
};

function OpenAIIntegrationPanel() {
  const [connection, setConnection] = useState<OpenAIConnectionStatus | null>(null);
  const [message, setMessage] = useState("正在读取服务端连接状态…");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    void protectedFetch("/api/integrations/openai/status").then(async (response) => {
      const result = await response.json() as OpenAIConnectionStatus | { error?: string };
      if (!active) return;
      if (!response.ok || !("configured" in result)) throw new Error("无法读取 OpenAI 连接状态");
      setConnection(result);
      setMessage(result.configured ? "服务端密钥已配置，请测试实际可用性。" : "当前为 structured_offline 模式；没有伪造 Agent 发言。");
    }).catch(() => { if (active) setMessage("无法读取 OpenAI 连接状态，请稍后重试。"); });
    return () => { active = false; };
  }, []);

  async function testConnection() {
    setTesting(true);
    setMessage("正在执行不保存内容的最小连接测试…");
    try {
      const response = await protectedFetch("/api/integrations/openai/test", { method: "POST" });
      const result = await response.json() as { ok?: boolean; code?: string };
      setMessage(result.ok ? "连接测试通过（connected）。" : `连接测试未通过（${result.code ?? "redacted_error"}）。`);
    } catch { setMessage("连接测试失败（network_error）。"); }
    finally { setTesting(false); }
  }

  return <div className="team-list">
    <div className="ai-status">
      <b>{connection?.configured ? "密钥已配置 · 等待测试" : "未配置 / 结构化离线"}</b>
      <p>模式：{connection?.mode ?? "正在检查"}</p>
      <p>专家模型：{connection?.specialistModel ?? "—"}</p>
      <p>幕僚长模型：{connection?.chiefModel ?? "—"}</p>
    </div>
    <section><h3>如何接入真实 ChatGPT / OpenAI 模型</h3><p>由站点所有者在 Sites 项目的私密环境变量中设置 <code>OPENAI_API_KEY</code>，然后在这里测试连接。密钥不应粘贴到聊天、浏览器表单或 GitHub；ChatGPT 订阅不会自动提供此 API 密钥。</p><p>本页是服务端连接的状态与测试入口，不是把密钥保存到浏览器的输入框。</p><Link href="/settings/agents">查看四名 Agent 的职责与输出要求 →</Link></section>
    <button data-action="retry" type="button" disabled={testing} onClick={() => void testConnection()}>{testing ? "正在测试…" : "测试服务端连接"}</button>
    <p role="status">{message}</p>
  </div>;
}
