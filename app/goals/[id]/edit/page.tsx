import { GoalEditor } from "../../../features/goals/goal-editor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GoalEditor id={id} />;
}
