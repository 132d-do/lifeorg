import { EntityDetail } from "../../../components/workspace-views";
export default async function DecisionReviewPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <EntityDetail kind="decision" id={id} review />; }
