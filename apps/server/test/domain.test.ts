import { afterEach, describe, expect, it } from "vitest";
import { createDomain, openDatabase } from "../src/domain";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function fixture(path = ":memory:") {
  let time = 1_700_000_000_000;
  const db = openDatabase(path);
  const d = createDomain(db, () => time);
  const seat = d.addSeat("01");
  const device = d.enroll(d.enrollment(seat.id).code);
  d.heartbeat(device.token);
  return {
    d,
    db,
    seat,
    device,
    advance: (ms: number) => {
      time += ms;
    },
    reserve: (key = "r") =>
      d.reserve({ seatId: seat.id, name: "학생", studentId: "10101" }, key),
  };
}
describe("festival accounting", () => {
  it("holds a seat once and retries reservation without double grants", () => {
    const f = fixture();
    const r = f.reserve();
    expect(f.reserve()).toEqual(r);
    expect(() => f.reserve("other")).toThrow();
    expect(r.money).toBe(3000);
    expect(r.endAt).toBeNull();
  });
  it("starts countdown only at activation and binds one-time code to device", () => {
    const f = fixture();
    const r = f.reserve();
    f.advance(60_000);
    const s = f.d.activate(f.device.token, r.code);
    expect(s.endAt).toBe(1_700_001_860_000);
    expect(() => f.d.activate(f.device.token, r.code)).toThrow();
  });
  it("expires abandoned reservation and offline seats cannot be reserved", () => {
    const f = fixture();
    f.reserve();
    f.advance(301_000);
    f.d.expire();
    expect(f.d.publicState().seats[0].session).toBeNull();
    expect(() => f.reserve("new")).toThrow();
    f.d.heartbeat(f.device.token);
    expect(f.reserve("new").money).toBe(3000);
  });
  it("charges and refunds once and rejects changed retry payloads", () => {
    const f = fixture();
    const r = f.reserve();
    f.d.activate(f.device.token, r.code);
    const p = f.d.saveProduct({ name: "과자", price: 1000, stock: 1 });
    const o = f.d.purchase(f.device.token, p.id, "buy");
    expect(f.d.purchase(f.device.token, p.id, "buy")).toEqual(o);
    expect(() => f.d.purchase(f.device.token, p.id, "other")).toThrow();
    expect(f.d.deviceState(f.device.token).session?.money).toBe(2000);
    f.d.cancelOrder(o.id, "refund");
    f.d.cancelOrder(o.id, "refund2");
    expect(f.d.deviceState(f.device.token).session?.money).toBe(3000);
    expect(f.d.publicState().products[0].stock).toBe(1);
    expect(() => f.d.purchase(f.device.token, "wrong", "buy")).toThrow();
  });
  it("atomically extends time and cannot overdraft or buy expired session", () => {
    const f = fixture();
    const r = f.reserve();
    f.d.activate(f.device.token, r.code);
    const e = f.d.saveExtension({ name: "10분", seconds: 600, price: 1000 });
    f.d.extend(f.device.token, e.id, "extend");
    f.d.extend(f.device.token, e.id, "extend");
    expect(f.d.deviceState(f.device.token).session?.endAt).toBe(
      1_700_002_400_000,
    );
    expect(f.d.deviceState(f.device.token).session?.money).toBe(2000);
    expect(() => f.d.adjust(r.id, 0, -3000, "a")).toThrow();
    f.advance(2_400_001);
    expect(() => f.d.extend(f.device.token, e.id, "later")).toThrow();
  });
  it("persists sessions and orders across reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "cafe-"));
    dirs.push(dir);
    const path = join(dir, "db");
    const f = fixture(path);
    const r = f.reserve();
    f.d.activate(f.device.token, r.code);
    const p = f.d.saveProduct({ name: "물", price: 500, stock: 5 });
    f.d.purchase(f.device.token, p.id, "b");
    f.db.close();
    const db = openDatabase(path);
    const d = createDomain(db, () => 1_700_000_100_000);
    expect(d.deviceState(f.device.token).session?.money).toBe(2500);
    expect(d.adminState().orders).toHaveLength(1);
    db.close();
  });
  it("does not leak visitor information publicly and purges names without losing ledger", () => {
    const f = fixture();
    const r = f.reserve();
    f.d.activate(f.device.token, r.code);
    expect(JSON.stringify(f.d.publicState())).not.toContain("10101");
    f.d.endSession(r.id);
    f.d.purgePersonalData();
    expect(JSON.stringify(f.d.adminState().sessions)).not.toContain("10101");
    expect(f.d.adminState().audit.length).toBeGreaterThan(0);
  });
});
