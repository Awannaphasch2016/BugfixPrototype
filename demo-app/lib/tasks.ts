export type Task = {
  id: string;
  title: string;
  completed: boolean;
  dueDate: string | null;
  createdAt: string;
};

export type TaskPatch = {
  title?: string;
  completed?: boolean;
  dueDate?: string | null;
};

export function newTaskId(): string {
  return Math.random().toString(36).slice(2, 10);
}
