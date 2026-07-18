# LifeOrg · 个人经营系统

LifeOrg 把“经营组织”的方法转化为个人可执行的日、周、月管理闭环。用户始终是最终 CEO，Agent 团队负责补充视角、识别风险和整理行动，不替用户决定价值排序。

线上版本：[lifeorg.dovis3970.chatgpt.site](https://lifeorg.dovis3970.chatgpt.site)

## 核心能力

- 每日站会、周经营会与月度战略会
- 目标组合、进度更新和领域资源分布
- 决策记录、一周后复盘与判断校准
- 精力趋势、会议节奏和经营洞察
- 个人经营章程、会议提醒与四角色 Agent 团队
- Cloudflare D1 云端持久化，按 ChatGPT 身份或设备隔离数据
- OpenAI Responses API 多 Agent 路由；未配置密钥时使用透明的结构化框架

## 技术栈

- Next.js 16 + React 19 + Vinext
- Cloudflare Workers + D1
- Drizzle ORM / Drizzle Kit
- OpenAI Responses API（默认模型 `gpt-5.6-terra`）
- OpenAI Sites 托管

## 本地开发

需要 Node.js `>=22.13.0`。

```bash
npm ci
npm run db:generate
npm run dev
```

常用检查：

```bash
npm run lint
npm run build
```

## 环境变量

- `OPENAI_API_KEY`：可选，配置后启用真实多 Agent 推理。应作为托管环境密钥保存，不要提交到仓库。
- `OPENAI_MODEL`：可选，默认 `gpt-5.6-terra`。

`.openai/hosting.json` 将 D1 绑定声明为 `DB`。数据库结构位于 `db/schema.ts`，迁移位于 `drizzle/`。

## 产品原则

1. 记录事实，不制造自我评判。
2. 每个周期只批准少量清晰承诺。
3. Agent 提供多视角，用户保留最终决定与否决权。
4. 决策必须记录当时的证据、权衡与不确定性，并在结果出现后复盘。
