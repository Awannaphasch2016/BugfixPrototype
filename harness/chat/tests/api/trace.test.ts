import { beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { freshStubEnv, stubDir } from "../helpers";
import { GET } from "@/app/api/trace/[issue]/route";

function getTrace(issue: string, stage?: string) {
  const url = `http://chat.test/api/trace/${issue}${stage ? `?stage=${stage}` : ""}`;
  return GET(new Request(url), { params: Promise.resolve({ issue }) });
}

describe("GET /api/trace/[issue]", () => {
  beforeEach(async () => {
    await freshStubEnv();
    await mkdir(path.join(stubDir(), "harness", "private"), { recursive: true });
  });

  it("serves the rendered fixer trace as HTML", async () => {
    await writeFile(
      path.join(stubDir(), "harness", "private", "trace-issue-7.html"),
      "<html><body>fixer trace</body></html>",
    );
    const res = await getTrace("7");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain("fixer trace");
  });

  it("selects a stage transcript via ?stage=", async () => {
    await writeFile(
      path.join(stubDir(), "harness", "private", "trace-issue-7-planner.html"),
      "<html><body>planner trace</body></html>",
    );
    const res = await getTrace("7", "planner");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("planner trace");
  });

  it("404s when the runner has rendered no trace", async () => {
    const res = await getTrace("7");
    expect(res.status).toBe(404);
  });

  it("rejects a non-numeric issue segment without touching the filesystem", async () => {
    const res = await getTrace("..%2Fsecrets");
    expect(res.status).toBe(400);
  });

  it("ignores an unknown stage rather than reading an arbitrary suffix", async () => {
    await writeFile(
      path.join(stubDir(), "harness", "private", "trace-issue-7.html"),
      "<html><body>fixer trace</body></html>",
    );
    const res = await getTrace("7", "..%2F..%2Fetc");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("fixer trace");
  });
});
