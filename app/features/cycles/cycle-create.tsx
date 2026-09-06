"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { protectedFetch, useLifeState } from "../shared/use-life-state";

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toLocaleDateString("en-CA");
}

export function CycleCreate() {
  const state = useLifeState();
  const router = useRouter();
  const search = useSearchParams();
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const goals = useMemo(() => state.data.goals.filter((goal) => goal.status === "active"), [state.data.goals]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const storageKey = "lifeorg:cycle:create:manual";
    const prior = window.sessionStorage.getItem(storageKey);
    const payload = prior ? JSON.parse(prior) as Record<string, unknown> : {
      clientRequestId: crypto.randomUUID(), commitment: String(form.get("commitment") || "").trim(),
      startLocalDate: String(form.get("startLocalDate")), reviewLocalDate: String(form.get("reviewLocalDate")),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
      successCriterion: String(form.get("successCriterion") || "").trim(),
      stopOrAdjustCondition: String(form.get("stopOrAdjustCondition") || "").trim(),
      source: { type: "manual_goal", goalId: Number(form.get("goalId")) },
    };
    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    setPending(true); setStatus("正在建立唯一承诺…");
    try {
      const response = await protectedFetch("/api/cycles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { cycle?: { id: string }; error?: string };
      if (!response.ok || !body.cycle) { if ([400, 409, 422].includes(response.status)) window.sessionStorage.removeItem(storageKey); throw new Error(body.error === "active_cycle_exists" ? "已有进行中的唯一承诺，请先完成或停止它。" : body.error || "周期创建失败"); }
      window.sessionStorage.removeItem(storageKey); router.push(`/cycles/${body.cycle.id}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "周期创建失败"); }
    finally { setPending(false); }
  }

  return <AppShell section="cycles" status={status || state.status}><div className="content-stack cycle-cockpit">
    <section className="card section-card"><p className="section-kicker">MANUAL SEVEN-DAY CYCLE</p><h2>从已有目标开启一个可验证承诺</h2><p>不需要等待 Agent。只选一个当前目标，把它缩小成七天内能观察结果的行动。</p></section>
    <section className="card section-card">{goals.length ? <form className="meeting-form" onSubmit={(event) => void submit(event)}>
      <label>关联目标<select required name="goalId" defaultValue={search.get("goalId") || undefined}>{goals.map((goal) => <option value={goal.id} key={goal.id}>{goal.title}</option>)}</select></label>
      <label>未来七天唯一承诺<textarea required minLength={3} name="commitment" /></label>
      <div className="form-grid"><label>开始日期<input required type="date" name="startLocalDate" defaultValue={localDate()} /></label><label>复盘日期<input required type="date" name="reviewLocalDate" defaultValue={localDate(7)} /></label></div>
      <label>可验收的成功标准<textarea required minLength={3} name="successCriterion" /></label>
      <label>停止或调整条件<textarea required minLength={3} name="stopOrAdjustCondition" /></label>
      <div className="meeting-actions"><button className="primary-button" type="submit" disabled={pending}>开启七天周期</button><Link href="/cycles">返回周期</Link></div>
    </form> : <><h3>先建立一个目标</h3><p>手动周期必须归属于你已有的目标，避免产生无来源任务。</p><Link className="primary-button" href="/goals/new">新建目标</Link></>}</section>
  </div></AppShell>;
}
