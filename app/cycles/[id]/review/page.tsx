import { CycleReview } from "../../../features/reviews/cycle-review";
export default async function CycleReviewPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <CycleReview id={id} />; }
