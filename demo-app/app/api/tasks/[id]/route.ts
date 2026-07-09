import { readTasks, writeTasks } from "@/lib/store";
import type { Task } from "@/lib/tasks";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const tasks = await readTasks();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return Response.json({ error: "task not found" }, { status: 404 });
  }

  const [existing] = tasks.splice(index, 1);
  const updated: Task = {
    ...existing,
    title: typeof body.title === "string" ? body.title.trim() : existing.title,
    completed: typeof body.completed === "boolean" ? body.completed : existing.completed,
    dueDate: body.dueDate,
  };
  tasks.push(updated);
  await writeTasks(tasks);
  return Response.json({ task: updated });
}
