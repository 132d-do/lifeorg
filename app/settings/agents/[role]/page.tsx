import { notFound } from "next/navigation";
import { AppShell } from "../../../components/app-shell";
import { AgentGuide } from "../../../features/settings/agent-directory";
import { agentContracts, type AgentRole } from "../../../../lib/agent-contracts";

export default async function Page({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (!Object.hasOwn(agentContracts, role)) notFound();
  return <AppShell section="settings"><AgentGuide role={role as AgentRole} /></AppShell>;
}
