import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { decisions, goals, meetings, profiles, reminders } from "../../../db/schema";

export const dynamic = "force-dynamic";

type Payload = Record<string, unknown>;

function identity(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  const device = request.headers.get("x-lifeorg-user")?.trim();
  const safeDevice = device && /^[a-zA-Z0-9_-]{8,100}$/.test(device) ? device : "preview-user";
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  let displayName = "人生经营者";
  if (encodedName) {
    try { displayName = decodeURIComponent(encodedName); } catch { /* keep fallback */ }
  }
  return { userId: email ? `chatgpt:${email}` : `device:${safeDevice}`, displayName };
}

function asText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 3000) : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function seedUser(userId: string, displayName: string) {
  const db = getDb();
  await db.insert(profiles).values({ userId, displayName }).onConflictDoNothing();

  const [goal] = await db.select({ id: goals.id }).from(goals).where(eq(goals.userId, userId)).limit(1);
  if (!goal) {
    await db.insert(goals).values([
      { userId, title: "形成稳定且有辨识度的研究方向", domain: "科研", horizon: "年度", why: "为海外博士与高校科研目标建立长期积累", progress: 46 },
      { userId, title: "完成当前论文的创新性重构", domain: "科研", horizon: "季度", why: "把既有结果转化为更有解释力的研究贡献", progress: 62 },
      { userId, title: "保留摄影、运动和真正的休息", domain: "生活", horizon: "长期", why: "维持创造力与可持续的生活节奏", progress: 58 },
    ]);
  }

  const [decision] = await db.select({ id: decisions.id }).from(decisions).where(eq(decisions.userId, userId)).limit(1);
  if (!decision) {
    await db.insert(decisions).values([
      { userId, title: "论文下一轮重构方向", options: JSON.stringify(["联合轨迹与远期结局", "构造有文献依据的新指标", "维持现有结构继续投稿"]), choice: "先比较两条增量重构路径", reason: "尽量保留既有分析，同时提高创新性", status: "review", reviewAt: new Date(Date.now() + 7 * 86400000).toISOString() },
      { userId, title: "科研与休息的时间分配", options: JSON.stringify(["全部投入科研", "科研优先并保留固定休息"]), choice: "科研优先并保留固定休息", reason: "长期产出依赖可持续节奏", status: "decided" },
    ]);
  }

  const [reminder] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.userId, userId)).limit(1);
  if (!reminder) {
    await db.insert(reminders).values([
      { userId, kind: "daily", title: "每日站会", time: "09:00", enabled: true },
      { userId, kind: "weekly", title: "周经营会", time: "20:30", weekday: 0, enabled: true },
      { userId, kind: "decision", title: "决策复盘", time: "19:00", weekday: 5, enabled: true },
    ]);
  }
}

async function stateFor(userId: string) {
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const goalRows = await db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.updatedAt));
  const meetingRows = await db.select().from(meetings).where(eq(meetings.userId, userId)).orderBy(desc(meetings.createdAt)).limit(60);
  const decisionRows = await db.select().from(decisions).where(eq(decisions.userId, userId)).orderBy(desc(decisions.createdAt)).limit(60);
  const reminderRows = await db.select().from(reminders).where(eq(reminders.userId, userId)).orderBy(reminders.id);
  return {
    profile,
    goals: goalRows,
    meetings: meetingRows.map((row) => ({ ...row, inputs: parseJson(row.inputs, {}), agentOutput: parseJson(row.agentOutput, {}) })),
    decisions: decisionRows.map((row) => ({ ...row, options: parseJson<string[]>(row.options, []), agentOutput: parseJson(row.agentOutput, {}) })),
    reminders: reminderRows,
  };
}

export async function GET(request: Request) {
  try {
    const { userId, displayName } = identity(request);
    await seedUser(userId, displayName);
    return Response.json({ data: await stateFor(userId), identity: userId.startsWith("chatgpt:") ? "chatgpt" : "device" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "无法读取经营数据" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId, displayName } = identity(request);
    await seedUser(userId, displayName);
    const body = await request.json() as { action?: string; payload?: Payload };
    const action = body.action ?? "";
    const payload = body.payload ?? {};
    const db = getDb();

    if (action === "profile.update") {
      await db.update(profiles).set({
        displayName: asText(payload.displayName, displayName),
        vision: asText(payload.vision), values: asText(payload.values), constraints: asText(payload.constraints),
        updatedAt: new Date().toISOString(),
      }).where(eq(profiles.userId, userId));
    } else if (action === "goal.create") {
      const title = asText(payload.title);
      if (!title) return Response.json({ error: "目标名称不能为空" }, { status: 400 });
      await db.insert(goals).values({ userId, title, domain: asText(payload.domain, "成长"), horizon: asText(payload.horizon, "季度"), why: asText(payload.why), progress: Math.max(0, Math.min(100, asNumber(payload.progress))) });
    } else if (action === "goal.progress") {
      await db.update(goals).set({ progress: Math.max(0, Math.min(100, asNumber(payload.progress))), updatedAt: new Date().toISOString() }).where(and(eq(goals.id, asNumber(payload.id)), eq(goals.userId, userId)));
    } else if (action === "goal.delete") {
      await db.delete(goals).where(and(eq(goals.id, asNumber(payload.id)), eq(goals.userId, userId)));
    } else if (action === "meeting.create") {
      const type = asText(payload.type, "daily");
      const inputs = payload.inputs && typeof payload.inputs === "object" ? payload.inputs : {};
      const summary = asText(payload.summary) || asText((inputs as Payload).priority) || asText((inputs as Payload).nextOutcome) || "完成一次经营复盘";
      await db.insert(meetings).values({ userId, type, title: type === "daily" ? "每日站会" : type === "weekly" ? "周经营会" : "月度战略会", energy: asNumber(payload.energy, 0) || null, mood: asText(payload.mood) || null, inputs: asJson(inputs), summary, agentOutput: asJson(payload.agentOutput) });
    } else if (action === "decision.create") {
      const title = asText(payload.title); const choice = asText(payload.choice);
      if (!title || !choice) return Response.json({ error: "决策主题与最终选择不能为空" }, { status: 400 });
      await db.insert(decisions).values({ userId, title, options: asJson(payload.options), choice, reason: asText(payload.reason), status: "decided", agentOutput: asJson(payload.agentOutput), reviewAt: new Date(Date.now() + 7 * 86400000).toISOString() });
    } else if (action === "decision.review") {
      await db.update(decisions).set({ status: asText(payload.status, "reviewed"), updatedAt: new Date().toISOString() }).where(and(eq(decisions.id, asNumber(payload.id)), eq(decisions.userId, userId)));
    } else if (action === "reminder.update") {
      await db.update(reminders).set({ enabled: Boolean(payload.enabled), time: asText(payload.time, "09:00"), updatedAt: new Date().toISOString() }).where(and(eq(reminders.id, asNumber(payload.id)), eq(reminders.userId, userId)));
    } else {
      return Response.json({ error: "不支持的操作" }, { status: 400 });
    }

    return Response.json({ data: await stateFor(userId) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
  }
}
