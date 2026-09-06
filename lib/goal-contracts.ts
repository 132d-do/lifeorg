import { z } from "zod";

export const GoalEditSchema = z.object({
  id: z.number().int().positive(), title: z.string().trim().min(1).max(300),
  domain: z.string().trim().min(1).max(100), horizon: z.string().trim().min(1).max(100),
  why: z.string().trim().max(3000), status: z.enum(["active", "paused", "completed"]),
  progress: z.number().int().min(0).max(100),
}).strict();
