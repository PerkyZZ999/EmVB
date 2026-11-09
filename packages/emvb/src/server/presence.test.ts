import { describe, expect, test } from "bun:test";
import { isOpenInEditor, PRESENCE_LEASE_MS, setPresence } from "./presence.ts";

function kv() {
  const rows = new Map<string, unknown>();
  return {
    rows,
    get: async <T>(key: string) => (rows.get(key) as T | undefined) ?? null,
    set: async (key: string, value: unknown) => void rows.set(key, structuredClone(value)),
    delete: async (key: string) => rows.delete(key),
  };
}
const page = { collection: "emvb_pages", id: "p1" };

describe("editor presence lease (W-929)", () => {
  test("open until closed, per user; the last close removes the key", async () => {
    const store = kv();
    expect(await isOpenInEditor(store, page, 0)).toBe(false);
    await setPresence(store, page, "a", true, 0);
    await setPresence(store, page, "b", true, 0);
    expect(await isOpenInEditor(store, page, 1)).toBe(true);
    await setPresence(store, page, "a", false, 1);
    expect(await isOpenInEditor(store, page, 2)).toBe(true);
    await setPresence(store, page, "b", false, 2);
    expect(await isOpenInEditor(store, page, 3)).toBe(false);
    expect(store.rows.size).toBe(0);
  });

  test("a lease nobody renews runs out, and other pages are unaffected", async () => {
    const store = kv();
    await setPresence(store, page, "a", true, 0);
    expect(await isOpenInEditor(store, { ...page, id: "p2" }, 1)).toBe(false);
    expect(await isOpenInEditor(store, page, PRESENCE_LEASE_MS - 1)).toBe(true);
    expect(await isOpenInEditor(store, page, PRESENCE_LEASE_MS)).toBe(false);
  });

  test("a stored lease far in the future or of the wrong shape counts as closed", async () => {
    const store = kv();
    store.rows.set("presence:emvb_pages:p1", { a: Number.MAX_SAFE_INTEGER, b: "soon" });
    expect(await isOpenInEditor(store, page, 0)).toBe(false);
    store.rows.set("presence:emvb_pages:p1", ["a"]);
    expect(await isOpenInEditor(store, page, 0)).toBe(false);
  });
});
