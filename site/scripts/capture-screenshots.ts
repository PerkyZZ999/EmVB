/**
 * Captures the project-site screenshots from the seeded Node demo (see seed-demo.ts):
 *
 *   bun site/scripts/capture-screenshots.ts [shot ...]
 *
 * Each shot is a 1440×900 viewport at deviceScaleFactor 2 (the phone shots use 390×844), saved as
 * PNG under site/scripts/.raw/ and then converted to WebP in site/public/screenshots/ with
 * ImageMagick (`magick`) at 1600 and 2400 px wide. The public-page shots use a signed-out browser.
 */
import {
  chromium,
  type Browser,
  type FrameLocator,
  type Locator,
  type Page,
} from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { api, BASE, STATE_FILE } from "./seed-demo.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const CHROMIUM = process.env["EMVB_CHROMIUM"] ?? "/usr/bin/chromium";
const RAW = join(HERE, ".raw");
const OUT = join(HERE, "..", "public", "screenshots");
const AUTH = join(HERE, ".demo-auth.json");
const EDITOR = "/_emdash/admin/plugins/emvb/editor";

type State = { home: string; formId: string; parts: Record<string, string> };
type LayoutNode = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  classes?: string[];
  children?: LayoutNode[];
};

const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;

const overlay = (page: Page): Locator => page.locator("[data-emvb-editor]");
const canvas = (page: Page): FrameLocator => page.frameLocator("iframe[data-emvb-canvas]");

async function storedLayout(page: Page, id: string, collection = "emvb_pages") {
  const data = await api(page.context().request, "GET", `/_emdash/api/content/${collection}/${id}`);
  const layout = data.item.data.layout;
  return (typeof layout === "string" ? JSON.parse(layout) : layout) as { root: LayoutNode };
}

function find(node: LayoutNode, test: (n: LayoutNode) => boolean): LayoutNode {
  const stack = [node];
  while (stack.length > 0) {
    const current = stack.shift() as LayoutNode;
    if (test(current)) return current;
    stack.push(...(current.children ?? []));
  }
  throw new Error("node not found");
}

async function openEditor(page: Page, entry: string, collection?: string) {
  await page.goto(`${EDITOR}?entry=${entry}${collection ? `&collection=${collection}` : ""}`);
  await overlay(page).locator(".emvb-topbar-title").waitFor({ timeout: 30_000 });
  await canvas(page).locator(".emvb-root").first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
}

async function select(page: Page, id: string) {
  const target = canvas(page).locator(`[data-emvb-id="${id}"]`).first();
  await target.scrollIntoViewIfNeeded();
  await target.click({ position: { x: 6, y: 6 }, force: true });
  await page.waitForTimeout(300);
}

async function selectLayer(page: Page, id: string) {
  await showLeft(page, "Layers");
  const row = overlay(page).locator(`[data-emvb-layer="${id}"]`).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForTimeout(300);
}

async function showLeft(page: Page, name: "Add" | "Layers") {
  const tab = overlay(page).getByRole("tab", { name, exact: true });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
}

async function showRight(page: Page, name: "Content" | "Style" | "Advanced") {
  const tab = overlay(page).getByRole("tab", { name, exact: true });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
}

async function openSection(page: Page, section: string, toTop = false) {
  const header = overlay(page).locator(`[data-emvb-section="${section}"]`);
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  if (toTop) await header.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
}

async function closeSection(page: Page, section: string) {
  const header = overlay(page).locator(`[data-emvb-section="${section}"]`);
  if ((await header.count()) > 0 && (await header.getAttribute("aria-expanded")) === "true")
    await header.click();
}

async function scrollCanvasTo(page: Page, id: string, offset = 80) {
  await canvas(page)
    .locator(`[data-emvb-id="${id}"]`)
    .first()
    .evaluate((el, off) => {
      const view = el.ownerDocument.defaultView;
      if (view) view.scrollTo(0, el.getBoundingClientRect().top + view.scrollY - off);
    }, offset);
  await page.waitForTimeout(400);
}

