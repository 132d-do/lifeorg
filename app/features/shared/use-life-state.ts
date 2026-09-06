"use client";

import { useEffect, useState } from "react";
import { createSessionFetch } from "../../../lib/client/session-bootstrap";

export type Profile = { displayName: string; vision: string; values: string; constraints: string };
export type Goal = { id: number; title: string; domain: string; horizon: string; why: string; progress: number; status: string };
export type Meeting = { id: number; type: string; title: string; topic?: string; lifecycleStatus?: string; approvalStatus?: string; energy: number | null; mood: string | null; summary: string; createdAt: string };
export type Decision = { id: number; title: string; options?: string[]; choice: string; reason: string; status: string; reviewAt: string | null; createdAt: string };
export type Reminder = { id: number; title: string; time: string; weekday: number | null; enabled: boolean };
export type LifeState = { profile: Profile; goals: Goal[]; meetings: Meeting[]; decisions: Decision[]; reminders: Reminder[] };

export const emptyState: LifeState = {
  profile: { displayName: "人生经营者", vision: "", values: "", constraints: "" },
  goals: [], meetings: [], decisions: [], reminders: [],
};

export const protectedFetch = createSessionFetch();

export function useLifeState() {
  const [data, setData] = useState(emptyState);
  const [status, setStatus] = useState("正在连接个人经营记录…");
  const [notice, setNotice] = useState("");

  async function load() {
    setStatus("正在同步…");
    try {
      const response = await protectedFetch("/api/state");
      const result = await response.json() as { data?: LifeState; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error || "读取失败");
      setData(result.data); setStatus("个人记录已同步"); setNotice("");
    } catch {
      setStatus("同步中断"); setNotice("暂时无法连接个人记录，你可以稍后重试。");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function mutate(action: string, payload: Record<string, unknown>) {
    setStatus("正在保存…");
    const response = await protectedFetch("/api/state", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }),
    });
    const result = await response.json() as { data?: LifeState; error?: string; createdId?: number };
    if (!response.ok || !result.data) {
      setStatus("保存失败"); throw new Error(result.error || "保存失败");
    }
    setData(result.data); setStatus("个人记录已同步");
    return { ...result.data, createdId: result.createdId };
  }

  return { data, status, notice, retry: () => void load(), mutate };
}
