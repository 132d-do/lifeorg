import Link from "next/link";
import { agentContracts } from "../../../lib/agent-contracts";

export function recordHref(id: string) {
  const [type, ...parts] = id.split(":"); const value = encodeURIComponent(parts.join(":"));
  if (type === "profile") return "/settings/profile";
  const prefix: Record<string, string> = { goal: "goals", decision: "decisions", meeting: "meetings", cycle: "cycles" };
  return prefix[type] && value ? `/${prefix[type]}/${value}` : null;
}

export function MessageContent({ role, content, records }: { role: string; content: unknown; records: Array<{ id: string; title: string }> }) {
  const entry = Object.entries(agentContracts).find(([, contract]) => contract.name === role);
  const value = content && typeof content === "object" ? content as Record<string, unknown> : {};
  const text = value.message ?? value.question ?? value.conclusion;
  return <article className={`message ${role}`}><b>{role === "user" ? "CEO · 你的发言" : entry ? <Link href={`/settings/agents/${entry[0]}`}>{entry[1].title}</Link> : "会议记录"}</b>
    {typeof text === "string" && <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>}
    {value.status === "offline" && <p>结构化离线模式：本轮未完成真实 Agent 评议。你的发言已保存。<Link href="/settings/integrations/openai">检查连接</Link>，或<Link href="/cycles/new">建立自己的行动周期</Link>。</p>}
    {value.status === "ready" && <p>幕僚长已形成建议，详见本页的证据、分歧与批准影响。</p>}
    {value.assessment && typeof value.assessment === "object" ? <dl>{Object.entries(value.assessment).map(([key, finding]) => <div key={key}><dt>{(entry?.[1].outputs as Record<string, string> | undefined)?.[key] ?? key}</dt><dd>{String(finding)}</dd></div>)}</dl> : null}
    {Array.isArray(value.evidenceIds) && <ul>{value.evidenceIds.filter((id): id is string => typeof id === "string").map((id) => { const record = records.find((record) => record.id === id); const href = recordHref(id); return <li key={id}>{href ? <Link href={href}>{record?.title ?? "查看来源记录"}</Link> : record?.title ?? "本次已选证据"}</li>; })}</ul>}
    {typeof value.uncertainty === "string" && <p>仍未知：{value.uncertainty || "未单列"}</p>}
    {Array.isArray(value.disagreements) && value.disagreements.length > 0 && <p>分歧：{value.disagreements.join("；")}</p>}
  </article>;
}
