"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

type View = "overview" | "meetings" | "goals" | "decisions" | "insights" | "settings";
type Panel = "daily" | "weekly" | "monthly" | "decision" | "goal" | "profile" | null;
type AgentResult = { strategy: string; operations: string; audit: string; chief: string; recommendation: string; source: "openai" | "framework"; model?: string };
type Profile = { displayName: string; vision: string; values: string; constraints: string };
type Goal = { id: number; title: string; domain: string; horizon: string; why: string; progress: number; status: string };
type Meeting = { id: number; type: string; title: string; energy: number | null; mood: string | null; summary: string; inputs: Record<string, unknown>; agentOutput: Partial<AgentResult>; createdAt: string };
type Decision = { id: number; title: string; options: string[]; choice: string; reason: string; status: string; reviewAt: string | null; createdAt: string; agentOutput: Partial<AgentResult> };
type Reminder = { id: number; kind: string; title: string; time: string; weekday: number | null; enabled: boolean };
type LifeState = { profile: Profile; goals: Goal[]; meetings: Meeting[]; decisions: Decision[]; reminders: Reminder[] };

const emptyState: LifeState = { profile: { displayName: "人生经营者", vision: "", values: "", constraints: "" }, goals: [], meetings: [], decisions: [], reminders: [] };
const nav: Array<[View, string, string]> = [["overview", "⌂", "经营总览"], ["meetings", "▥", "会议中心"], ["goals", "◎", "目标组合"], ["decisions", "◇", "决策日志"], ["insights", "↗", "经营洞察"], ["settings", "⚙", "组织设置"]];
const labels: Record<View, [string, string]> = {
  overview: ["经营总览", "看清现状，只批准真正重要的下一步。"], meetings: ["会议中心", "用固定节奏复盘事实、调整资源。"], goals: ["目标组合", "让日常行动持续服务于长期方向。"],
  decisions: ["决策日志", "保留当时的证据，让结果帮助你校准判断。"], insights: ["经营洞察", "从真实记录中寻找节奏，而不是给自己打分。"], settings: ["组织设置", "定义你的经营原则、团队角色和会议节奏。"],
};

function makeDeviceId() {
  const found = window.localStorage.getItem("lifeorg-device");
  if (found) return found;
  const created = crypto.randomUUID().replaceAll("-", "");
  window.localStorage.setItem("lifeorg-device", created);
  return created;
}

