"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

type Panel = "standup" | "weekly" | "decision" | "brief" | null;
type SavedDecision = { id: number; title: string; choice: string; reason: string; status: string; date: string };

const seedDecisions: SavedDecision[] = [
  { id: 1, title: "论文下一轮重构方向", choice: "联合轨迹 + 远期结局", reason: "优先提高结果创新性", status: "待复盘", date: "今天" },
  { id: 2, title: "暑期项目与科研时间分配", choice: "科研优先，保留固定休息", reason: "长期目标更一致", status: "已决定", date: "7月16日" },
  { id: 3, title: "周末是否保留半天休息", choice: "保留", reason: "避免持续过载", status: "观察中", date: "7月13日" },
];

const navItems: Array<[string, string, Panel | "later"]> = [
  ["总览", "⌂", null], ["每日站会", "✓", "standup"], ["周经营会", "▥", "weekly"],
  ["决策日志", "◇", "decision"], ["长期规划", "⚑", "later"],
];

export default function Home() {
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState("");
  const [energy, setEnergy] = useState(7);
  const [mood, setMood] = useState("平稳");
  const [yesterday, setYesterday] = useState("");
  const [priority, setPriority] = useState("");
  const [blocker, setBlocker] = useState("");
  const [wins, setWins] = useState("");
  const [unfinished, setUnfinished] = useState("");
  const [risk, setRisk] = useState("");
  const [nextOutcome, setNextOutcome] = useState("");
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionOptions, setDecisionOptions] = useState("");
  const [decisionChoice, setDecisionChoice] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisions, setDecisions] = useState<SavedDecision[]>(seedDecisions);
  const [standups, setStandups] = useState(0);
  const [weeklyReviews, setWeeklyReviews] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [focusLeft, setFocusLeft] = useState(25 * 60);
  const [focusing, setFocusing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("lifeorg-mvp");
        if (saved) {
          const data = JSON.parse(saved);
          if (Array.isArray(data.decisions)) setDecisions(data.decisions);
          setStandups(data.standups || 0);
          setWeeklyReviews(data.weeklyReviews || 0);
        }
      } catch { /* Device-local data may be unavailable in private mode. */ }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("lifeorg-mvp", JSON.stringify({ decisions, standups, weeklyReviews })); } catch { /* no-op */ }
  }, [decisions, standups, weeklyReviews, hydrated]);

  useEffect(() => {
    if (!focusing) return;
    const timer = window.setInterval(() => setFocusLeft((value) => {
      if (value <= 1) { setFocusing(false); setToast("专注完成。休息一下，再决定下一步。"); return 25 * 60; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [focusing]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const dateLabel = useMemo(() => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date()), []);
  const focusLabel = `${String(Math.floor(focusLeft / 60)).padStart(2, "0")}:${String(focusLeft % 60).padStart(2, "0")}`;
  const score = Math.min(96, 62 + energy * 2 + (standups > 0 ? 4 : 0));

  function notify(message: string) { setToast(message); }
  function open(next: Panel) { setPanel(next); }
  function close() { setPanel(null); }

  function saveStandup(event: FormEvent) {
    event.preventDefault();
    if (!priority.trim()) return notify("先写下今天最重要的结果。");
    setStandups((count) => count + 1);
    close();
    notify(`站会完成：今天优先推进“${priority.trim()}”。`);
  }

  function saveWeekly(event: FormEvent) {
    event.preventDefault();
    if (!nextOutcome.trim()) return notify("请确定下周最重要的一个结果。");
    setWeeklyReviews((count) => count + 1);
    close();
    notify("周经营会已归档，幕僚长已把结果转入下周计划。");
  }

  function saveDecision(event: FormEvent) {
    event.preventDefault();
    if (!decisionTitle.trim() || !decisionChoice.trim()) return notify("请填写决策主题与最终选择。");
    setDecisions((items) => [{ id: Date.now(), title: decisionTitle.trim(), choice: decisionChoice.trim(), reason: decisionReason.trim() || "待补充理由", status: "已决定", date: "刚刚" }, ...items]);
    setDecisionTitle(""); setDecisionOptions(""); setDecisionChoice(""); setDecisionReason("");
    close(); notify("决策已记录。系统会在一周后提醒你复盘。");
  }

  const panelTitle = panel === "standup" ? "每日站会" : panel === "weekly" ? "周经营会" : panel === "decision" ? "决策日志" : "幕僚长简报";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block"><div className="brand">LifeOrg</div><div className="brand-subtitle">个人经营系统</div></div>
        <nav className="nav-list" aria-label="主导航">
          {navItems.map(([label, icon, target], index) => (
            <button className={`nav-item ${index === 0 && !panel ? "active" : ""}`} key={label} type="button" onClick={() => target === "later" ? notify("长期规划会将在下一版本开放。先让日、周闭环稳定运行。") : setPanel(target)}>
              <span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="profile"><div className="avatar">让</div><div><strong>让嘉诚</strong><span>人生经营者</span></div><span className="chevron" aria-hidden="true">⌄</span></div>
      </aside>

      <section className="workspace">
        <header className="page-header">
          <div><p className="eyebrow">{dateLabel}</p><h1>早上好，让嘉诚</h1></div>
          <button className={`focus-button ${focusing ? "running" : ""}`} type="button" onClick={() => setFocusing((value) => !value)}>
            <span aria-hidden="true">{focusing ? "Ⅱ" : "☼"}</span> {focusing ? `专注中 ${focusLabel}` : "开始专注"}
          </button>
        </header>

        <div className="dashboard-grid">
          <article className="card standup-card">
            <div><p className="section-kicker">DAILY BRIEF · 01</p><h2>今天，先把最重要的事情做对。</h2><p className="muted">你的团队已完成晨间准备，等待你主持今日站会。</p></div>
            <button className="primary-button" type="button" onClick={() => open("standup")}>开始每日站会 <span>· 3分钟</span></button>
            <div className="status-pills"><span><b>ϟ</b> 精力 <strong>{energy}/10</strong></span><span><b>☺</b> 心情 <strong>{mood}</strong></span><span><b>▣</b> 本机记录 <strong>{standups}</strong></span></div>
          </article>

          <article className="card status-card"><div className="card-heading-row"><h3>今日状态</h3><span className="live-dot">实时</span></div><div className="score-ring" style={{ "--score": `${score}%` } as CSSProperties}><span>{score}</span></div><p>{score >= 78 ? "状态良好，适合推进深度工作" : "降低负荷，优先处理一个关键事项"}</p></article>

          <div className="chief-brief"><span className="brief-icon" aria-hidden="true">▧</span><span>幕僚长已整理 <strong>2</strong> 项阻塞与 <strong>1</strong> 项机会</span><button type="button" onClick={() => open("brief")}>查看简报 →</button></div>

          <article className="card weekly-card">
            <div className="card-heading-row"><div><p className="section-kicker">WEEKLY REVIEW · 02</p><h3>本周经营概览</h3></div><button className="text-button" type="button" onClick={() => open("weekly")}>进入周会 →</button></div>
            <div className="metrics"><div><span>核心目标</span><strong>3</strong></div><div><span>已完成</span><strong>7</strong></div><div><span>进行中</span><strong>4</strong></div><div><span>风险项</span><strong className="risk">1</strong></div></div>
            <div className="progress-track" aria-label="本周完成率64%"><span /></div><div className="progress-caption"><span>完成率 <b>64%</b></span><span>已完成 {weeklyReviews} 次周会</span></div>
          </article>

          <article className="card decisions-card">
            <div className="card-heading-row"><div><p className="section-kicker">DECISION LOG · 03</p><h3>最近决策</h3></div><button className="text-button" type="button" onClick={() => open("decision")}>新增决策 ＋</button></div>
            <div className="decision-list">{decisions.slice(0, 3).map((item, index) => {
              const tone = item.status === "已决定" ? "green" : item.status === "待复盘" ? "amber" : "neutral";
              return <button className="decision-row" type="button" key={item.id} onClick={() => notify(`${item.title}：${item.choice}。${item.reason}`)}><span className={`decision-mark ${tone}`} aria-hidden="true">{tone === "green" ? "✓" : tone === "amber" ? "?" : "○"}</span><span className="decision-title">{item.title}</span><span className={`tag ${tone}`}>{item.status}</span><time>{index === 0 && item.date === "刚刚" ? "刚刚" : item.date}</time></button>;
            })}</div>
          </article>
        </div>
      </section>

      {panel && <div className="scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
        <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="panel-title">
          <header className="drawer-header"><div><p className="section-kicker">LIFEORG MEETING ROOM</p><h2 id="panel-title">{panelTitle}</h2></div><button className="close-button" type="button" aria-label="关闭" onClick={close}>×</button></header>

          {panel === "standup" && <form className="meeting-form" onSubmit={saveStandup}>
            <p className="agent-note"><b>幕僚长</b>：我们只处理今天，不试图一次解决整个人生。</p>
            <label>今天的精力：<strong>{energy}/10</strong><input type="range" min="1" max="10" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} /></label>
            <fieldset><legend>此刻的状态</legend><div className="choice-row">{["积极", "平稳", "疲惫", "焦虑"].map((value) => <button className={mood === value ? "selected" : ""} type="button" key={value} onClick={() => setMood(value)}>{value}</button>)}</div></fieldset>
            <label>昨天推进了什么？<textarea value={yesterday} onChange={(event) => setYesterday(event.target.value)} placeholder="哪怕只是一个小进展" /></label>
            <label>今天最重要的一个结果是什么？<textarea required value={priority} onChange={(event) => setPriority(event.target.value)} placeholder="用结果描述，而不是列一串任务" /></label>
            <label>最大的阻塞是什么？<textarea value={blocker} onChange={(event) => setBlocker(event.target.value)} placeholder="信息不足、精力、依赖他人，或目标不清" /></label>
            <div className="agent-summary"><span>战略 Agent</span><p>建议把今天的可用资源集中在一个能产生明确进展的结果上。</p><span>运营 Agent</span><p>{priority ? `优先为“${priority}”保留第一个不被打断的时间块。` : "完成填写后生成今日执行建议。"}</p><span>审计 Agent</span><p>{blocker ? `已识别阻塞：“${blocker}”。站会后先处理它。` : "目前尚未发现明确阻塞。"}</p></div>
            <button className="primary-button submit-button" type="submit">批准今日计划</button>
          </form>}

          {panel === "weekly" && <form className="meeting-form" onSubmit={saveWeekly}>
            <p className="agent-note"><b>幕僚长</b>：周会不是评价你够不够努力，而是检查系统是否需要调整。</p>
            <label>本周最值得保留的进展<textarea value={wins} onChange={(event) => setWins(event.target.value)} placeholder="成果、关系、健康或新的认识" /></label>
            <label>没有完成的事项<textarea value={unfinished} onChange={(event) => setUnfinished(event.target.value)} placeholder="哪些应继续，哪些应停止？" /></label>
            <label>当前最大的风险<textarea value={risk} onChange={(event) => setRisk(event.target.value)} placeholder="过载、冲突、拖延或机会成本" /></label>
            <label>下周最重要的一个结果<textarea required value={nextOutcome} onChange={(event) => setNextOutcome(event.target.value)} placeholder="下周结束时，希望看见什么变化？" /></label>
            <div className="agent-summary"><span>战略 Agent</span><p>{nextOutcome ? `资源配置建议：优先保障“${nextOutcome}”。` : "等待确认下周核心结果。"}</p><span>审计 Agent</span><p>{risk ? `风险已登记：“${risk}”。建议设定中止条件。` : "请主动记录一个可能使计划失效的风险。"}</p></div>
            <button className="primary-button submit-button" type="submit">批准下周经营方案</button>
          </form>}

          {panel === "decision" && <form className="meeting-form" onSubmit={saveDecision}>
            <p className="agent-note"><b>决策原则</b>：Agent 提供视角，你保留最终判断和否决权。</p>
            <label>需要决定什么？<input required value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} placeholder="例如：论文下一步采用哪种重构方案" /></label>
            <label>有哪些可选方案？<textarea value={decisionOptions} onChange={(event) => setDecisionOptions(event.target.value)} placeholder="每行一个方案，允许包含“暂不决定”" /></label>
            <div className="agent-summary"><span>战略 Agent</span><p>优先比较它与长期目标的一致性，而不只是眼前收益。</p><span>运营 Agent</span><p>检查时间、精力和依赖条件，选择下一步最清楚的方案。</p><span>审计 Agent</span><p>注意沉没成本、名望偏见，以及不可逆后果。</p></div>
            <label>你的最终选择<input required value={decisionChoice} onChange={(event) => setDecisionChoice(event.target.value)} placeholder="CEO 最终批准的方案" /></label>
            <label>为什么这样选？<textarea value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="记录当时的证据、权衡和不确定性" /></label>
            <button className="primary-button submit-button" type="submit">签署并写入决策日志</button>
          </form>}

          {panel === "brief" && <div className="brief-panel">
            <div className="brief-card"><span>阻塞 01</span><h3>论文方向仍有多个候选方案</h3><p>建议先定义“创新性”评判标准，再比较联合轨迹、远期结局和方法重构。</p><button type="button" onClick={() => { close(); open("decision"); }}>发起决策会 →</button></div>
            <div className="brief-card"><span>阻塞 02</span><h3>申请与科研任务存在时间冲突</h3><p>本周任务数已接近负荷上限，新增事项应替换旧事项，而不是继续叠加。</p></div>
            <div className="brief-card opportunity"><span>机会 01</span><h3>LifeOrg 可以发展为 HCI 研究原型</h3><p>可比较多 Agent 组织隐喻与单一 AI 教练对个人能动性、认知负荷和计划遵从的影响。</p></div>
          </div>}
        </section>
      </div>}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