function convert(name: string, widths: number[]) {
  const source = join(RAW, `${name}.png`);
  for (const width of widths) {
    const result = spawnSync("magick", [
      source,
      "-resize",
      `${width}x>`,
      "-quality",
      "82",
      "-define",
      "webp:method=6",
      join(OUT, `${name}-${width}.webp`),
    ]);
    if (result.status !== 0) throw new Error(`magick failed for ${name}: ${result.stderr}`);
  }
}

async function shoot(page: Page, name: string) {
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  await page.mouse.move(0, viewport.height - 1);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(RAW, `${name}.png`) });
  convert(name, viewport.width < 600 ? [780, 1170] : [1600, 2400]);
  // oxlint-disable-next-line no-console -- progress for a CLI
  console.log(`shot ${name}`);
}

async function adminPage(browser: Browser, dark = false) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    storageState: AUTH,
    colorScheme: dark ? "dark" : "light",
    reducedMotion: "reduce",
  });
  return context.newPage();
}

async function publicPage(browser: Browser, phone = false) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: phone ? 3 : 2,
    isMobile: phone,
    hasTouch: phone,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/northfold", { waitUntil: "networkidle" });
  // The demo host's starter layout has no CSS reset; a real host theme would remove this margin.
  await page.addStyleTag({ content: "body{margin:0}" });
  for (let y = 0; y < 8000; y += 500) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  return page;
}

async function homeLayoutNodes(page: Page) {
  const layout = await storedLayout(page, state.home);
  return {
    layout,
    node: (test: (n: LayoutNode) => boolean) => find(layout.root, test),
    text: (value: string) => find(layout.root, (n) => n.props["text"] === value),
  };
}

