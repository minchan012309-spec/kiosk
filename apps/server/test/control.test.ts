import { expect, it } from "vitest";
import { createDomain, openDatabase, verifyPassword } from "../src/domain";
import { validateBinding } from "../src/startup";
it("expires approval, binds commands to the device and rejects replay", () => {
  let now = 1700000000000;
  const d = createDomain(openDatabase(":memory:"), () => now);
  d.bootstrap("strong-password");
  const a = d.addSeat("A"),
    b = d.addSeat("B");
  const da = d.enroll(d.enrollment(a.id).code),
    db = d.enroll(d.enrollment(b.id).code);
  d.heartbeat(da.token);
  d.heartbeat(db.token);
  const request = d.requestExit(da.token);
  now += 121000;
  expect(() => d.decideExit(request.id, true)).toThrow();
  d.heartbeat(da.token);
  const r = d.requestExit(da.token);
  d.decideExit(r.id, true);
  const command = d.deviceState(da.token).commands[0];
  expect(() => d.ack(db.token, command.id, "accepted")).toThrow();
  d.ack(da.token, command.id, "accepted");
  expect(() => d.ack(da.token, command.id, "accepted")).toThrow();
  expect(d.deviceState(da.token).commands).toHaveLength(0);
  expect(verifyPassword(da.recoveryCode, da.recoveryHash)).toBe(true);
  expect(verifyPassword("wrong", da.recoveryHash)).toBe(false);
});
it("requires TLS when binding to LAN", () => {
  expect(() => validateBinding("0.0.0.0")).toThrow();
  expect(() => validateBinding("127.0.0.1")).not.toThrow();
  expect(() =>
    validateBinding("0.0.0.0", { cert: "cert", key: "key" }),
  ).not.toThrow();
});
it("ends a session atomically when an exit command is accepted and records shutdown failures", () => {
  const d = createDomain(openDatabase(":memory:"));
  d.bootstrap("strong-password");
  const seat = d.addSeat("A");
  const dev = d.enroll(d.enrollment(seat.id).code);
  d.heartbeat(dev.token);
  const r = d.reserve(
    { seatId: seat.id, name: "학생", studentId: "10101" },
    "r",
  );
  d.activate(dev.token, r.code);
  const c = d.exitPassword(dev.token, "strong-password");
  d.ack(dev.token, c.id, "accepted");
  expect(d.deviceState(dev.token).session).toBeNull();
  d.heartbeat(dev.token);
  const shut = d.shutdown(dev.deviceId);
  d.ack(dev.token, shut.id, "accepted");
  d.ack(dev.token, shut.id, "failed", "권한 없음");
  expect(d.adminState().commands.find((x) => x.id === shut.id)?.status).toBe(
    "failed",
  );
});
it("local administrator recovery clears login sessions and preserves accounting", () => {
  const d = createDomain(openDatabase(":memory:"));
  d.bootstrap("strong-password");
  const token = d.login("strong-password");
  d.addSeat("A");
  d.resetAdmin();
  expect(d.isSetup()).toBe(false);
  expect(() => d.admin(token)).toThrow();
  d.bootstrap("replacement-password");
  expect(d.adminState().seats).toHaveLength(1);
});
