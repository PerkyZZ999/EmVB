import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { emptyDesign } from "../schema/design.ts";
import type { Layout } from "../schema/layout.ts";
import { renderPage } from "./index.ts";
import { THEME_BOOT_SCRIPT } from "./theme-boot.ts";

const layout = {
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children: [] },
} as unknown as Layout;
const design = (dark?: string) => {
  const d = emptyDesign();
  d.variables.colors = [
    { id: "bg", name: "Background", value: "#ffffff", ...(dark ? { dark } : {}) },
  ];
  return d;
};
/** Runs the script's body as the browser would. */
const run = () => new Function(THEME_BOOT_SCRIPT.replace(/^<script>|<\/script>$/g, ""))();

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-emvb-theme");
});

describe("a saved light or dark choice before the page is drawn (W-1067)", () => {
  test("a public page of a site with dark colours starts with the inline script, toggle or not", () => {
    const html = renderPage(layout, design("#0b1220"), { scope: "p" }).html;
    expect(html.startsWith(THEME_BOOT_SCRIPT)).toBe(true);
    expect(html.split("<script").length - 1).toBe(1);
  });

  test("no script for a site without dark colours, nor in the editor", () => {
    expect(renderPage(layout, design()).html.includes("<script")).toBe(false);
    expect(renderPage(layout, design("#000000"), { mode: "editor" }).html.includes("<script")).toBe(
      false,
    );
  });

  test("it puts back a saved choice, ignores anything else, and survives blocked storage", () => {
    localStorage.setItem("emvb-theme", "light");
    run();
    expect(document.documentElement.getAttribute("data-emvb-theme")).toBe("light");
    document.documentElement.removeAttribute("data-emvb-theme");
    localStorage.setItem("emvb-theme", "purple");
    run();
    expect(document.documentElement.hasAttribute("data-emvb-theme")).toBe(false);
    const blocked = spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(run).not.toThrow();
    blocked.mockRestore();
  });
});

test("the CSP hash in the widgets guide is this script's (W-1067)", async () => {
  const body = THEME_BOOT_SCRIPT.replace(/^<script>|<\/script>$/g, "");
  const hash = new Bun.CryptoHasher("sha256").update(body).digest("base64");
  const guide = await Bun.file(
    new URL("../../../../../docs/guides/widgets.md", import.meta.url),
  ).text();
  expect(guide).toContain(`'sha256-${hash}'`);
});
