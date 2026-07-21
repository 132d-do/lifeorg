import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull().default("人生经营者"),
  vision: text("vision").notNull().default("做有长期价值、也能保留生活质感的事情"),
  values: text("values").notNull().default("成长,自主,健康,真诚"),
  constraints: text("constraints").notNull().default("时间与精力有限，不以持续透支换取短期成果"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  domain: text("domain").notNull().default("成长"),
  horizon: text("horizon").notNull().default("季度"),
  why: text("why").notNull().default(""),
  status: text("status").notNull().default("active"),
  progress: integer("progress").notNull().default(0),
  targetDate: text("target_date"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const meetings = sqliteTable("meetings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  energy: integer("energy"),
  mood: text("mood"),
  inputs: text("inputs").notNull().default("{}"),
  summary: text("summary").notNull().default(""),
  agentOutput: text("agent_output").notNull().default("{}"),
  clientRequestId: text("client_request_id"),
  lifecycleStatus: text("lifecycle_status").notNull().default("draft"),
  topic: text("topic").notNull().default(""),
  phase: text("phase").notNull().default("intake"),
  finalRecommendation: text("final_recommendation").notNull().default("{}"),
  approvalStatus: text("approval_status").notNull().default("pending"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(""),
}, (table) => [
  uniqueIndex("meetings_user_client_request_unique").on(table.userId, table.clientRequestId),
]);

export const meetingMessages = sqliteTable("meeting_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  meetingId: integer("meeting_id").notNull(),
  turnNumber: integer("turn_number").notNull(),
  role: text("role").notNull(),
  structuredContent: text("structured_content").notNull().default("{}"),
  modelMetadata: text("model_metadata").notNull().default("{}"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("meeting_messages_meeting_turn_role_unique").on(table.meetingId, table.turnNumber, table.role),
]);

export const decisions = sqliteTable("decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  options: text("options").notNull().default("[]"),
  choice: text("choice").notNull(),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("decided"),
  agentOutput: text("agent_output").notNull().default("{}"),
  reviewAt: text("review_at"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const reminders = sqliteTable("reminders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  time: text("time").notNull().default("09:00"),
  weekday: integer("weekday"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
