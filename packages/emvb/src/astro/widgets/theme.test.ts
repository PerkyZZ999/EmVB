import { afterEach, describe, expect, test } from "bun:test";
import { initTheme } from "./theme.ts";

const realMatch = globalThis.matchMedia;
const system = (dark: boolean) => {
  globalThis.matchMedia = ((query: string) => ({
    matches: dark && query.includes("dark"),
    addEventListener: () => undefined,
  })) as never;
};
afterEach(() => {
  globalThis.matchMedia = realMatch;
  localStorage.clear();
  delete document.documentElement.dataset["emvbTheme"];
  document.body.innerHTML = "";
});
const page = () => {
  document.body.innerHTML = `<button data-emvb-theme-toggle aria-pressed="false">Dark mode</button>`;
  initTheme(document);
  return document.querySelector<HTMLButtonElement>("button") as HTMLButtonElement;
};

describe("theme runtime (W-1067)", () => {
  test("shows the toggle; it follows the system until the visitor chooses, and remembers", () => {
    system(true);
    const toggle = page();
    expect(toggle.dataset["emvbReady"]).toBe("");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    toggle.click();
    expect(document.documentElement.dataset["emvbTheme"]).toBe("light");
    expect(localStorage.getItem("emvb-theme")).toBe("light");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    toggle.click();
    expect(document.documentElement.dataset["emvbTheme"]).toBe("dark");
  });

  test("a stored choice applies on the next page, over the system setting", () => {
    system(false);
    localStorage.setItem("emvb-theme", "dark");
    const toggle = page();
    expect(document.documentElement.dataset["emvbTheme"]).toBe("dark");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });
});