const shots: Record<string, (browser: Browser) => Promise<void>> = {
  async editor(browser) {
    const page = await adminPage(browser);
    const { node, text } = await homeLayoutNodes(page);
    const card = node((n) => n.classes?.includes("card") ?? false);
    await openEditor(page, state.home);
    await scrollCanvasTo(page, text("Trips for every kind of walker").id, 40);
    await select(page, find(card, (n) => n.type === "heading").id);
    await selectLayer(page, card.id);
    await showRight(page, "Style");
    await closeSection(page, "layout");
    await shoot(page, "editor");
    await page.context().close();
  },

  async "editor-dark"(browser) {
    const page = await adminPage(browser, true);
    const { text } = await homeLayoutNodes(page);
    await openEditor(page, state.home);
    await select(page, text("Walk the wild edges of the North.").id);
    await showLeft(page, "Layers");
    await showRight(page, "Style");
    await closeSection(page, "layout");
    await openSection(page, "typography");
    await shoot(page, "editor-dark");
    await page.context().close();
  },

  async states(browser) {
    const page = await adminPage(browser);
    const { text } = await homeLayoutNodes(page);
    await openEditor(page, state.home);
    await select(page, text("Find your trip").id);
    await showRight(page, "Style");
    await overlay(page)
      .getByRole("tablist", { name: "Style state" })
      .getByRole("tab", { name: "Hover", exact: true })
      .click();
    await closeSection(page, "layout");
    await openSection(page, "background");
    await shoot(page, "states");
    await page.context().close();
  },

  async devices(browser) {
    const page = await adminPage(browser);
    const { text } = await homeLayoutNodes(page);
    await openEditor(page, state.home);
    await overlay(page).getByRole("tab", { name: "Mobile" }).click();
    await page.waitForTimeout(800);
    await select(page, text("Walk the wild edges of the North.").id);
    await showLeft(page, "Layers");
    await showRight(page, "Style");
    await closeSection(page, "layout");
    await openSection(page, "typography");
    await shoot(page, "devices");
    await page.context().close();
  },

  async backgrounds(browser) {
    const page = await adminPage(browser);
    const { node, text } = await homeLayoutNodes(page);
    const hero = node((n) => n.type === "container" && n.props["tag"] === "section");
    await openEditor(page, state.home);
    await select(page, text("Small-group hiking · since 2014").id);
    await selectLayer(page, hero.id);
    await showRight(page, "Style");
    await closeSection(page, "layout");
    await openSection(page, "background", true);
    await shoot(page, "backgrounds");
    await page.context().close();
  },

  async grid(browser) {
    const page = await adminPage(browser);
    const { node, text } = await homeLayoutNodes(page);
    const trips = node((n) => n.type === "grid" && n.props["columns"] === 3);
    await openEditor(page, state.home);
    await scrollCanvasTo(page, text("Trips for every kind of walker").id, 40);
    await select(page, text("Canyon Country").id);
    await selectLayer(page, trips.id);
    await showRight(page, "Content");
    await shoot(page, "grid");
    await page.context().close();
  },

  async forms(browser) {
    const page = await adminPage(browser);
    const { node, text } = await homeLayoutNodes(page);
    const form = node((n) => n.type === "form");
    await openEditor(page, state.home);
    await scrollCanvasTo(page, text("Tell us where you want to walk").id, 120);
    await select(page, find(form, (n) => n.type === "submit").id);
    await selectLayer(page, form.id);
    await showRight(page, "Content");
    await shoot(page, "forms");
    await page.context().close();
  },

  async "site-styles"(browser) {
    const page = await adminPage(browser);
    const { node } = await homeLayoutNodes(page);
    await openEditor(page, state.home);
    await select(page, node((n) => n.props["text"] === "Find your trip").id);
    await overlay(page).getByRole("button", { name: "Site styles" }).click();
    await overlay(page).locator("[data-emvb-site-styles]").waitFor();
    await page.waitForTimeout(600);
    await shoot(page, "site-styles");
    await overlay(page).getByRole("tab", { name: "Classes" }).click();
    await page.waitForTimeout(400);
    await overlay(page)
      .locator("[data-emvb-site-styles]")
      .getByText("Button", { exact: true })
      .first()
      .click();
    await page.waitForTimeout(600);
    await shoot(page, "classes");
    await page.context().close();
  },

  async "canvas-text"(browser) {
    const page = await adminPage(browser);
    const { text } = await homeLayoutNodes(page);
    await openEditor(page, state.home);
    await select(page, text("Walk the wild edges of the North.").id);
    await canvas(page)
      .locator(`[data-emvb-id="${text("Walk the wild edges of the North.").id}"]`)
      .dblclick();
    const field = overlay(page).getByRole("textbox", { name: "Edit text" });
    await field.waitFor();
    await field.press("End");
    await field.press("Backspace");
    await field.pressSequentially(", together", { delay: 40 });
    await shoot(page, "canvas-text");
    await field.press("Escape");
    await page.context().close();
  },

  async "pages-list"(browser) {
    const page = await adminPage(browser);
    await page.goto("/_emdash/admin/plugins/emvb/pages");
    await page.locator('[data-emvb-page="pages"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    await shoot(page, "pages-list");
    await page.context().close();
  },

  async "theme-builder"(browser) {
    const page = await adminPage(browser);
    await page.goto("/_emdash/admin/plugins/emvb/theme");
    await page.locator('[data-emvb-page="theme"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    await shoot(page, "theme-builder");
    await openEditor(page, state.parts["popup"] as string, "emvb_theme_parts");
    await shoot(page, "popup-editor");
    await page.context().close();
  },

  async public(browser) {
    const page = await publicPage(browser);
    await shoot(page, "public-desktop");
    await page.locator("#get-guide").click();
    await page.getByRole("dialog").first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await shoot(page, "popup");
    await page.context().close();
  },

  async "public-mobile"(browser) {
    const page = await publicPage(browser, true);
    await shoot(page, "public-mobile");
    await page.evaluate(() => document.getElementById("trips")?.scrollIntoView());
    await page.waitForTimeout(500);
    await shoot(page, "public-mobile-trips");
    await page.context().close();
  },
};

mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROMIUM });
try {
  for (const [name, run] of Object.entries(shots)) {
    if (wanted.length > 0 && !wanted.includes(name)) continue;
    await run(browser);
  }
} finally {
  await browser.close();
}
