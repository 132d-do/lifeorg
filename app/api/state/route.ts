import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { decisions, goals, meetings, profiles, reminders } from "../../../db/schema";
import { IdentityError, identityRuntime, resolveIdentity } from "../../../lib/server/identity";

export const dynamic = "force-dynamic";
type Payload = Record<string, unknown>;

const asText = (value: unknown, fallback = "") => typeof value === "string" ? value.trim().slice(0, 3000) : fallback;
const asNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asJson = (value: unknown) => JSON.stringify(value ?? {});
function parseJson<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }

async function seedUser(userId: string, displayName: string) {
  const db = getDb();
  await db.insert(profiles).values({ userId, displayName }).onConflictDoNothing();
  const [goal] = await db.select({ id: goals.id }).from(goals).where(eq(goals.userId, userId)).limit(1);
  if (!goal) await db.insert(goals).values([
    { userId, title: "形成稳定且有辨识度的研究方向", domain: "科研", horizon: "年度", why: "为长期研究发展建立积累", progress: 46 },
    { userId, title: "完成当前论文的创新性重构", domain: "科研", horizon: "季度", why: "把已有结果转化为更有解释力的贡献", progress: 62 },
    { userId, title: "保留运动和真正的休息", domain: "生活", horizon: "长期", why: "维持创造力与可持续节奏", progress: 58 },
  ]);
  const [decision] = await db.select({ id: decisions.id }).from(decisions).where(eq(decisions.userId, userId)).limit(1);
  if (!decision) await db.insert(decisions).values({ userId, title: "科研与休息的时间分配", options: asJson(["全部投入科研", "科研优先并保留固定休息"]), choice: "科研优先并保留固定休息", reason: "长期产出依赖可持续节奏", status: "review", reviewAt: new Date(Date.now() + 7 * 86400000).toISOString() });
  const [reminder] = await db.select({ id: reminders.id }).from(reminders).where(eq(reminders.userId, userId)).limit(1);
  if (!reminder) await db.insert(reminders).values([
    { userId, kind: "daily", title: "每日站会", time: "09:00", enabled: true },
    { userId, kind: "weekly", title: "周经营会", time: "20:30", weekday: 0, enabled: true },
    { userId, kind: "decision", title: "决策复盘", time: "19:00", weekday: 5, enabled: true },
  ]);
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

async function trustedIdentity(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  return resolveIdentity(request, identityRuntime(runtime));
}

export async function GET(request: Request) {
  try {
    const identity = await trustedIdentity(request);
    await seedUser(identity.userId, identity.displayName);
    return Response.json({ data: await stateFor(identity.userId), identity: identity.source });
  } catch (error) {
    if (error instanceof IdentityError) return Response.json({ error: error.message }, { status: 401 });
    return Response.json({ error: "无法读取经营数据" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await trustedIdentity(request);
    await seedUser(identity.userId, identity.displayName);
    const body = await request.json() as { action?: string; payload?: Payload };
    const action = body.action ?? "";
    const payload = body.payload ?? {};
    const db = getDb();
    const userId = identity.userId;
    if (action === "profile.update") {
      await db.update(profiles).set({ displayName: asText(payload.displayName, identity.displayName), vision: asText(payload.vision), values: asText(payload.values), constraints: asText(payload.constraints), updatedAt: new Date().toISOString() }).where(eq(profiles.userId, userId));
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
      const summary = asText(payload.summary) || asText((inputs as Payload).priority) || "完成一次经营复盘";
      await db.insert(meetings).values({ userId, type, title: type === "daily" ? "每日站会" : type === "weekly" ? "周经营会" : "月度战略会", energy: asNumber(payload.energy) || null, mood: asText(payload.mood) || null, inputs: asJson(inputs), summary, agentOutput: asJson(payload.agentOutput) });
    } else if (action === "decision.create") {
      const title = asText(payload.title); const choice = asText(payload.choice);
      if (!title || !choice) return Response.json({ error: "决策主题与最终选择不能为空" }, { status: 400 });
      await db.insert(decisions).values({ userId, title, options: asJson(payload.options), choice, reason: asText(payload.reason), status: "decided", agentOutput: asJson(payload.agentOutput), reviewAt: new Date(Date.now() + 7 * 86400000).toISOString() });
    } else if (action === "decision.review") {
      await db.update(decisions).set({ status: asText(payload.status, "reviewed"), updatedAt: new Date().toISOString() }).where(and(eq(decisions.id, asNumber(payload.id)), eq(decisions.userId, userId)));
    } else if (action === "reminder.update") {
      await db.update(reminders).set({ enabled: Boolean(payload.enabled), time: asText(payload.time, "09:00"), updatedAt: new Date().toISOString() }).where(and(eq(reminders.id, asNumber(payload.id)), eq(reminders.userId, userId)));
    } else return Response.json({ error: "不支持的操作" }, { status: 400 });
    return Response.json({ data: await stateFor(userId) });
  } catch (error) {
    if (error instanceof IdentityError) return Response.json({ error: error.message }, { status: 401 });
    return Response.json({ error: "保存失败" }, { status: 500 });
  }
}