function day(value?: string | null) {
  if (!value) return "未安排";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(value));
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [panel, setPanel] = useState<Panel>(null);
  const [data, setData] = useState<LifeState>(emptyState);
  const [device, setDevice] = useState("");
  const [sync, setSync] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const [toast, setToast] = useState("");
  const [energy, setEnergy] = useState(7);
  const [mood, setMood] = useState("平稳");
  const [notes, setNotes] = useState({ progress: "", priority: "", blocker: "", wins: "", unfinished: "", risk: "", nextOutcome: "", reflection: "" });
  const [decision, setDecision] = useState({ title: "", options: "", choice: "", reason: "" });
  const [goal, setGoal] = useState({ title: "", domain: "成长", horizon: "季度", why: "" });
  const [profile, setProfile] = useState<Profile>(emptyState.profile);
  const [agent, setAgent] = useState<AgentResult | null>(null);
  const [thinking, setThinking] = useState(false);
  const [focus, setFocus] = useState(25 * 60);
  const [focusing, setFocusing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const id = makeDeviceId();
      setDevice(id);
      void fetch("/api/state", { headers: { "x-lifeorg-user": id } })
        .then(async (response) => {
          const result = await response.json() as { data?: LifeState; error?: string };
          if (!response.ok || !result.data) throw new Error(result.error || "读取失败");
          setData(result.data); setProfile(result.data.profile); setSync("saved");
        })
        .catch(() => { setSync("error"); setToast("云端数据暂时无法连接，请稍后重试。"); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!focusing) return;
    const timer = window.setInterval(() => setFocus((left) => {
      if (left <= 1) { setFocusing(false); setToast("专注结束。记录结果，再决定下一步。"); return 25 * 60; }
      return left - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [focusing]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function load(id = device) {
    setSync("loading");
    try {
      const response = await fetch("/api/state", { headers: { "x-lifeorg-user": id } });
      const result = await response.json() as { data?: LifeState; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error || "读取失败");
      setData(result.data); setProfile(result.data.profile); setSync("saved");
    } catch { setSync("error"); setToast("云端数据暂时无法连接，请稍后重试。"); }
  }

  async function mutate(action: string, payload: Record<string, unknown>) {
    setSync("saving");
    const response = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json", "x-lifeorg-user": device }, body: JSON.stringify({ action, payload }) });
    const result = await response.json() as { data?: LifeState; error?: string };
    if (!response.ok || !result.data) { setSync("error"); throw new Error(result.error || "保存失败"); }
    setData(result.data); setProfile(result.data.profile); setSync("saved");
  }

  function open(next: Panel) { setAgent(null); setPanel(next); }
  function close() { setPanel(null); setAgent(null); }
  function meetingContext() {
    return panel === "daily" ? { energy, mood, ...notes } : panel === "decision" ? decision : { ...notes, energy, mood };
  }
  async function summonAgents() {
    setThinking(true);
    try {
      const response = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: panel, context: meetingContext(), profile }) });
      const result = await response.json() as { result: AgentResult };
      setAgent(result.result);
    } catch { setToast("Agent 团队暂时离线，你仍可保存自己的判断。"); }
    finally { setThinking(false); }
  }

  async function saveMeeting(event: FormEvent) {
    event.preventDefault();
    const summary = panel === "daily" ? notes.priority : panel === "weekly" ? notes.nextOutcome : notes.reflection;
    if (!summary.trim()) return setToast("请先写下本次会议要批准的核心结果。");
    try {
      await mutate("meeting.create", { type: panel, energy, mood, inputs: meetingContext(), summary, agentOutput: agent ?? {} });
      close(); setNotes({ progress: "", priority: "", blocker: "", wins: "", unfinished: "", risk: "", nextOutcome: "", reflection: "" });
      setToast("会议已归档，经营数据已同步。");
    } catch (error) { setToast(error instanceof Error ? error.message : "保存失败"); }
  }

  async function saveDecision(event: FormEvent) {
    event.preventDefault();
    if (!decision.title.trim() || !decision.choice.trim()) return setToast("请填写决策主题与最终选择。");
    try {
      await mutate("decision.create", { ...decision, options: decision.options.split("\n").map((item) => item.trim()).filter(Boolean), agentOutput: agent ?? {} });
      close(); setDecision({ title: "", options: "", choice: "", reason: "" }); setToast("决策已签署，一周后进入复盘队列。");
    } catch (error) { setToast(error instanceof Error ? error.message : "保存失败"); }
  }

  async function saveGoal(event: FormEvent) {
    event.preventDefault();
    try { await mutate("goal.create", goal); close(); setGoal({ title: "", domain: "成长", horizon: "季度", why: "" }); setToast("目标已加入经营组合。"); }
    catch (error) { setToast(error instanceof Error ? error.message : "保存失败"); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    try { await mutate("profile.update", profile); close(); setToast("个人经营章程已更新。"); }
    catch (error) { setToast(error instanceof Error ? error.message : "保存失败"); }
  }

  const today = useMemo(() => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date()), []);
  const weekStart = useMemo(() => {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    current.setDate(current.getDate() - ((current.getDay() + 6) % 7));
    return current.getTime();
  }, []);
  const average = data.goals.length ? Math.round(data.goals.reduce((sum, item) => sum + item.progress, 0) / data.goals.length) : 0;
  const meetingsThisWeek = data.meetings.filter((item) => new Date(item.createdAt).getTime() >= weekStart).length;
  const energySeries = data.meetings.filter((item) => item.energy).slice(0, 8).reverse();
  const name = profile.displayName || "人生经营者";
  const focusLabel = `${String(Math.floor(focus / 60)).padStart(2, "0")}:${String(focus % 60).padStart(2, "0")}`;

  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand-block" type="button" onClick={() => setView("overview")}><span className="brand">LifeOrg</span><span className="brand-subtitle">个人经营系统</span></button>
      <nav className="nav-list" aria-label="主导航">{nav.map(([key, icon, label]) => <button className={`nav-item ${view === key ? "active" : ""}`} type="button" key={key} onClick={() => setView(key)}><span className="nav-icon">{icon}</span><span>{label}</span></button>)}</nav>
      <div className="sync-state"><span className={sync === "error" ? "bad" : ""} />{sync === "loading" ? "连接云端…" : sync === "saving" ? "正在同步…" : sync === "error" ? "同步中断" : "云端已同步"}</div>
      <button className="profile" type="button" onClick={() => open("profile")}><span className="avatar">{name.slice(0, 1)}</span><span><strong>{name}</strong><small>最终决策者 · CEO</small></span><b>⌄</b></button>
    </aside>

    <section className="workspace">
      <header className="page-header"><div><p className="eyebrow">{today} · PERSONAL OPERATING SYSTEM</p><h1>{labels[view][0]}</h1><p>{labels[view][1]}</p></div><button className={`focus-button ${focusing ? "running" : ""}`} type="button" onClick={() => setFocusing(!focusing)}>{focusing ? `暂停 ${focusLabel}` : "开始 25 分钟专注"}</button></header>

      {sync === "error" && <div className="notice"><span>数据连接中断。当前不会覆盖你的云端记录。</span><button type="button" onClick={() => void load()}>重新连接</button></div>}

      {view === "overview" && <div className="overview-grid">
        <article className="hero-card card"><div><p className="section-kicker">DAILY STANDUP · 01</p><h2>今天，只批准一个真正重要的结果。</h2><p>你的团队会检查长期一致性、执行路径与风险边界，最终决定仍由你签署。</p></div><button className="primary-button" type="button" onClick={() => open("daily")}>主持每日站会 <span>约 3 分钟</span></button><div className="hero-stats"><span>本周会议 <b>{meetingsThisWeek}</b></span><span>活跃目标 <b>{data.goals.length}</b></span><span>待复盘决策 <b>{data.decisions.filter((item) => item.status !== "reviewed").length}</b></span></div></article>
        <article className="card health-card"><div className="card-head"><h3>经营健康度</h3><span>动态</span></div><div className="score-ring" style={{ "--score": `${Math.min(100, 35 + average * .65)}%` } as CSSProperties}><b>{average || 0}</b></div><p>目标平均进展 · 不代表你的个人价值</p></article>
        <article className="brief-strip"><span>幕僚长建议</span><p>{data.goals[0] ? `本轮优先检查“${data.goals[0].title}”是否得到足够资源。` : "先创建一个季度目标，再让每日计划服务于它。"}</p><button type="button" onClick={() => open("weekly")}>召开周经营会 →</button></article>
        <GoalPortfolio goals={data.goals.slice(0, 3)} average={average} onAll={() => setView("goals")} onProgress={(id, progress) => void mutate("goal.progress", { id, progress })} />
        <DecisionTable decisions={data.decisions.slice(0, 4)} onAll={() => setView("decisions")} onCreate={() => open("decision")} onReview={(id) => void mutate("decision.review", { id, status: "reviewed" })} />
      </div>}

      {view === "meetings" && <div className="content-stack">
        <div className="meeting-types"><MeetingType number="01" title="每日站会" detail="事实 · 一个结果 · 一个阻塞" action="现在开会" onClick={() => open("daily")} /><MeetingType number="02" title="周经营会" detail="成果 · 资源 · 风险 · 下周承诺" action="开始复盘" onClick={() => open("weekly")} /><MeetingType number="03" title="月度战略会" detail="方向 · 目标组合 · 停止事项" action="审视方向" onClick={() => open("monthly")} /></div>
        <section className="card section-card"><div className="section-title"><div><p className="section-kicker">MEETING ARCHIVE</p><h2>会议档案</h2></div><span>{data.meetings.length} 条记录</span></div><div className="timeline">{data.meetings.length ? data.meetings.map((item) => <article key={item.id}><span className="timeline-dot" /><div><time>{day(item.createdAt)}</time><h3>{item.title}</h3><p>{item.summary}</p></div><div className="meeting-meta">{item.energy ? `精力 ${item.energy}/10` : "战略复盘"}<small>{item.agentOutput?.source === "openai" ? "AI 团队参与" : "结构化会议"}</small></div></article>) : <Empty text="完成第一次站会后，会议记录会出现在这里。" />}</div></section>
      </div>}

      {view === "goals" && <div className="content-stack"><div className="toolbar"><div><b>{data.goals.length}</b><span>个活跃目标 · 平均进展 {average}%</span></div><button className="primary-button" type="button" onClick={() => open("goal")}>＋ 新建目标</button></div><div className="goal-grid">{data.goals.map((item) => <article className="card goal-card" key={item.id}><div><span className="tag">{item.domain}</span><span className="tag pale">{item.horizon}</span></div><h2>{item.title}</h2><p>{item.why || "尚未补充这个目标存在的理由。"}</p><div className="goal-bottom"><div><span>当前进展</span><b>{item.progress}%</b></div><input aria-label={`${item.title}进度`} type="range" min="0" max="100" value={item.progress} onChange={(event) => setData((current) => ({ ...current, goals: current.goals.map((goalItem) => goalItem.id === item.id ? { ...goalItem, progress: Number(event.target.value) } : goalItem) }))} onPointerUp={(event) => void mutate("goal.progress", { id: item.id, progress: Number((event.target as HTMLInputElement).value) })} /></div></article>)}</div></div>}

      {view === "decisions" && <div className="content-stack"><div className="toolbar"><div><b>{data.decisions.length}</b><span>项有记录的判断</span></div><button className="primary-button" type="button" onClick={() => open("decision")}>＋ 发起决策会</button></div><DecisionTable decisions={data.decisions} onCreate={() => open("decision")} onReview={(id) => void mutate("decision.review", { id, status: "reviewed" })} /></div>}

      {view === "insights" && <div className="insight-grid"><article className="card insight-card"><p className="section-kicker">ENERGY SIGNAL</p><h2>精力趋势</h2><div className="bars">{energySeries.length ? energySeries.map((item) => <span key={item.id} style={{ height: `${(item.energy || 1) * 9}%` }} title={`${item.energy}/10`} />) : <Empty text="连续记录几次站会后可查看趋势。" />}</div><p>把精力作为资源约束，而不是道德判断。</p></article><article className="card insight-card"><p className="section-kicker">PORTFOLIO</p><h2>目标资源分布</h2><div className="domain-list">{Object.entries(data.goals.reduce<Record<string, number>>((map, item) => ({ ...map, [item.domain]: (map[item.domain] || 0) + 1 }), {})).map(([domain, count]) => <div key={domain}><span>{domain}</span><b>{count} 项</b></div>)}</div><p>目标太多时，新增一个意味着暂停另一个。</p></article><article className="card insight-card wide"><p className="section-kicker">OPERATING CADENCE</p><h2>你的经营节奏</h2><div className="big-metrics"><div><b>{meetingsThisWeek}</b><span>本周会议</span></div><div><b>{data.decisions.filter((item) => item.status === "reviewed").length}</b><span>已完成复盘</span></div><div><b>{average}%</b><span>目标平均进展</span></div></div></article></div>}

      {view === "settings" && <div className="settings-grid"><article className="card constitution"><div className="section-title"><div><p className="section-kicker">PERSONAL CONSTITUTION</p><h2>个人经营章程</h2></div><button className="text-button" type="button" onClick={() => open("profile")}>编辑</button></div><blockquote>{profile.vision || "定义你希望长期建设的人生。"}</blockquote><dl><div><dt>核心价值</dt><dd>{profile.values || "尚未定义"}</dd></div><div><dt>经营边界</dt><dd>{profile.constraints || "尚未定义"}</dd></div></dl></article><article className="card team-card"><p className="section-kicker">AGENT TEAM</p><h2>四人核心团队</h2>{[["战略架构师", "检查长期方向与机会成本"], ["运营执行官", "把承诺转成可开始的动作"], ["风险审计官", "寻找偏见、依赖与停止条件"], ["幕僚长", "整合冲突，把决定交回给你"]].map(([role, desc]) => <div className="team-row" key={role}><span>{role.slice(0, 1)}</span><div><b>{role}</b><p>{desc}</p></div></div>)}<div className="ai-status">AI 接口已预留；未配置密钥时自动使用透明的结构化分析。</div></article><article className="card reminders"><p className="section-kicker">CADENCE</p><h2>会议提醒</h2>{data.reminders.map((item) => <div className="reminder-row" key={item.id}><div><b>{item.title}</b><small>{item.weekday === null ? "每天" : `周${"日一二三四五六"[item.weekday]}`} · {item.time}</small></div><button className={`toggle ${item.enabled ? "on" : ""}`} aria-label={`${item.enabled ? "关闭" : "开启"}${item.title}`} type="button" onClick={() => void mutate("reminder.update", { id: item.id, enabled: !item.enabled, time: item.time })}><span /></button></div>)}</article></div>}
    </section>

    {panel && <div className="scrim" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="drawer" role="dialog" aria-modal="true"><header className="drawer-header"><div><p className="section-kicker">LIFEORG MEETING ROOM</p><h2>{panel === "daily" ? "每日站会" : panel === "weekly" ? "周经营会" : panel === "monthly" ? "月度战略会" : panel === "decision" ? "决策会" : panel === "goal" ? "新建目标" : "个人经营章程"}</h2></div><button className="close-button" type="button" onClick={close}>×</button></header>
      {(panel === "daily" || panel === "weekly" || panel === "monthly") && <form className="meeting-form" onSubmit={saveMeeting}><p className="agent-note"><b>幕僚长：</b>{panel === "daily" ? "只处理今天的事实、承诺和阻塞。" : panel === "weekly" ? "不评价努力程度，只检查系统是否需要调整。" : "把方向、资源和停止事项放在同一张桌上。"}</p><label>当前精力 <strong>{energy}/10</strong><input type="range" min="1" max="10" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} /></label><fieldset><legend>此刻状态</legend><div className="choice-row">{["积极", "平稳", "疲惫", "焦虑"].map((item) => <button className={mood === item ? "selected" : ""} type="button" key={item} onClick={() => setMood(item)}>{item}</button>)}</div></fieldset>{panel === "daily" ? <><Field label="昨天推进了什么？" value={notes.progress} onChange={(value) => setNotes({ ...notes, progress: value })} placeholder="事实与小进展" /><Field label="今天最重要的一个结果" value={notes.priority} onChange={(value) => setNotes({ ...notes, priority: value })} placeholder="用结果描述，而不是任务清单" /><Field label="最大的阻塞" value={notes.blocker} onChange={(value) => setNotes({ ...notes, blocker: value })} placeholder="信息、精力、依赖或目标不清" /></> : panel === "weekly" ? <><Field label="本周值得保留的成果" value={notes.wins} onChange={(value) => setNotes({ ...notes, wins: value })} /><Field label="应继续、停止或委派的事项" value={notes.unfinished} onChange={(value) => setNotes({ ...notes, unfinished: value })} /><Field label="当前最大的风险" value={notes.risk} onChange={(value) => setNotes({ ...notes, risk: value })} /><Field label="下周最重要的一个结果" value={notes.nextOutcome} onChange={(value) => setNotes({ ...notes, nextOutcome: value })} /></> : <><Field label="过去一个月最重要的变化" value={notes.wins} onChange={(value) => setNotes({ ...notes, wins: value })} /><Field label="哪些方向应加码、维持或停止" value={notes.risk} onChange={(value) => setNotes({ ...notes, risk: value })} /><Field label="下个月批准的战略重点" value={notes.reflection} onChange={(value) => setNotes({ ...notes, reflection: value })} /></>}<AgentBoard result={agent} thinking={thinking} onSummon={() => void summonAgents()} /><button className="primary-button submit-button" type="submit">批准并归档本次会议</button></form>}
      {panel === "decision" && <form className="meeting-form" onSubmit={saveDecision}><p className="agent-note"><b>原则：</b>Agent 扩展视角，但不替你决定价值排序。</p><Field input label="需要决定什么？" value={decision.title} onChange={(value) => setDecision({ ...decision, title: value })} /><Field label="可选方案（每行一个）" value={decision.options} onChange={(value) => setDecision({ ...decision, options: value })} /><AgentBoard result={agent} thinking={thinking} onSummon={() => void summonAgents()} /><Field input label="最终选择" value={decision.choice} onChange={(value) => setDecision({ ...decision, choice: value })} /><Field label="证据、权衡与不确定性" value={decision.reason} onChange={(value) => setDecision({ ...decision, reason: value })} /><button className="primary-button submit-button" type="submit">签署并进入决策日志</button></form>}
      {panel === "goal" && <form className="meeting-form" onSubmit={saveGoal}><Field input label="目标名称" value={goal.title} onChange={(value) => setGoal({ ...goal, title: value })} /><div className="form-grid"><label>领域<select value={goal.domain} onChange={(event) => setGoal({ ...goal, domain: event.target.value })}>{["科研", "事业", "成长", "健康", "关系", "生活"].map((item) => <option key={item}>{item}</option>)}</select></label><label>周期<select value={goal.horizon} onChange={(event) => setGoal({ ...goal, horizon: event.target.value })}>{["月度", "季度", "年度", "长期"].map((item) => <option key={item}>{item}</option>)}</select></label></div><Field label="为什么值得投入？" value={goal.why} onChange={(value) => setGoal({ ...goal, why: value })} /><button className="primary-button submit-button" type="submit">加入目标组合</button></form>}
      {panel === "profile" && <form className="meeting-form" onSubmit={saveProfile}><Field input label="你的称呼" value={profile.displayName} onChange={(value) => setProfile({ ...profile, displayName: value })} /><Field label="长期愿景" value={profile.vision} onChange={(value) => setProfile({ ...profile, vision: value })} /><Field label="核心价值（用逗号分隔）" value={profile.values} onChange={(value) => setProfile({ ...profile, values: value })} /><Field label="经营边界与现实约束" value={profile.constraints} onChange={(value) => setProfile({ ...profile, constraints: value })} /><button className="primary-button submit-button" type="submit">更新个人经营章程</button></form>}
    </section></div>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function Field({ label, value, onChange, placeholder = "", input = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; input?: boolean }) {
  return <label>{label}{input ? <input required value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /> : <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />}</label>;
}

function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }

