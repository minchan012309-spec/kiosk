import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareServer } from "../../server/src/startup";
import { parseConnection, requestApi } from "./connection";
import { buildApp } from "../../server/src/app";
import { openDatabase } from "../../server/src/domain";
it("validates imported certificate and makes TLS requests without bypassing trust", async () => {
  const dir = mkdtempSync(join(tmpdir(), "cafe-tls-"));
  const info = await prepareServer(dir);
  const a = await buildApp({
    db: openDatabase(":memory:"),
    setupToken: "token",
    tls: info.tls,
  });
  await a.listen({ host: "127.0.0.1", port: 0 });
  try {
    const port = (a.server.address() as any).port;
    const c = parseConnection({
      version: 1,
      url: `https://127.0.0.1:${port}`,
      cert: info.tls.cert,
    });
    expect((await requestApi(c, "/health")).ok).toBe(true);
    expect(() => parseConnection({ ...c, url: "http://127.0.0.1" })).toThrow();
    expect(() => parseConnection({ ...c, cert: "garbage" })).toThrow();
    const other = mkdtempSync(join(tmpdir(), "cafe-tls-other-"));
    try {
      const wrong = await prepareServer(other);
      await expect(
        requestApi({ ...c, cert: wrong.tls.cert }, "/health"),
      ).rejects.toThrow();
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  } finally {
    await a.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
