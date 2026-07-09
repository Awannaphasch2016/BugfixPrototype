import { z } from "zod";

export const taskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
  completed: z.boolean(),
  dueDate: z.string().nullable().optional(),
  createdAt: z.string(),
});
