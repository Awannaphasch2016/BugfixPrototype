import { requestLogger } from "@/lib/logger";
import { readTasks, writeTasks } from "@/lib/store";
import { taskSchema } from "@/lib/validation";
import type { Task } from "@/lib/tasks";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const log = requestLogger("PATCH", "/api/tasks/:id");
  const body = await req.json();
  log.info({ taskId: id, payload: body }, "updating task");

  const tasks = await readTasks();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    log.warn({ taskId: id }, "task not found");
    return Response.json({ error: "task not found" }, { status: 404 });
  }

  const [existing] = tasks.splice(index, 1);
  const updated: Task = {
    ...existing,
    title: typeof body.title === "string" ? body.title.trim() : existing.title,
    completed: typeof body.completed === "boolean" ? body.completed : existing.completed,
    dueDate: body.dueDate !== undefined ? body.dueDate : existing.dueDate,
  };
  try {
    taskSchema.parse(updated);
    tasks.push(updated);
  } catch (err) {
    log.error({ err, taskId: id }, "task update failed validation");
  }
  await writeTasks(tasks);
  log.info({ taskId: id }, "task updated");
  return Response.json({ task: updated });
}
