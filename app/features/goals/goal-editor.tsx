"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AppShell } from "../../components/app-shell";
import { useLifeState } from "../shared/use-life-state";

export function GoalEditor({ id }: { id: string }) {
  const state = useLifeState(); const router = useRouter();
  const [pending, setPending] = useState(false); const [status, setStatus] = useState("");
  const goal = state.data.goals.find((item) => String(item.id) === id);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget); setPending(true);
    try {
      await state.mutate("goal.update", { id: Number(id), title: String(form.get("title")), domain: String(form.get("domain")), horizon: String(form.get("horizon")), why: String(form.get("why")), status: String(form.get("status")), progress: Number(form.get("progress")) });
      router.push(`/goals/${id}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "保存失败"); }
    finally { setPending(false); }
  }
  return <AppShell section="goals" status={state.status}><article className="card section-card"><Link href={`/goals/${id}`}>← 返回目标</Link><h2>调整目标与投入边界</h2>{state.notice ? <><p role="alert">{state.notice}</p><button onClick={state.retry}>重新读取</button></> : goal ? <form className="meeting-form" onSubmit={(event) => void submit(event)}><fieldset disabled={pending} className="form-fields"><label>目标<input name="title" required maxLength={300} defaultValue={goal.title} /></label><label>领域<input name="domain" required maxLength={100} defaultValue={goal.domain} /></label><label>时间范围<input name="horizon" required maxLength={100} defaultValue={goal.horizon} /></label><label>为什么值得投入<textarea name="why" maxLength={3000} defaultValue={goal.why} /></label><label>状态<select name="status" defaultValue={goal.status}><option value="active">进行中</option><option value="paused">暂停</option><option value="completed">完成</option></select></label><label>自报进度（不用于自动判断阻塞）<input name="progress" type="number" min={0} max={100} required defaultValue={goal.progress} /></label><button className="primary-button" type="submit">保存并返回目标</button></fieldset></form> : <p>{state.status === "个人记录已同步" ? "没有找到这个目标。" : "正在读取目标…"}</p>}{status && <p role="status">{status}</p>}</article></AppShell>;
}
