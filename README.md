# LifeOrg｜个人经营系统

LifeOrg 是一个把系统分析、组织管理和 AI Agent 思维应用到个人生活管理中的实验性产品。用户作为“人生经营者”保留最终决策权，多个 Agent 分别提供战略、运营和审计视角。

## MVP 功能

- 每日站会：记录精力、情绪、昨日进展、今日核心结果与阻塞
- 周经营会：回顾成果、未完成事项、风险及下周核心结果
- 决策日志：保留方案、最终选择、理由和后续复盘状态
- 幕僚长简报：集中展示阻塞、机会与建议行动
- 专注计时：提供 25 分钟专注周期
- 本地持久化：当前版本将记录保存在浏览器 `localStorage`
- 响应式界面：支持桌面与移动端

## 技术栈

- Next.js 16 + React 19 + TypeScript
- Vinext + Vite
- Tailwind CSS 4
- Cloudflare Worker 兼容运行时
- Drizzle ORM / D1 预留结构

## 本地运行

需要 Node.js `>=22.13.0`。Windows 用户建议在 VS Code 的 WSL 环境中运行。

```bash
git clone https://github.com/132d-do/lifeorg.git
cd lifeorg
npm ci
npm run dev
```

运行测试：

```bash
npm test
```

## 当前数据边界

MVP 使用浏览器本地存储，不会自动跨设备同步。后续版本可以接入身份认证、云端数据库和真正的大模型 Agent 服务。

## 在线版本

[打开 LifeOrg](https://lifeorg.dovis3970.chatgpt.site)

## 下一阶段

- 云端账户与跨设备数据同步
- 可配置 Agent 组织架构
- 长期规划会与目标分解
- 基于真实历史记录的 AI 建议
- 决策复盘提醒与趋势分析
