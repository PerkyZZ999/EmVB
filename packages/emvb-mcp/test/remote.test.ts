import { describe, expect, test } from "bun:test";
import { connectWithRetry } from "../src/remote.ts";

describe("bridge connect retry (W-894)", () => {
  const noSleep = (waits: number[]) => async (ms: number) => {
    waits.push(ms);
  };

  test("a network failure is retried with backoff, then succeeds", async () => {
    const waits: number[] = [];
    let tries = 0;
    const value = await connectWithRetry(async () => {
      tries++;
      if (tries < 3) throw new Error("fetch failed: ECONNREFUSED");
      return "ok";
    }, noSleep(waits));
    expect(value).toBe("ok");
    expect(tries).toBe(3);
    expect(waits).toEqual([250, 1000]);
  });

  test("gives up after three tries with the last error", async () => {
    let tries = 0;
    const run = connectWithRetry(async () => {
      tries++;
      throw new Error("fetch failed: ETIMEDOUT");
    }, noSleep([]));
    await expect(run).rejects.toThrow("ETIMEDOUT");
    expect(tries).toBe(3);
  });

  test("a refused token is not retried", async () => {
    let tries = 0;
    const run = connectWithRetry(async () => {
      tries++;
      throw new Error("Streamable HTTP error: 401 Unauthorized");
    }, noSleep([]));
    await expect(run).rejects.toThrow("401");
    expect(tries).toBe(1);
  });
});
