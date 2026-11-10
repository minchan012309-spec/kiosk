import { expect, it } from "vitest";
import { PendingOperations } from "../../../packages/shared/src/operations";
it("reuses a committed operation key after response loss and across UI reload", async () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  let balance = 3000;
  const responses = new Map<string, number>();
  let drop = true;
  const server = async (key: string) => {
    if (!responses.has(key)) {
      balance -= 500;
      responses.set(key, balance);
    }
    if (drop) {
      drop = false;
      throw Error("response lost");
    }
    return responses.get(key)!;
  };
  const pending = new PendingOperations(storage);
  await expect(
    pending.run("purchase:session1", { productId: "water" }, server),
  ).rejects.toThrow();
  const reloaded = new PendingOperations(storage);
  expect(
    await reloaded.run("purchase:session1", { productId: "water" }, server),
  ).toBe(2500);
  expect(balance).toBe(2500);
  await reloaded.run("purchase:session1", { productId: "water" }, server);
  expect(balance).toBe(2000);
});
