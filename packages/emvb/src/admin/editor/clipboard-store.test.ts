import { afterEach, describe, expect, test } from "bun:test";
import { CLIPBOARD_KEY, readClipboardText, writeClipboardText } from "./clipboard-store.ts";

afterEach(() => localStorage.clear());

describe("clipboard storage (W-093)", () => {
  test("a copy is kept under the EmVB key and tells listeners in this tab", () => {
    let told = 0;
    const listener = () => told++;
    window.addEventListener("emvb-clipboard-change", listener);
    expect(writeClipboardText("clip")).toBe(true);
    window.removeEventListener("emvb-clipboard-change", listener);
    expect(localStorage.getItem(CLIPBOARD_KEY)).toBe("clip");
    expect(readClipboardText()).toBe("clip");
    expect(told).toBe(1);
  });

  test("blocked storage reads as empty and a copy reports that it failed", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    Object.defineProperty(globalThis, "localStorage", { value: blocked, configurable: true });
    try {
      expect(writeClipboardText("clip")).toBe(false);
      expect(readClipboardText()).toBeNull();
    } finally {
      if (real) Object.defineProperty(globalThis, "localStorage", real);
    }
    expect(writeClipboardText("clip")).toBe(true);
  });
});
