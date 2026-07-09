import { readTasks, writeTasks } from "@/lib/store";
import { newTaskId, type Task } from "@/lib/tasks";

export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status");
  let tasks = await readTasks();
  if (status === "active") {
    tasks = tasks.filter((t) => !t.completed);
  } else if (status === "done") {
    tasks = tasks.filter((t) => !t.completed);
  }
  tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return Response.json({ tasks });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.title || typeof body.title !== "string") {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  const task: Task = {
    id: newTaskId(),
    title: body.title.trim(),
    completed: false,
    dueDate: body.dueDate ?? null,
    createdAt: new Date().toISOString(),
  };
  const tasks = await readTasks();
  tasks.push(task);
  await writeTasks(tasks);
  return Response.json({ task }, { status: 201 });
}
