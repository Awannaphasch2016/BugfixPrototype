// Seed realistic demo data through the API so a fresh checkout has content.
// Run the dev server first, then: node scripts/seed.mjs

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && res.status !== 400) {
    console.error(`${method} ${path} -> ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

const days = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const seedTasks = [
  { title: "Book flights for the offsite", dueDate: days(12) },
  { title: "Update the on-call rota" },
  { title: "Send April usage report to finance", dueDate: days(-6) },
  { title: "Fix flaky deploy notification" },
  { title: "Draft blog post on the new importer", dueDate: days(9) },
  { title: "Renew staging TLS cert", dueDate: days(3) },
  { title: "Review Priya's schema migration PR" },
  { title: "Order more standing desks" },
  { title: "Prep quarterly security questionnaire", dueDate: days(15) },
  { title: "Follow up with the vendor about the Q3 invoice discrepancy they emailed about last week — finance needs an answer before the board meeting" },
  { title: "Clean up unused feature flags" },
  { title: "Schedule dentist (again)", dueDate: days(-2) },
  { title: "Reply to Dana re: onboarding docs — she asked whether new starters need VPN access before their laptops arrive or if IT sorts it" },
  { title: "Rotate the shared demo account password", dueDate: days(5) },
  { title: "Write runbook for the nightly export job" },
  { title: "Chase legal for redlines on the MSA renewal (they said end of week, it is now the week after and sales is getting antsy about the close date)" },
  { title: "Triage inbox zero attempt #47" },
  { title: "Upgrade CI runners to node 24", dueDate: days(20) },
  { title: "Collect talk proposals for the eng all-hands" },
  { title: "Swap the office router", dueDate: days(1) },
];

async function main() {
  const created = [];
  for (const t of seedTasks) {
    const { task } = await api("POST", "/api/tasks", t);
    if (task) created.push(task);
    await sleep(150 + Math.random() * 500);
    if (Math.random() < 0.3) {
      await api("GET", "/api/tasks");
      await sleep(100 + Math.random() * 300);
    }
  }

  // a couple of renames, the way people fix typos or add context
  await api("PATCH", `/api/tasks/${created[3].id}`, {
    title: "Fix flaky deploy notification (Slack webhook times out)",
  });
  await sleep(400);
  await api("PATCH", `/api/tasks/${created[5].id}`, {
    title: "Renew staging TLS cert before Friday",
  });
  await sleep(400);
  await api("PATCH", `/api/tasks/${created[16].id}`, {
    title: "Triage support inbox",
  });
  await sleep(400);

  // mark a bunch of things done, sprinkled with list reads
  const doneIdx = [1, 2, 4, 6, 9, 11, 12, 14, 17];
  for (const i of doneIdx) {
    await api("PATCH", `/api/tasks/${created[i].id}`, { completed: true });
    await sleep(200 + Math.random() * 600);
    if (Math.random() < 0.5) {
      const status = Math.random() < 0.5 ? "active" : "done";
      await api("GET", `/api/tasks?status=${status}`);
      await sleep(100 + Math.random() * 300);
    }
  }

  // someone un-did one
  await api("PATCH", `/api/tasks/${created[6].id}`, { completed: false });
  await sleep(300);

  await api("GET", "/api/tasks");
  console.log(`seeded ${created.length} tasks`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
