const mutationLabels: Record<string, string> = { title: "标题", goalId: "目标编号", progress: "进度将设为（%）", status: "状态将设为", domain: "领域", horizon: "时间范围", why: "投入理由", targetDate: "目标日期", options: "备选方案", choice: "选择", reason: "理由", reviewAt: "复查时间", decisionId: "决策编号", outcome: "实际结果", observedAt: "观察时间", commitment: "唯一承诺", startLocalDate: "开始日期", reviewLocalDate: "复盘日期", timeZone: "时区", successCriterion: "成功标准", stopOrAdjustCondition: "停止或调整条件", predictionId: "预测编号" };

export type RecommendationMutation = Record<string, unknown> & { type?: string };

function mutationSentence(mutation: RecommendationMutation) {
  if (mutation.type === "cycle.create") return `创建 7 日周期：${String(mutation.commitment || mutation.title || "执行本次建议")}`;
  if (mutation.type === "goal.create") return `创建目标：${String(mutation.title || "未命名目标")}`;
  if (mutation.type === "goal.update") return `更新目标：${String(mutation.title || mutation.goalId || "所选目标")}`;
  if (mutation.type === "decision.create") return `写入决策日志：${String(mutation.title || "本次决定")}`;
  if (mutation.type === "decision.reviewOutcome") return "为所选决策追加实际结果复盘";
  return `提交一项受控变更：${String(mutation.type || "未知类型")}`;
}

export function RecommendationEffects({ mutations = [], evidenceRecords = [], existingCycle, audit = false }: { mutations?: RecommendationMutation[]; evidenceRecords?: Array<{ title: string }>; existingCycle?: { recordId: string; updatedAt: string }; audit?: boolean }) {
  const allowAudit = audit || process.env.NODE_ENV !== "production";
  return <section className="recommendation-effects" aria-label="批准影响">
    <h3>批准后会发生什么</h3>
    {mutations.length ? <ul>{mutations.map((mutation, index) => <li key={`${mutation.type || "mutation"}-${index}`}>{mutationSentence(mutation)}<dl>{Object.entries(mutation).filter(([key]) => key !== "type").map(([key, value]) => <div key={key}><dt>{mutationLabels[key] ?? key}</dt><dd>{Array.isArray(value) ? value.join("；") : String(value ?? "未设定")}</dd></div>)}</dl></li>)}</ul> : <p>{existingCycle ? "记录本次采纳决定，并继续现有周期；不创建新周期、不自动改写承诺。需要调整时请进入周期详情，单独确认调整。" : "当前没有可提交的经营记录变更，因此批准按钮应保持不可用。"}</p>}
    <div className="unchanged-records"><h4>不会改变</h4><p>个人经营章程、未列出的目标与历史记录不会被改写；证据仅用于本次判断。</p>{evidenceRecords.length > 0 && <small>只读依据：{evidenceRecords.map((item) => item.title).join("、")}</small>}</div>
    {allowAudit && <details><summary>开发与审计视图：结构化变更</summary><pre>{JSON.stringify(mutations, null, 2)}</pre></details>}
  </section>;
}
