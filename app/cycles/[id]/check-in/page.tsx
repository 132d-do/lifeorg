import { CycleCheckIn } from "../../../features/cycles/cycle-check-in";
export default async function CycleCheckInPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <CycleCheckIn id={id} />; }

