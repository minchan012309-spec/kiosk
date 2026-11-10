import { _electron as electron, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const data = mkdtempSync(join(tmpdir(), "pc-club-desktop-"));
let desktop;
try {
  desktop = await electron.launch({
    args: ["--no-sandbox", resolve("dist/desktop/server.cjs")],
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ":99",
      CAFE_DESKTOP_DATA: data,
      CAFE_DESKTOP_PORT: "19443",
    },
    timeout: 20000,
  });
  console.log("electron launched");
  desktop.process().stderr.on("data", (d) => console.error(String(d)));
  const page = await desktop.firstWindow();
  console.log("window:", page.url());
  page.on("pageerror", (e) => console.error("renderer:", e.message));
  console.log("loaded", await page.title());
  await expect(
    page.getByRole("heading", { name: "우리 축제 PC방 만들기" }),
  ).toBeVisible();
  await expect(page.getByLabel("초기 설정 코드")).not.toHaveValue("");
  await page
    .getByLabel("관리자 비밀번호", { exact: true })
    .fill("desktop-test-password");
  await page.getByRole("button", { name: "관리자 설정 완료" }).click();
  await expect(page.getByRole("heading", { name: "운영 현황" })).toBeVisible();
  await page.getByRole("button", { name: "좌석 / PC" }).click();
  await page.getByLabel("새 좌석 이름").fill("01");
  await page.getByRole("button", { name: "좌석 추가", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PC 01" })).toBeVisible();
  const windowPromise = desktop.waitForEvent("window");
  await page.getByRole("link", { name: "키오스크 화면 열기 ↗" }).click();
  const kiosk = await windowPromise;
  await expect(
    kiosk.getByRole("heading", { name: /오늘의 플레이/ }),
  ).toBeVisible();
  expect(await kiosk.evaluate(() => window.cafe)).toBeUndefined();
  await page.screenshot({
    path: "release/admin-screenshot.png",
    fullPage: true,
  });
  await kiosk.screenshot({
    path: "release/kiosk-screenshot.png",
    fullPage: true,
  });
  console.log(
    "PASS desktop: TLS server, bundled SQLite, preload bridge, admin setup, seat creation, isolated kiosk window",
  );
} catch (e) {
  console.error(e);
  throw e;
} finally {
  if (desktop) {
    await desktop.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await desktop.close().catch(() => {});
  }
  rmSync(data, { recursive: true, force: true });
}
