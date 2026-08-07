import { notFound } from "next/navigation";
import { MeetingIntake } from "../../../features/meetings/meeting-intake";
const kinds = new Set(["daily", "weekly", "monthly", "decision"]);
export default async function NewMeetingPage({ params }: { params: Promise<{ kind: string }> }) { const { kind } = await params; if (!kinds.has(kind)) notFound(); return <MeetingIntake kind={kind} />; }
