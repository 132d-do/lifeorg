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
  sequence: integer("sequence").notNull().default(0),
  turnNumber: integer("turn_number").notNull(),
  role: text("role").notNull(),
  clientTurnId: text("client_turn_id"),
  structuredContent: text("structured_content").notNull().default("{}"),
  modelMetadata: text("model_metadata").notNull().default("{}"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("meeting_messages_meeting_turn_role_unique").on(table.meetingId, table.turnNumber, table.role),
]);

export const meetingApprovals = sqliteTable("meeting_approvals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  meetingId: integer("meeting_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  mutationHash: text("mutation_hash").notNull(),
  sessionId: text("session_id").notNull().default("legacy:unknown"),
  approvedMutations: text("approved_mutations").notNull().default("[]"),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("meeting_approvals_user_meeting_key_unique").on(table.userId, table.meetingId, table.idempotencyKey),
  uniqueIndex("meeting_approvals_user_meeting_unique").on(table.userId, table.meetingId),
]);

export const meetingTurnClaims = sqliteTable("meeting_turn_claims", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  meetingId: integer("meeting_id").notNull(),
  clientTurnId: text("client_turn_id").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  status: text("status").notNull().default("pending"),
  response: text("response").notNull().default("{}"),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("meeting_turn_claims_user_meeting_client_turn_unique").on(table.userId, table.meetingId, table.clientTurnId),
]);

export const meetingTurnLeases = sqliteTable("meeting_turn_leases", {
  meetingId: integer("meeting_id").primaryKey(),
  userId: text("user_id").notNull(),
  clientTurnId: text("client_turn_id").notNull(),
  leaseToken: text("lease_token").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const meetingDecisionLeases = sqliteTable("meeting_decision_leases", {
  meetingId: integer("meeting_id").primaryKey(),
  userId: text("user_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  leaseToken: text("lease_token").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const meetingDecisionEvents = sqliteTable("meeting_decision_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  meetingId: integer("meeting_id").notNull(),
  action: text("action").notNull(),
  sessionId: text("session_id").notNull(),
  recommendationSnapshot: text("recommendation_snapshot").notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("meeting_decision_events_user_meeting_id_unique").on(table.userId, table.meetingId, table.id),
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

export const decisionReviews = sqliteTable("decision_reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  decisionId: integer("decision_id").notNull(),
  meetingId: integer("meeting_id").notNull(),
  outcome: text("outcome").notNull(),
  observedAt: text("observed_at").notNull(),
  decisionSnapshot: text("decision_snapshot").notNull(),
  recommendationSnapshot: text("recommendation_snapshot").notNull(),
  mutationHash: text("mutation_hash").notNull(),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("decision_reviews_user_meeting_decision_unique").on(table.userId, table.meetingId, table.decisionId),
]);

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
