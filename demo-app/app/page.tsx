"use client";

import { useEffect, useState } from "react";
import type { Task, TaskPatch } from "@/lib/tasks";

function DueBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return null;
  const overdue = dueDate < new Date().toISOString().slice(0, 10);
  return (
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
        overdue ? "bg-red-950 text-red-300" : "bg-zinc-800 text-zinc-300"
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
    <li className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task)}
        className="h-4 w-4 accent-zinc-300"
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100"
        />
      ) : (
        <span
          onClick={() => setEditing(true)}
          className={`flex-1 cursor-text text-sm ${
            task.completed ? "text-green-600 line-through" : "text-green-300"
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

const FILTERS = ["all", "active", "done"] as const;
type Filter = (typeof FILTERS)[number];

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  async function refresh() {
    const query = filter === "all" ? "" : `?status=${filter}`;
    const res = await fetch(`/api/tasks${query}`);
    const data = await res.json();
    setTasks(data.tasks);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

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

  async function patchTask(id: string, patch: TaskPatch) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Tasks</h1>

      <form onSubmit={addTask} className="mb-6 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-400"
        />
        <button
          type="submit"
          className="rounded bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          Add
        </button>
      </form>

      <div className="mb-3 flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm capitalize ${
              filter === f
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <ul className="rounded-lg border border-zinc-800 bg-zinc-950">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onToggle={(t) => patchTask(t.id, { completed: !t.completed })}
            onRename={(t, newTitle) => patchTask(t.id, { title: newTitle })}
          />
        ))}
        {tasks.length === 0 && (
          <li className="px-4 py-6 text-sm text-zinc-500">No tasks yet.</li>
        )}
      </ul>
    </div>
  );
}
