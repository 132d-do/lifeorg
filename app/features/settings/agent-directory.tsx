import Link from "next/link";
import { agentContracts, type AgentRole } from "../../../lib/agent-contracts";

export function AgentDirectory() {
  return <div className="goal-grid">{Object.entries(agentContracts).map(([role, contract]) => <article className="card section-card" key={role}><p className="section-kicker">{role.toUpperCase()}</p><h2>{contract.title}</h2><p>{contract.goal}</p><Link href={`/settings/agents/${role}`}>查看职责、方法与交付标准 →</Link></article>)}</div>;
}

export function AgentGuide({ role }: { role: AgentRole }) {
  const contract = agentContracts[role];
  return <div className="content-stack"><article className="card section-card"><Link href="/settings/agents">← 四名 Agent</Link><h2>{contract.title}</h2><p>{contract.goal}</p><p>此页面与服务端 Agent 指令共用同一份角色契约。以下是公开工作方法，不是模型的隐藏推理过程。</p></article>{[["需要的材料", contract.inputs], ["工作方法", contract.method], ["禁止事项", contract.forbidden], ["必须交付", Object.values(contract.outputs)]].map(([title, items]) => <section className="card section-card" key={String(title)}><h3>{title}</h3><ol>{(items as readonly string[]).map((item) => <li key={item}>{item}</li>)}</ol></section>)}<section className="card section-card"><h3>通过会议协作，不是四个互不相干的聊天框</h3><p>日常可逆问题可只召集运营；复杂决策由战略、运营、审计独立评议，幕僚长综合。实际参与者会记录在会议中。</p><div className="meeting-actions"><Link className="primary-button" href="/meetings/new/decision">召集深度决策会</Link><Link href="/settings/integrations/openai">检查真实模型连接</Link></div></section></div>;
}
