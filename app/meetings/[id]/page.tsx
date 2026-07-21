import { GuidedMeetingRoom } from "../../components/workspace-views";
export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <GuidedMeetingRoom id={id} />; }
