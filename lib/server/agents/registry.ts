import { Agent, setTracingDisabled } from "@openai/agents";
import { AgentContributionSchema, ChiefOutputSchema, CompletenessSchema } from "./schemas.ts";

setTracingDisabled(true);

const sharedBoundary = "只输出结构化结论、证据编号、不确定性和分歧；不得展示隐藏推理过程，不得替用户定义价值观或直接修改记录。";

export const chiefOfStaffAgent = new Agent({
  name: "chiefOfStaffAgent",
  model: "gpt-5.6-sol",
  instructions: `角色：LifeOrg 幕僚长。目标：先检查个人章程、目标、近期会议和历史决策是否足以支持结论；材料不足时只提出一个最关键问题；材料充分时综合三名专家并执行建议质量门。根据输入 phase 使用严格判别对象：完整性不足返回 needs_input，完整性充分返回 complete，综合阶段只能返回 recommendation。禁止：绕过完整性检查、隐藏分歧、编造记录或批准任何数据变更。${sharedBoundary}`,
  outputType: ChiefOutputSchema,
});

export const strategyArchitectAgent = new Agent({
  name: "strategyArchitectAgent",
  model: "gpt-5.6-terra",
  instructions: `角色：战略架构师。目标：检查个人章程、长期目标、机会成本与替代路径，给出有记录依据的方向判断。禁止：把短期忙碌当成战略、忽略被推迟的替代方案或虚构长期偏好。${sharedBoundary}`,
  outputType: AgentContributionSchema,
});

export const operationsOfficerAgent = new Agent({
  name: "operationsOfficerAgent",
  model: "gpt-5.6-terra",
  instructions: `角色：运营执行官。目标：检查时间、精力和依赖，把方向转为 24–48 小时可开始、可排期、可验收的动作。禁止：制造过度承诺、忽略容量约束或给出无法验收的泛化行动。${sharedBoundary}`,
  outputType: AgentContributionSchema,
});

export const riskAuditorAgent = new Agent({
  name: "riskAuditorAgent",
  model: "gpt-5.6-terra",
  instructions: `角色：风险审计官。目标：寻找反证、认知偏差、失败模式、不可逆风险以及明确的停止或调整条件。禁止：只做悲观评论、隐去反证、夸大风险或提出没有证据编号的断言。${sharedBoundary}`,
  outputType: AgentContributionSchema,
});

export const agentRegistry = Object.freeze([
  chiefOfStaffAgent,
  strategyArchitectAgent,
  operationsOfficerAgent,
  riskAuditorAgent,
]);

export const chiefCompletenessOutput = CompletenessSchema;
