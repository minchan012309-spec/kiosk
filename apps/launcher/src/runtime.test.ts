import { expect, it } from "vitest";
import { SessionClock, ExitGate, GameController } from "./runtime";
it("uses monotonic elapsed time across offline wall-clock changes", () => {
  let mono = 100;
  const c = new SessionClock(() => mono);
  c.sync(1_000_000, 1_060_000);
  mono += 30_000;
  expect(c.remaining()).toBe(30_000);
  mono += 31_000;
  expect(c.remaining()).toBe(0);
});
it("requires fresh device-bound approval and consumes it once", () => {
  let now = 1000;
  const g = new ExitGate("device1", () => now);
  expect(g.consume({ id: "a", deviceId: "other", expiresAt: 2000 })).toBe(
    false,
  );
  expect(g.consume({ id: "a", deviceId: "device1", expiresAt: 999 })).toBe(
    false,
  );
  expect(g.consume({ id: "a", deviceId: "device1", expiresAt: 2000 })).toBe(
    true,
  );
  expect(g.consume({ id: "a", deviceId: "device1", expiresAt: 2000 })).toBe(
    false,
  );
});
it("switches only after owned process stopped and propagates termination failure", async () => {
  const calls: string[] = [];
  let fail = false;
  const c = new GameController(
    async (path, args) => {
      calls.push("start:" + path + ":" + args.join(","));
      return 123;
    },
    async (pid) => {
      calls.push("stop:" + pid);
      if (fail) throw Error("denied");
    },
  );
  await c.start({ executable: "A.exe", args: [] });
  await c.start({ executable: "B.exe", args: ["x"] });
  expect(calls).toEqual(["start:A.exe:", "stop:123", "start:B.exe:x"]);
  fail = true;
  await expect(c.start({ executable: "C.exe", args: [] })).rejects.toThrow(
    "denied",
  );
  expect(calls).not.toContain("start:C.exe:");
});
