import { promises as fs } from "fs";
import path from "path";
import type { Task } from "./tasks";

function tasksFile(): string {
  return process.env.TASKS_FILE ?? path.join(process.cwd(), "data", "tasks.json");
}

export async function readTasks(): Promise<Task[]> {
  try {
    const raw = await fs.readFile(tasksFile(), "utf8");
    return JSON.parse(raw) as Task[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function writeTasks(tasks: Task[]): Promise<void> {
  const file = tasksFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(tasks, null, 2) + "\n", "utf8");
}
