type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};
/** Retains uncertain mutations, including across a renderer reload. Payloads are never stored. */
export class PendingOperations {
  private keys = new Map<string, string>();
  private inflight = new Map<string, Promise<unknown>>();
  constructor(private storage?: StorageLike) {
    try {
      this.keys = new Map(
        JSON.parse(storage?.getItem("pcclub.pending.v1") || "[]"),
      );
    } catch {}
  }
  private persist() {
    try {
      this.storage?.setItem(
        "pcclub.pending.v1",
        JSON.stringify([...this.keys]),
      );
    } catch {}
  }
  async run<T>(
    scope: string,
    payload: unknown,
    execute: (key: string) => Promise<T>,
  ): Promise<T> {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(scope + ":" + JSON.stringify(payload)),
    );
    const id = Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const existing = this.inflight.get(id);
    if (existing) return existing as Promise<T>;
    let key = this.keys.get(id);
    if (!key) {
      key = crypto.randomUUID();
      this.keys.set(id, key);
      this.persist();
    }
    const result = execute(key)
      .then((value) => {
        this.keys.delete(id);
        this.persist();
        return value;
      })
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, result);
    return result;
  }
}
