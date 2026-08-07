export type RecommendationMutation = Record<string, unknown> & { type?: string };

function mutationSentence(mutation: RecommendationMutation) {
  if (mutation.type === "cycle.create") return `创建 7 日周期：${String(mutation.commitment || mutation.title || "执行本次建议")}`;
  if (mutation.type === "goal.create") return `创建目标：${String(mutation.title || "未命名目标")}`;
  if (mutation.type === "goal.update") return `更新目标：${String(mutation.title || mutation.goalId || "所选目标")}`;
  if (mutation.type === "decision.create") return `写入决策日志：${String(mutation.title || "本次决定")}`;
  if (mutation.type === "decision.reviewOutcome") return "为所选决策追加实际结果复盘";
  return `提交一项受控变更：${String(mutation.type || "未知类型")}`;
}

export function RecommendationEffects({ mutations = [], evidenceRecords = [], audit = false }: { mutations?: RecommendationMutation[]; evidenceRecords?: Array<{ title: string }>; audit?: boolean }) {
  const allowAudit = audit || process.env.NODE_ENV !== "production";
  return <section className="recommendation-effects" aria-label="批准影响">
    <h3>批准后会发生什么</h3>
    {mutations.length ? <ul>{mutations.map((mutation, index) => <li key={`${mutation.type || "mutation"}-${index}`}>{mutationSentence(mutation)}</li>)}</ul> : <p>当前没有可提交的经营记录变更，因此批准按钮应保持不可用。</p>}
    <div className="unchanged-records"><h4>不会改变</h4><p>个人经营章程、未列出的目标与历史记录不会被改写；证据仅用于本次判断。</p>{evidenceRecords.length > 0 && <small>只读依据：{evidenceRecords.map((item) => item.title).join("、")}</small>}</div>
    {allowAudit && <details><summary>开发与审计视图：结构化变更</summary><pre>{JSON.stringify(mutations, null, 2)}</pre></details>}
  </section>;
}
