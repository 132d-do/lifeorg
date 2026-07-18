import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type AgentResult = {
  strategy: string;
  operations: string;
  audit: string;
  chief: string;
  recommendation: string;
  source: "openai" | "framework";
  model?: string;
};

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1200) : fallback;
}

function framework(mode: string, context: Record<string, unknown>): AgentResult {
  const priority = text(context.priority ?? context.nextOutcome ?? context.choice, "先确定一个可验证的核心结果");
  const blocker = text(context.blocker ?? context.risk, "暂未识别明确阻塞");
  return {
    strategy: `先检查“${priority}”是否服务于长期目标，并明确本轮不处理的事项。`,
    operations: `把“${priority}”转化为一个90分钟内可以开始的动作，并在日历中预留时间。`,
    audit: `主要风险是：${blocker}。建议设定停止条件，避免继续叠加任务。`,
    chief: mode === "decision" ? "团队意见已汇总；选择应同时满足长期一致性、可执行性与可逆性。" : "团队建议缩小承诺范围，用下一次会议的真实结果校准计划。",
    recommendation: `批准一个最小承诺：推进“${priority}”，先解除“${blocker}”，其余事项进入候选清单。`,
    source: "framework",
  };
}

async function callModel(apiKey: string, model: string, role: string, context: Record<string, unknown>) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      reasoning: { effort: "low" },
      store: false,
      instructions: `你是 LifeOrg 的${role}。用户是最终CEO。用中文给出一段80字以内、具体、克制、可执行的意见。指出关键权衡，不替用户决定价值观。`,
      input: `本次会议材料：${JSON.stringify(context)}`,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  return data.output_text ?? data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "未生成意见";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { mode?: string; context?: Record<string, unknown>; profile?: Record<string, unknown> };
    const mode = body.mode ?? "daily";
    const context = { ...(body.profile ?? {}), ...(body.context ?? {}) };
    const runtime = env as unknown as Record<string, string | undefined>;
    const apiKey = runtime.OPENAI_API_KEY;
    const model = runtime.OPENAI_MODEL || "gpt-5.6-terra";
    if (!apiKey) return Response.json({ result: framework(mode, context) });

    const [strategy, operations, audit] = await Promise.all([
      callModel(apiKey, model, "战略架构师", context),
      callModel(apiKey, model, "运营执行官", context),
      callModel(apiKey, model, "风险审计官", context),
    ]);
    const chief = await callModel(apiKey, model, "幕僚长", { ...context, strategy, operations, audit, task: "综合三方意见，指出共识、冲突和CEO需要判断的事项" });
    const result: AgentResult = { strategy, operations, audit, chief, recommendation: chief, source: "openai", model };
    return Response.json({ result });
  } catch (error) {
    return Response.json({ result: framework("fallback", {}), warning: error instanceof Error ? error.message : "Agent暂时不可用" });
  }
}
