import { DecisionOutcomeReview } from "../../../components/workspace-views";
export default async function DecisionReviewPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <DecisionOutcomeReview id={id} />; }
