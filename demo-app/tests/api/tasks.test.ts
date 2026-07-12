import { beforeEach, describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { GET, POST } from "@/app/api/tasks/route";
import { PATCH } from "@/app/api/tasks/[id]/route";

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function createTask(body: Record<string, unknown>) {
  return POST(jsonRequest("http://localhost/api/tasks", "POST", body));
}

function listTasks(query = "") {
  return GET(jsonRequest(`http://localhost/api/tasks${query}`, "GET"));
}

function patchTask(id: string, body: Record<string, unknown>) {
  return PATCH(jsonRequest(`http://localhost/api/tasks/${id}`, "PATCH", body), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tasks-test-"));
  process.env.TASKS_FILE = path.join(dir, "tasks.json");
});

describe("POST /api/tasks", () => {
  it("creates a task and returns it", async () => {
    const res = await createTask({ title: "Write launch notes" });
    expect(res.status).toBe(201);
    const { task } = await res.json();
    expect(task.title).toBe("Write launch notes");
    expect(task.completed).toBe(false);

    const list = await (await listTasks()).json();
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0].id).toBe(task.id);
  });

  it("rejects a task without a title", async () => {
    const res = await createTask({ dueDate: "2026-08-01" });
    expect(res.status).toBe(400);
  });

  it("stores the due date when one is given", async () => {
    await createTask({ title: "Renew SSL cert", dueDate: "2026-08-01" });
    const list = await (await listTasks()).json();
    expect(list.tasks[0].dueDate).toBe("2026-08-01");
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("renames a task", async () => {
    const { task } = await (await createTask({ title: "Draft agenda" })).json();
    const res = await patchTask(task.id, { title: "Draft standup agenda" });
    expect(res.status).toBe(200);

    const list = await (await listTasks()).json();
    expect(list.tasks[0].title).toBe("Draft standup agenda");
  });

  it("marks a task completed and back", async () => {
    const { task } = await (await createTask({ title: "Pay invoice" })).json();
    await patchTask(task.id, { completed: true });
    let list = await (await listTasks()).json();
    expect(list.tasks[0].completed).toBe(true);

    await patchTask(task.id, { completed: false });
    list = await (await listTasks()).json();
    expect(list.tasks[0].completed).toBe(false);
  });

  it("404s for an unknown task id", async () => {
    const res = await patchTask("does-not-exist", { completed: true });
    expect(res.status).toBe(404);
  });

  // Regression test for issue #13: a task whose title exceeds the schema's
  // 100-char max (POST does not enforce it) was silently dropped from the
  // store when a PATCH re-validated the merged task after splicing it out.
  it("does not lose a task when marking it done fails validation", async () => {
    const longTitle = "x".repeat(138);
    const { task } = await (await createTask({ title: longTitle })).json();

    const res = await patchTask(task.id, { completed: true });

    const list = await (await listTasks()).json();
    expect(list.tasks.map((t: { id: string }) => t.id)).toContain(task.id);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/tasks", () => {
  it("lists only active tasks with ?status=active", async () => {
    const { task: done } = await (await createTask({ title: "Ship v1" })).json();
    await (await createTask({ title: "Ship v2" })).json();
    await patchTask(done.id, { completed: true });

    const list = await (await listTasks("?status=active")).json();
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0].title).toBe("Ship v2");
  });

  // Regression test for issue #13: ?status=done filtered on !t.completed,
  // so tasks marked done never showed up in the Done tab.
  it("lists only done tasks with ?status=done", async () => {
    const { task: done } = await (await createTask({ title: "Ship v1" })).json();
    await (await createTask({ title: "Ship v2" })).json();
    await patchTask(done.id, { completed: true });

    const list = await (await listTasks("?status=done")).json();
    expect(list.tasks).toHaveLength(1);
    expect(list.tasks[0].title).toBe("Ship v1");
  });
});
