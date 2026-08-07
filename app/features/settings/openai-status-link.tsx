"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { protectedFetch } from "../shared/use-life-state";

type OpenAIStatus = { configured?: boolean; availableModels?: string[]; models?: string[] };

export function OpenAIStatusLink() {
  const [label, setLabel] = useState("正在检查 Agent 连接…");
  const [tone, setTone] = useState("checking");

  useEffect(() => {
    const timer = window.setTimeout(() => void protectedFetch("/api/integrations/openai/status")
      .then(async (response) => {
        const body = await response.json() as OpenAIStatus;
        if (!response.ok) throw new Error("status unavailable");
        if (body.configured) { setLabel("真实 Agent 已连接"); setTone("connected"); }
        else { setLabel("结构化离线模式"); setTone("offline"); }
      })
      .catch(() => { setLabel("连接异常"); setTone("error"); }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <Link className={`openai-status ${tone}`} href="/settings/integrations/openai" aria-label={`OpenAI 集成：${label}`}>
    <span aria-hidden="true" />{label}
  </Link>;
}
