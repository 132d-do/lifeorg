import { EntityDetail } from "../../components/workspace-views";
export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <EntityDetail kind="goal" id={id} />; }