function MeetingType({ number, title, detail, action, onClick }: { number: string; title: string; detail: string; action: string; onClick: () => void }) { return <article className="card meeting-type"><span>{number}</span><h2>{title}</h2><p>{detail}</p><button type="button" onClick={onClick}>{action} →</button></article>; }

function GoalPortfolio({ goals, average, onAll, onProgress }: { goals: Goal[]; average: number; onAll: () => void; onProgress: (id: number, progress: number) => void }) { return <article className="card portfolio-card"><div className="section-title"><div><p className="section-kicker">GOAL PORTFOLIO · 02</p><h2>目标组合</h2></div><button className="text-button" type="button" onClick={onAll}>管理全部 →</button></div><div className="portfolio-list">{goals.map((item) => <div key={item.id}><span className="tag">{item.domain}</span><button type="button" onClick={onAll}>{item.title}</button><input aria-label={`${item.title}进度`} type="range" min="0" max="100" value={item.progress} onChange={(event) => onProgress(item.id, Number(event.target.value))} /><b>{item.progress}%</b></div>)}</div><footer><span>组合平均进展</span><strong>{average}%</strong></footer></article>; }

function DecisionTable({ decisions, onAll, onCreate, onReview }: { decisions: Decision[]; onAll?: () => void; onCreate: () => void; onReview: (id: number) => void }) { return <article className="card decision-card"><div className="section-title"><div><p className="section-kicker">DECISION LOG · 03</p><h2>决策与复盘</h2></div><button className="text-button" type="button" onClick={onCreate}>＋ 新增决策</button></div><div className="decision-list">{decisions.length ? decisions.map((item) => <div className="decision-row" key={item.id}><span className={`decision-mark ${item.status === "reviewed" ? "done" : ""}`}>{item.status === "reviewed" ? "✓" : "?"}</span><div><h3>{item.title}</h3><p>{item.choice} · {item.reason || "尚未记录理由"}</p></div><span className="tag">{item.status === "reviewed" ? "已复盘" : "待复盘"}</span><time>{day(item.reviewAt || item.createdAt)}</time>{item.status !== "reviewed" && <button type="button" onClick={() => onReview(item.id)}>标记复盘</button>}</div>) : <Empty text="重要判断会连同当时的理由一起保存在这里。" />}</div>{onAll && <button className="card-link" type="button" onClick={onAll}>查看全部决策 →</button>}</article>; }

function AgentBoard({ result, thinking, onSummon }: { result: AgentResult | null; thinking: boolean; onSummon: () => void }) { return <section className="agent-board"><header><div><b>Agent 联席分析</b><span>{result ? result.source === "openai" ? `OpenAI · ${result.model}` : "透明结构化框架" : "由你选择何时召集"}</span></div><button type="button" disabled={thinking} onClick={onSummon}>{thinking ? "团队研判中…" : result ? "重新分析" : "召集团队分析"}</button></header>{result ? <div className="agent-grid"><article><span>战略</span><p>{result.strategy}</p></article><article><span>运营</span><p>{result.operations}</p></article><article><span>审计</span><p>{result.audit}</p></article><article className="chief"><span>幕僚长</span><p>{result.chief}</p></article></div> : <p className="agent-placeholder">系统不会在后台替你做决定。召集团队后，四个角色会围绕同一份材料给出不同视角。</p>}</section>; }
