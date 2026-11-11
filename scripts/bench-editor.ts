// W-979: the editor on a large page in a real browser, against a running Node demo
// (`bun run demo:node`, then `bun scripts/bench-editor.ts [sections…]`; for the production build,
// also `bun run demo:node:build && bun run demo:node:prod` and EMVB_DEMO=http://127.0.0.1:4421). Prints load, duplicate,
// undo and device-switch times; docs/system/performance.md holds the numbers.
import { chromium } from "@playwright/test";
import { countNodes, largeLayout } from "./bench-large.ts";

const BASE = process.env["EMVB_DEMO"] ?? "http://127.0.0.1:4411";
/** A production build has no dev sign-in: sign in on the dev server that shares its database. */
const LOGIN = process.env["EMVB_LOGIN"] ?? BASE;
const sizes = process.argv.slice(2).map(Number).filter(Boolean);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${LOGIN}/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`);
await page.waitForURL("**/_emdash/admin**");
const rows = [
  "| Elements | open (canvas ready) | duplicate | undo | to Mobile | back to Desktop |",
  "| --- | --- | --- | --- | --- | --- |",
];
const canvas = page.frameLocator("iframe[data-emvb-canvas]");
const ms = (start: number) => `${Math.round(performance.now() - start)} ms`;
for (const sections of sizes.length > 0 ? sizes : [7, 33, 66]) {
  const layout = largeLayout(sections);
  const created = await page.request.post(`${BASE}/_emdash/api/content/emvb_pages`, {
    headers: { "X-EmDash-Request": "1", "content-type": "application/json" },
    data: JSON.stringify({
      data: { title: `Perf ${sections}`, layout },
      slug: `perf-${sections}-${Date.now()}`,
    }),
  });
  const id = ((await created.json()) as { data: { item: { id: string } } }).data.item.id;
  const last = `Section ${sections}`;
  let start = performance.now();
  await page.goto(`${BASE}/_emdash/admin/plugins/emvb/editor?entry=${id}`);
  await canvas.getByRole("heading", { name: last, exact: true }).waitFor({ timeout: 120_000 });
  const open = ms(start);
  await canvas.getByRole("heading", { name: "Section 1", exact: true }).click();
  await page.waitForTimeout(500);
  const sections1 = canvas.getByRole("heading", { name: "Section 1", exact: true });
  start = performance.now();
  await page.keyboard.press("Control+d");
  await sections1.nth(1).waitFor();
  const duplicate = ms(start);
  await page.waitForTimeout(300);
  start = performance.now();
  await page.keyboard.press("Control+z");
  await page.waitForFunction(
    () => {
      const doc = document.querySelector<HTMLIFrameElement>(
        "iframe[data-emvb-canvas]",
      )?.contentDocument;
      return (
        [...(doc?.querySelectorAll("h2") ?? [])].filter((h) => h.textContent === "Section 1")
          .length === 1
      );
    },
    undefined,
    { polling: "raf" },
  );
  const undo = ms(start);
  start = performance.now();
  await page.getByRole("tab", { name: "Mobile" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-emvb-device]")?.getAttribute("data-emvb-device") === "mobile",
    undefined,
    { polling: "raf" },
  );
  await canvas.getByRole("heading", { name: last, exact: true }).waitFor();
  const mobile = ms(start);
  start = performance.now();
  await page.getByRole("tab", { name: "Desktop" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("[data-emvb-device]")?.getAttribute("data-emvb-device") === "desktop",
    undefined,
    { polling: "raf" },
  );
  await canvas.getByRole("heading", { name: last, exact: true }).waitFor();
  const desktop = ms(start);
  rows.push(
    `| ${countNodes(layout)} | ${open} | ${duplicate} | ${undo} | ${mobile} | ${desktop} |`,
  );
  await page.request.delete(`${BASE}/_emdash/api/content/emvb_pages/${id}`, {
    headers: { "X-EmDash-Request": "1" },
  });
}
await browser.close();
process.stdout.write(`${rows.join("\n")}\n`);
