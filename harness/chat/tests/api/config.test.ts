import { beforeEach, describe, expect, it } from "vitest";
import { GET as config } from "@/app/api/config/route";
import { freshStubEnv } from "@/tests/helpers";

// The config exposure the replay banner renders from (stage-4b): the UI asks
// the server which world it is in; the server reads the one switch. Banner
// appearance itself is stagecraft, certified by the dress rehearsal.

beforeEach(async () => {
  await freshStubEnv();
});

describe("GET /api/config", () => {
  it("reports replay off by default — a normal cycle never shows the banner", async () => {
    const res = await config();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ replay: false });
  });

  it("reports replay on when the switch is set", async () => {
    process.env.DEMO_REPLAY = "1";
    expect(await (await config()).json()).toEqual({ replay: true });
  });

  it("treats 0 and false as off", async () => {
    for (const value of ["0", "false"]) {
      process.env.DEMO_REPLAY = value;
      expect(await (await config()).json()).toEqual({ replay: false });
    }
  });
});
