"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createCommitGate, settleOptimistic } from "../../lib/ui-contract";

export function FocusTimer() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("计时器已就绪");
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => {
      if (value <= 1) { setRunning(false); setMessage("专注完成，请记录结果再决定下一步"); return 25 * 60; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const label = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <div><button className={`focus-button ${running ? "running" : ""}`} data-action="timer" type="button" aria-pressed={running} onClick={() => { setRunning((value) => !value); setMessage(running ? "计时已暂停" : "专注计时进行中"); }}>{running ? `暂停 ${label}` : "开始 25 分钟专注"}</button><span className="sr-only" role="status">{message}</span></div>;
}

export function ProgressControl({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => Promise<unknown> }) {
  const [current, setCurrent] = useState(value);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const gate = useMemo(() => createCommitGate(), []);
  async function commit() {
    setBusy(true);
    try {
      const result = await gate.run(() => settleOptimistic(value, current, onCommit));
      setCurrent(result.value);
      setStatus(result.status === "saved" ? `已保存 ${result.value}%` : `保存失败，已恢复为 ${result.value}%`);
    } finally { setBusy(false); }
  }
  return <div><label>{label}<input data-action="progress" aria-label={`${label}进度`} type="range" min="0" max="100" value={current} disabled={busy} onChange={(event) => setCurrent(Number(event.target.value))} /></label><button data-action="progress-save" type="button" disabled={busy} onClick={() => void commit()}>{busy ? "正在保存…" : "保存进度"}</button><span role="status">{status || `${current}%（尚未保存）`}</span></div>;
}

export function ReminderToggle({ label, initial, onToggle }: { label: string; initial: boolean; onToggle?: (enabled: boolean) => Promise<unknown> }) {
  const [enabled, setEnabled] = useState(initial);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const gate = useMemo(() => createCommitGate(), []);
  async function toggle() {
    const previous = enabled; const next = !enabled;
    setEnabled(next); setBusy(true); setStatus("正在保存提醒设置…");
    try {
      const result = await gate.run(() => settleOptimistic(previous, next, onToggle));
      setEnabled(result.value); setStatus(result.status === "saved" ? "提醒设置已保存" : "保存失败，已恢复原设置");
    } finally { setBusy(false); }
  }
  return <div><button className={`toggle ${enabled ? "on" : ""}`} data-action="toggle" type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? "关闭" : "开启"}${label}`} disabled={busy} onClick={() => void toggle()}><span /></button><span className="sr-only" role="status">{status}</span></div>;
}

export function MoodChoices({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <fieldset><legend>此刻状态</legend><div className="choice-row">{["积极", "平稳", "疲惫", "焦虑"].map((mood) => <button data-action="mood" className={value === mood ? "selected" : ""} type="button" aria-pressed={value === mood} key={mood} onClick={() => onChange(mood)}>{mood}</button>)}</div></fieldset>;
}

export function ActionForm({ onSubmit, children, submitLabel = "保存并继续" }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode; submitLabel?: string }) {
  return <form className="meeting-form" onSubmit={onSubmit}>{children}<button className="primary-button submit-button" data-action="submit" type="submit">{submitLabel}</button><button data-action="cancel" type="reset">取消本次编辑</button></form>;
}

export function MeetingActions({ onAnalyze, onReject, onApprove, busy = false }: { onAnalyze: () => void; onReject: () => void; onApprove: () => void; busy?: boolean }) {
  return <div className="meeting-actions"><button data-action="analyze" type="button" disabled={busy} onClick={onAnalyze}>{busy ? "正在评议…" : "召集 Agent 评议"}</button><button data-action="retry" type="button" onClick={onAnalyze}>重新分析</button><button data-action="reject" type="button" onClick={onReject}>否决并修改</button><button data-action="approve" className="primary-button" type="button" onClick={onApprove}>批准建议</button></div>;
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  return <button className="close-button" data-action="close" aria-label="关闭" type="button" onClick={onClose}>×</button>;
}
