import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const data = mkdtempSync(join(tmpdir(), "pc-cafe-e2e-"));
const child = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/test-server.ts"],
  { stdio: "inherit", env: { ...process.env, TEST_DATA: data } },
);
process.on("SIGTERM", () => child.kill());
process.on("SIGINT", () => child.kill());
child.on("exit", (code) => process.exit(code || 0));
