import { openDatabase } from "../apps/server/src/domain";
import { buildApp } from "../apps/server/src/app";
import { resolve, join } from "node:path";
const app = await buildApp({
  db: openDatabase(join(process.env.TEST_DATA!, "db")),
  setupToken: "test-setup-token",
  webRoot: resolve("dist/web"),
});
await app.listen({ host: "127.0.0.1", port: 18443 });
