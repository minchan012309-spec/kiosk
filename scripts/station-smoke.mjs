import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { request } from "node:https";
const dir = mkdtempSync(join(tmpdir(), "pc-club-station-"));
const sd = join(dir, "server"),
  cd = join(dir, "station");
let server, station;
const launch = (role, data) =>
  electron.launch({
    args: [
      "--no-sandbox",
      "--password-store=gnome-libsecret",
      resolve("scripts/electron-test-entry.cjs"),
    ],
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":99",
      XDG_CACHE_HOME: "/tmp/kiosk-cache",
      CAFE_DESKTOP_DATA: data,
      CAFE_TEST_ENTRY: resolve("dist/desktop/" + role + ".cjs"),
      CAFE_DESKTOP_PORT: "21443",
    },
    timeout: 20000,
  });
const forceClose = async (a) => {
  if (!a) return;
  await a.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await a.close().catch(() => {});
};
try {
  server = await launch("server", sd);
  const admin = await server.firstWindow();
  await admin
    .getByLabel("관리자 비밀번호", { exact: true })
    .fill("station-smoke-password");
  await admin.getByRole("button", { name: "관리자 설정 완료" }).click();
  await expect(admin.getByRole("heading", { name: "운영 현황" })).toBeVisible();
  const data = await admin.evaluate(async () => {
    const post = async (p, b) => {
      const r = await fetch("/api" + p, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(b),
      });
      if (!r.ok) throw Error(await r.text());
      return r.json();
    };
    const seat = await post("/admin/seats", { name: "01" });
    const en = await post("/admin/devices/enrollment", { seatId: seat.id });
    const product = await post("/admin/products", {
      name: "생수",
      price: 500,
      stock: 10,
    });
    await post("/admin/extensions", {
      name: "10분 더",
      seconds: 600,
      price: 1000,
    });
    return { seat, en, product };
  });
  station = await launch("station", cd);
  let page = await station.firstWindow();
  await expect(
    page.getByRole("heading", { name: "PC 런처 연결" }),
  ).toBeVisible();
  await expect(
    page.evaluate(() => window.cafe.invoke("not-allowed")),
  ).rejects.toThrow();
  const cert = readFileSync(join(sd, "server/server.crt"), "utf8");
  const connection = { version: 1, url: "https://localhost:21443", cert };
  const connectionFile = join(dir, "connection.pcclub");
  writeFileSync(connectionFile, JSON.stringify(connection));
  await station.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, connectionFile);
  await page.getByRole("button", { name: "연결 파일 선택" }).click();
  await expect(page.getByText("✓ https://localhost:21443")).toBeVisible();
  await page.getByLabel("PC 등록 코드", { exact: true }).fill(data.en.code);
  await page.getByRole("button", { name: "이 PC 등록", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "비상 종료 코드 보관" }),
  ).toBeVisible();
  const recoveryCode = await page.locator(".recovery-code").innerText();
  await page
    .getByRole("button", { name: "운영자가 안전하게 보관했습니다" })
    .click();
  await forceClose(station);
  station = undefined;
  station = await launch("station", cd);
  page = await station.firstWindow();
  await expect(
    page.getByRole("heading", { name: "플레이할 준비됐나요?" }),
  ).toBeVisible();
  const reservation = await admin.evaluate(async (seatId) => {
    const r = await fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ seatId, name: "테스트 학생", studentId: "10101" }),
    });
    return r.json();
  }, data.seat.id);
  await page.getByLabel("로그인 번호", { exact: true }).fill(reservation.code);
  await page.getByRole("button", { name: "입장하기 ↗" }).click();
  await expect(
    page.getByRole("heading", { name: "오늘은 어떤 게임?" }),
  ).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "간식 주문", exact: true }).click();
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  await expect(
    page.getByText("주문이 접수됐어요. 운영자가 자리로 가져다 드립니다."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "시간 연장", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "시간 연장", exact: true })
    .last()
    .click();
  await expect(
    page.getByText("시간이 연장됐어요. 즐겁게 플레이하세요!"),
  ).toBeVisible();
  await page.screenshot({ path: "release/launcher-screenshot.png" });
  await page.getByRole("button", { name: "종료 승인", exact: true }).click();
  await page.getByRole("button", { name: "원격 종료 승인 요청" }).click();
  await expect(
    page.getByText("관리자에게 종료 승인 요청을 보냈습니다."),
  ).toBeVisible();
  await admin.evaluate(async () => {
    const st = await (await fetch("/api/admin/state")).json();
    const r = st.exitRequests.find((x) => x.status === "pending");
    const res = await fetch("/api/admin/exit-requests/" + r.id, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve: true }),
    });
    if (!res.ok) throw Error(await res.text());
  });
  await new Promise((yes, no) => {
    const t = setTimeout(
      () => no(Error("remote exit did not close station")),
      12000,
    );
    station.process().once("exit", () => {
      clearTimeout(t);
      yes();
    });
  });
  station = undefined;
  await forceClose(server);
  server = undefined;
  station = await launch("station", cd);
  page = await station.firstWindow();
  await expect(
    page.getByText("서버 연결을 기다리고 있어요. 지금은 로그인할 수 없습니다."),
  ).toBeVisible({ timeout: 15000 });
  await page.getByText("관리자 · 프로그램 종료", { exact: true }).click();
  await page.getByText("연결 장애 시 비상 종료", { exact: true }).click();
  await page
    .getByLabel("운영자 비상 종료 코드", { exact: true })
    .fill(recoveryCode);
  const closed = new Promise((yes, no) => {
    const t = setTimeout(
      () => no(Error("emergency exit did not close station")),
      8000,
    );
    station.process().once("exit", () => {
      clearTimeout(t);
      yes();
    });
  });
  await page.getByRole("button", { name: "비상 종료", exact: true }).click();
  await closed;
  station = undefined;
  console.log(
    "PASS station: connection import, TLS, stored credentials, login, snack purchase, extension, remote approval, offline recovery exit. Linux libsecret integration does not validate Windows DPAPI or game execution.",
  );
} catch (e) {
  console.error(e);
  throw e;
} finally {
  await forceClose(station);
  await forceClose(server);
  rmSync(dir, { recursive: true, force: true });
}
