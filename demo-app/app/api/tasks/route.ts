import { requestLogger } from "@/lib/logger";
import { readTasks, writeTasks } from "@/lib/store";
import { newTaskId, type Task } from "@/lib/tasks";
import { taskSchema } from "@/lib/validation";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  const log = requestLogger("GET", "/api/tasks");
  let tasks = await readTasks();
  if (status === "active") {
    tasks = tasks.filter((t) => !t.completed);
  } else if (status === "done") {
    tasks = tasks.filter((t) => t.completed);
  }
  tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  log.info({ status: status ?? "all", count: tasks.length }, "listed tasks");
  return Response.json({ tasks });
}

export async function POST(req: Request) {
  const log = requestLogger("POST", "/api/tasks");
  const body = await req.json();
  log.info({ payload: body }, "creating task");
  if (!body.title || typeof body.title !== "string") {
    log.warn("create rejected: missing title");
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const task: Task = {
    id: newTaskId(),
    title: body.title.trim(),
    completed: false,
    dueDate: body.dueDate ?? null,
    createdAt: new Date().toISOString(),
  };
  if (!taskSchema.safeParse(task).success) {
    log.warn({ payload: body }, "create rejected: invalid title");
    return Response.json(
      { error: "validation failed: title must be 1-100 characters" },
      { status: 400 }
    );
  }
  const tasks = await readTasks();
  tasks.push(task);
  await writeTasks(tasks);
  log.info({ taskId: task.id }, "task created");
  return Response.json({ task }, { status: 201 });
}
