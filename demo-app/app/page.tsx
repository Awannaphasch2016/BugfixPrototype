"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/tasks";

function DueBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return null;
  const overdue = dueDate < new Date().toISOString().slice(0, 10);
  return (
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
        overdue ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-600"
      }`}
    >
      due {dueDate}
    </span>
  );
}

function TaskRow({
  task,
  onToggle,
  onRename,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onRename: (task: Task, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  function commit() {
    setEditing(false);
    const title = draft.trim();
    if (title && title !== task.title) onRename(task, title);
    else setDraft(task.title);
  }

  return (
    <li className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task)}
        className="h-4 w-4 accent-zinc-800"
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className={`flex-1 cursor-text text-sm ${
            task.completed ? "text-zinc-400 line-through" : "text-zinc-800"
          }`}
          title="Click to rename"
        >
          {task.title}
          <DueBadge dueDate={task.dueDate} />
        </span>
      )}
    </li>
  );
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function refresh() {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueDate: dueDate || undefined }),
    });
    setTitle("");
    setDueDate("");
    refresh();
  }

  async function patchTask(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-900">Tasks</h1>

      <form onSubmit={addTask} className="mb-6 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-2 text-sm text-zinc-600"
        />
        <button
          type="submit"
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
        >
          Add
        </button>
      </form>

      <ul className="rounded-lg border border-zinc-200 bg-white">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={(t) => patchTask(t.id, { completed: !t.completed })}
            onRename={(t, newTitle) => patchTask(t.id, { title: newTitle })}
          />
        ))}
        {tasks.length === 0 && (
          <li className="px-4 py-6 text-sm text-zinc-400">No tasks yet.</li>
        )}
      </ul>
    </div>
  );
}
