import { readFileSync } from "node:fs";
import path from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  request as requestFactory,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createPage, ensureEmvbSetup, getPage, publishPage, storedLayout } from "./support/api.ts";
import { EDITOR, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";
import { stripJpegGps } from "../packages/emvb/src/admin/image-editor/exif.ts";

// W-482: the image editor under the production CSP (EmDash sends it only in production builds).
const PHOTO = path.join(process.cwd(), "e2e/fixtures/photo-gps.jpg");
const SHOTS = process.env["EMVB_IMAGE_EDITOR_SHOTS"];

let author: APIRequestContext;
let media: { id: string; url: string };

test.describe.configure({ mode: "serial" });
// The editor needs a signed-in admin; the production build shares the dev server's sign-in.
test.use({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads fixture names from the pattern.
  storageState: async ({}, use, info) => use((info.project.metadata as { auth: string }).auth),
  viewport: { width: 1440, height: 900 },
});

test.beforeAll(async ({ browser }) => {
  const { dev, auth } = test.info().project.metadata as { dev: string; auth: string };
  const context = await browser.newContext({ baseURL: dev, storageState: auth });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
  author = await requestFactory.newContext({ baseURL: dev, storageState: auth });
  const upload = await author.post("/_emdash/api/media", {
    headers: { "X-EmDash-Request": "1" },
    multipart: {
      file: { name: "garden.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO) },
      width: "640",
      height: "480",
    },
  });
  expect(upload.status()).toBeLessThan(300);
  const item = ((await upload.json()) as { data: { item: { id: string; url: string } } }).data.item;
  media = { id: item.id, url: item.url };
});

test.afterAll(async () => {
  await author.dispose();
});

const imagePage = (props: Record<string, unknown>) => ({
  schemaVersion: 17,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [{ id: "img00001", type: "image", props: { alt: "A garden in autumn", ...props } }],
  },
});

/** Collects CSP violations and the scripts the page loads. */
function watch(page: Page) {
  const csp: string[] = [];
  const scripts: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) csp.push(m.text());
  });
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  return { csp, scripts };
}

async function openImageEditor(page: Page, id: string) {
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 30_000 });
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await overlay(page).locator("[data-emvb-image-edit]").click();
}

const editor = (page: Page) => page.locator("[data-emvb-image-editor]");

const file = (page: Page) => page.locator("[data-emvb-image-editor-file]");
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
};
const libraryPage = (extra: Record<string, unknown> = {}) =>
  imagePage({ src: media.url, mediaId: media.id, width: 640, height: 480, ...extra });

/**
 * The page editor needs 1024 px (its small-screen notice would unmount the dialog), but the image
 * editor picks its layout from its own width. Keep the page editor mounted and narrow the window,
 * as W-486's media-library entry point will be.
 */
async function keepPageEditorMounted(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      /min-width:\s*1024px/.test(query)
        ? ({
            matches: true,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => true,
          } as MediaQueryList)
        : original(query);
  });
}

/** Serious or critical axe findings inside the image editor. */
async function axeProblems(page: Page) {
  const result = await new AxeBuilder({ page }).include("[data-emvb-image-editor]").analyze();
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

// W-861: the Zoom controls sit over the canvas; the comparison is about the picture, so they are
// masked (their own anti-aliasing can differ by a pixel after a colour-scheme switch).
const canvasShot = (page: Page) =>
  page
    .locator("[data-emvb-image-canvas]")
    .screenshot({ mask: [page.locator("[data-emvb-image-zoom]")] });
/** Reset all, so each tool's screenshot shows only its own edit. */
const resetAll = async (page: Page) => {
  const reset = page.locator("[data-emvb-image-reset]");
  if (await reset.isEnabled()) await reset.click();
  await expect(reset).toBeDisabled();
};

test("a library picture opens in the worker under the admin CSP, with nothing loaded before the click", async ({
  page,
}) => {
  const seen = watch(page);
  const id = await createPage(author, "Image editor", libraryPage(), `ie-${unique()}`);
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 30_000 });
  const before = seen.scripts.length;
  // The editor chunk is in neither the editor's first load nor anything before "Edit image".
  expect(seen.scripts.some((u) => /ImageEditorDialog|editor\.worker/.test(u))).toBe(false);
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await overlay(page).locator("[data-emvb-image-edit]").click();
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  expect(seen.scripts.length).toBeGreaterThan(before);
  await expect(editor(page)).toHaveAttribute("data-emvb-render-mode", "worker");
  await expect(editor(page)).toHaveAttribute("data-layout", "desktop");
  // photocn's arrangement: Adjust first, the tool switcher and histogram on top of the sidebar.
  await expect(editor(page)).toHaveAttribute("data-emvb-image-tool-active", "adjust");
  await expect(page.locator('[data-emvb-image-tool="adjust"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("[data-slot=image-editor-histogram]")).toBeVisible();
  await expect(file(page)).toContainText("640 × 480 px");
  await expect(page.locator("[data-emvb-image-save]")).toBeEnabled();
  const box = await page.locator("[data-emvb-image-canvas]").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(400);
  await page.waitForTimeout(500);
  await shot(page, "adjust");
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await expect(page.locator('[data-emvb-image-panel="filters"]')).toBeVisible();
  await shot(page, "filters");
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edit]")).toBeFocused();
  expect(seen.csp).toEqual([]);
});

test("crop and rotate (W-483): turns, square, the element's own ratio, straighten, undo and Done", async ({
  page,
}) => {
  const seen = watch(page);
  const id = await createPage(
    author,
    "Image editor crop",
    libraryPage({ width: 300, height: 100 }),
    `ie-c-${unique()}`,
  );
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.locator('[data-emvb-image-tool="compose"]').click();
  await expect(page.locator("[data-emvb-image-view]")).toHaveAttribute(
    "data-emvb-image-view",
    "crop",
  );
  await expect(page.locator("[data-emvb-image-crop-frame]")).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "crop");

  await page.locator('[data-emvb-image-rotate="right"]').click();
  await expect(file(page)).toContainText("480 × 640 px");
  await page.locator("[data-emvb-image-undo]").click();
  await expect(file(page)).toContainText("640 × 480 px");

  await page.getByRole("combobox", { name: "Aspect ratio" }).click();
  await page.getByRole("option", { name: "Square" }).click();
  await expect(file(page)).toContainText("480 × 480 px");

  await page.getByRole("combobox", { name: "Aspect ratio" }).click();
  await page.getByRole("option", { name: "Fit this element (300 × 100)" }).click();
  await expect(file(page)).toContainText(/640 × 21[34] px/);

  // The keyboard straightens; the frame stays put and the crop shrinks to stay inside.
  const straighten = page.locator('[data-emvb-image-slider="straighten"]');
  await straighten.focus();
  for (let i = 0; i < 20; i++) await straighten.press("ArrowRight");
  await expect(page.getByRole("button", { name: "+2.0°" })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "crop-edited");

  // Adjust corners: Esc leaves the corners first, and doesn't close the editor.
  await page.locator("[data-emvb-image-corners]").click();
  await expect(page.locator("[data-slot=image-editor-corner-overlay]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-slot=image-editor-corner-overlay]")).toHaveCount(0);
  await expect(editor(page)).toHaveCount(1);

  await page.locator("[data-emvb-image-crop-done]").click();
  await expect(page.locator("[data-emvb-image-view]")).toHaveAttribute(
    "data-emvb-image-view",
    "result",
  );
  await expect(editor(page)).toHaveAttribute("data-emvb-image-tool-active", "adjust");
  await page.locator("[data-emvb-image-reset]").click();
  await expect(file(page)).toContainText("640 × 480 px");
  expect(seen.csp).toEqual([]);
});

test("the active tool stays readable after the admin switches from dark to light", async ({
  page,
}) => {
  const id = await createPage(author, "Image editor theme", libraryPage(), `ie-t-${unique()}`);
  const activeColors = async () =>
    page
      .locator('[data-emvb-image-tool][aria-pressed="true"]')
      .first()
      .evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  const light = await activeColors();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "dark-adjust");
  await page.locator('[data-emvb-image-tool="compose"]').click();
  await page.waitForTimeout(400);
  await shot(page, "dark-crop");
  await page.locator('[data-emvb-image-tool="adjust"]').click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForTimeout(300);
  expect(await activeColors()).toEqual(light);
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.locator('[data-emvb-image-tool="compose"]').click();
  await page.waitForTimeout(400);
  await shot(page, "1024-crop");
});

test("a narrow editor uses the phone layout: tools at the bottom, controls in a sheet", async ({
  page,
}) => {
  const id = await createPage(author, "Image editor compact", libraryPage(), `ie-m-${unique()}`);
  await keepPageEditorMounted(page);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor(page)).toHaveAttribute("data-layout", "compact");
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await shot(page, "mobile");
  await page
    .locator(
      '.emvb-ie-compact-tools:not(.emvb-ie-compact-tools-inline) [data-emvb-image-tool="compose"]',
    )
    .click();
  await expect(page.locator("[data-emvb-image-sheet]")).toHaveAttribute(
    "data-emvb-image-sheet",
    "open",
  );
  await expect(page.locator("[data-emvb-image-crop-frame]")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "mobile-crop");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "mobile-crop-dark");
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.locator("[data-emvb-image-sheet]")).toHaveAttribute(
    "data-emvb-image-sheet",
    "closed",
  );
});

test("tone tools (W-484): adjust, effects, filters, curves and blur change the picture, by mouse and keyboard", async ({
  page,
}) => {
  const seen = watch(page);
  const id = await createPage(author, "Image editor tone", libraryPage(), `ie-tone-${unique()}`);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.waitForTimeout(600);
  const original = await canvasShot(page);
  const undo = page.locator("[data-emvb-image-undo]");
  // W-872: the active tab's underline sits below its icon and label, not through them.
  const underline = await page.evaluate(() => {
    const root = document.querySelector('.emvb-ie-tabs[data-variant="underline"]');
    const label = root?.querySelector('[role="tab"][aria-selected="true"] .emvb-ie-tab-label');
    const list = root?.querySelector('[role="tablist"]');
    const line = [...(list?.children ?? [])].find((c) => c.getAttribute("role") !== "tab");
    if (!label || !line) return null;
    return line.getBoundingClientRect().top - label.getBoundingClientRect().bottom;
  });
  expect(underline ?? -1).toBeGreaterThanOrEqual(0);
  await expect(undo).toBeDisabled();
  expect(await axeProblems(page)).toEqual([]);

  // Adjust: the arrow keys move a labelled slider; the value field takes a typed number.
  const brightness = page.getByRole("slider", { name: "Brightness" });
  await brightness.focus();
  for (let i = 0; i < 30; i++) await brightness.press("ArrowRight");
  await expect(page.getByRole("textbox", { name: "Brightness value" })).toHaveValue("+0.30");
  const contrast = page.getByRole("textbox", { name: "Contrast value" });
  await contrast.fill("-0.4");
  await contrast.press("Enter");
  await expect(contrast).toHaveValue("-0.40");
  await expect(page.getByRole("slider", { name: "Contrast" })).toHaveValue("-0.4");
  await expect(undo).toBeEnabled();
  await page.getByRole("tab", { name: "Color" }).click();
  const saturation = page.getByRole("textbox", { name: "Saturation value" });
  await saturation.fill("0.6");
  await saturation.press("Enter");
  await page.waitForTimeout(600);
  expect((await canvasShot(page)).equals(original)).toBe(false);
  await shot(page, "adjust-edited");
  await page.locator("[data-emvb-image-section-reset=colors]").click();
  await expect(saturation).toHaveValue("0.00");

  // Effects opens the same panel on its Effects tab.
  await page.locator('[data-emvb-image-tool="effects"]').click();
  await expect(page.getByRole("tab", { name: "Effects" })).toHaveAttribute("aria-selected", "true");
  await shot(page, "effects");

  // Filters: a look, then its strength.
  await resetAll(page);
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await expect(page.locator('[data-emvb-image-filter="None"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const beforeFilter = await canvasShot(page);
  await page.locator('[data-emvb-image-filter="crema"]').click();
  await expect(page.locator('[data-emvb-image-filter="crema"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const strength = page.getByRole("textbox", { name: "Strength value" });
  await expect(strength).toHaveValue("100%");
  await strength.fill("60");
  await strength.press("Enter");
  await expect(strength).toHaveValue("60%");
  await page.waitForTimeout(600);
  expect((await canvasShot(page)).equals(beforeFilter)).toBe(false);
  await shot(page, "filters-on");
  expect(await axeProblems(page)).toEqual([]);

  // Curves: a point is a keyboard slider; + adds a point, Delete removes it.
  await resetAll(page);
  await page.locator('[data-emvb-image-tool="curves"]').click();
  await page.waitForTimeout(400);
  await shot(page, "curves-default");
  const point = (i: number) => page.locator(`[data-curve-index="${i}"]`);
  await expect(page.locator("[data-curve-index]")).toHaveCount(5);
  await point(1).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowUp");
  await expect(point(1)).toHaveAttribute("aria-valuetext", "input 64, output 104");
  await page.keyboard.press("+");
  await expect(page.locator("[data-curve-index]")).toHaveCount(6);
  await expect(point(2)).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(page.locator("[data-curve-index]")).toHaveCount(5);
  // Typed levels for the focused point.
  await point(3).focus();
  const output = page.getByRole("spinbutton", { name: "Output" });
  await output.fill("150");
  await output.press("Enter");
  await expect(point(3)).toHaveAttribute("aria-valuetext", "input 191, output 150");
  // A mouse drag on the red channel.
  await page.getByRole("tab", { name: /^R/ }).nth(1).click();
  await expect(page.locator("[data-emvb-image-curve]")).toHaveAttribute(
    "data-emvb-image-curve",
    "r",
  );
  const mid = await point(2).boundingBox();
  if (mid) {
    await page.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2);
    await page.mouse.down();
    await page.mouse.move(mid.x + mid.width / 2, mid.y - 30, { steps: 5 });
    await page.mouse.up();
  }
  await expect(point(2)).not.toHaveAttribute("aria-valuetext", "input 128, output 128");
  await page.getByRole("tab", { name: "RGB" }).click();
  await page.waitForTimeout(600);
  await shot(page, "curves");
  expect(await axeProblems(page)).toEqual([]);

  // Blur: strength, then move the sharp spot with the keyboard and by dragging.
  await resetAll(page);
  await page.locator('[data-emvb-image-tool="blur"]').click();
  await page.waitForTimeout(400);
  await shot(page, "blur-default");
  const blurStrength = page.getByRole("textbox", { name: "Strength value" });
  await blurStrength.fill("70");
  await blurStrength.press("Enter");
  const spot = page.getByRole("slider", { name: "Sharp spot (blur center)" });
  await spot.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(spot).toHaveAttribute("aria-valuetext", "40% across, 60% down");
  await expect(page.getByRole("textbox", { name: "X value" })).toHaveValue("40%");
  const area = await page.locator("[data-emvb-image-blur-area]").boundingBox();
  if (area) {
    await page.mouse.click(area.x + area.width * 0.7, area.y + area.height * 0.3);
  }
  await expect(spot).toHaveAttribute("aria-valuetext", /^(69|70|71)% across, (29|30|31)% down$/);
  // Dragging the spot doesn't flash the original.
  await expect(page.locator('[data-emvb-image-compare][aria-pressed="true"]')).toHaveCount(0);
  await page.waitForTimeout(800);
  await shot(page, "blur");
  expect(await axeProblems(page)).toEqual([]);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "dark-blur");
  await resetAll(page);
  for (const tool of ["adjust", "curves", "blur", "effects"]) {
    await page.locator(`[data-emvb-image-tool="${tool}"]`).click();
    await page.waitForTimeout(400);
    await shot(page, `dark-${tool}-default`);
  }
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await page.locator('[data-emvb-image-filter="crema"]').click();
  await expect(page.locator('[data-emvb-image-filter="crema"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(600);
  await shot(page, "dark-filters-on");
  expect(await axeProblems(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "light" });

  // Reset all puts the original back.
  await resetAll(page);
  await page.waitForTimeout(800);
  expect((await canvasShot(page)).equals(original)).toBe(true);
  expect(seen.csp).toEqual([]);
});

test("the phone layout shows the tone panels in its sheet", async ({ page }) => {
  const id = await createPage(
    author,
    "Image editor tone phone",
    libraryPage(),
    `ie-tm-${unique()}`,
  );
  await keepPageEditorMounted(page);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor(page)).toHaveAttribute("data-layout", "compact");
  const bar = (tool: string) =>
    page.locator(
      `.emvb-ie-compact-tools:not(.emvb-ie-compact-tools-inline) [data-emvb-image-tool="${tool}"]`,
    );
  const inSheet = (tool: string) =>
    page.locator(`[data-emvb-image-sheet] [data-emvb-image-panel="${tool}"]`);
  await bar("adjust").click();
  await expect(inSheet("adjust")).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "mobile-adjust");
  for (const tool of ["curves", "blur", "filters"]) {
    await page.locator(`[data-emvb-image-sheet] [data-emvb-image-tool="${tool}"]`).click();
    await expect(inSheet(tool)).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `mobile-${tool}`);
  }
  await page.getByRole("button", { name: "Crema" }).click();
  await expect(page.getByRole("button", { name: "Crema" })).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator('[data-emvb-image-sheet] [data-emvb-image-tool="curves"]').click();
  await page.waitForTimeout(400);
  await shot(page, "mobile-curves-dark");
});

test("a picture on another website says why it can't be edited, with no Edit button (W-487)", async ({
  page,
}) => {
  const id = await createPage(
    author,
    "Image editor external",
    imagePage({ src: "https://images.example.com/a.jpg" }),
    `ie-x-${unique()}`,
  );
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 30_000 });
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  const why = overlay(page).locator("[data-emvb-image-cant-edit=external]");
  await expect(why).toContainText("Upload a copy to the media library");
  await expect(overlay(page).locator("[data-emvb-image-edit]")).toHaveCount(0);
  await why.scrollIntoViewIfNeeded();
  await shot(page, "external");
});

test("the published page loads no image-editor code", async ({ page }) => {
  const slug = `ie-pub-${unique()}`;
  const id = await createPage(
    author,
    "Image editor public",
    imagePage({ src: media.url, mediaId: media.id }),
    slug,
  );
  await publishPage(author, id);
  const { slug: stored } = await getPage(author, id);
  const seen = watch(page);
  await page.goto(`/${stored}`);
  await expect(page.locator("img[alt='A garden in autumn']")).toBeVisible();
  const html = await page.content();
  expect(html).not.toMatch(/photocn|editor\.worker|ImageEditorDialog/);
  expect(seen.scripts.some((u) => /editor\.worker|ImageEditorDialog/.test(u))).toBe(false);
});

type StoredImage = { root: { children: { props: Record<string, unknown> }[] } };
const storedImage = async (id: string) =>
  (await storedLayout<StoredImage>(author, id)).root.children[0]?.props ?? {};
const fileBytes = async (url: string) => {
  const res = await author.get(url);
  expect(res.status()).toBe(200);
  return { type: res.headers()["content-type"] ?? "", body: await res.body() };
};
const exportDialog = (page: Page) => page.locator("[data-slot=image-editor-export-dialog]");
const setValue = async (page: Page, name: string, value: string) => {
  const field = page.getByRole("textbox", { name: `${name} value` });
  await field.fill(value);
  await field.press("Enter");
};

test("save a copy (W-485): a new WebP in the library, the original untouched, published, re-opened and reset", async ({
  page,
}) => {
  const seen = watch(page);
  const original = await fileBytes(media.url);
  const slug = `ie-save-${unique()}`;
  const id = await createPage(author, "Image editor save", libraryPage(), slug);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await setValue(page, "Exposure", "0.25");
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await page.locator('[data-emvb-image-filter="crema"]').click();
  await expect(page.locator('[data-emvb-image-filter="crema"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // photocn's export step, with EmVB's defaults.
  await page.locator("[data-emvb-image-save]").click();
  await expect(exportDialog(page)).toBeVisible();
  await expect(exportDialog(page)).toContainText("Export image");
  await expect(exportDialog(page)).toContainText("WebP (recommended)");
  await expect(page.getByRole("textbox", { name: "Quality value" })).toHaveValue("85%");
  await expect(page.getByRole("spinbutton", { name: "Width in pixels" })).toHaveValue("640");
  await expect(page.getByRole("spinbutton", { name: "Height in pixels" })).toHaveValue("480");
  await expect(page.locator("[data-emvb-image-export-note]")).toHaveText("Full resolution");
  // WebP never carries a location, so there's nothing to switch.
  await expect(page.locator("[data-emvb-image-export-gps]")).toHaveCount(0);
  await page.waitForTimeout(300);
  await shot(page, "export-dialog");
  const result = await new AxeBuilder({ page })
    .include("[data-slot=image-editor-export-dialog]")
    .analyze();
  expect(
    result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);

  const upload = page.waitForResponse(
    (r) => r.url().endsWith("/_emdash/api/media") && r.request().method() === "POST",
  );
  await page.locator("[data-emvb-image-export-save]").click();
  expect((await upload).status()).toBeLessThan(300);
  await expect(editor(page)).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edited]")).toBeVisible();
  await expect(overlay(page).locator("[data-emvb-image-edit-summary]")).toHaveText(
    /Crema.*Exposure \+25/,
  );
  await overlay(page).locator("[data-emvb-image-edited]").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await shot(page, "settings-edited");
  await saveDraft(page);

  const props = await storedImage(id);
  const edit = props["edit"] as Record<string, unknown> & {
    recipe: { lights?: Record<string, number> };
    output: Record<string, unknown>;
  };
  expect(props["src"]).not.toBe(media.url);
  expect(props["mediaId"]).not.toBe(media.id);
  expect(props["width"]).toBe(640);
  expect(props["height"]).toBe(480);
  expect(props["alt"]).toBe("A garden in autumn");
  expect(edit).toMatchObject({
    v: 1,
    engine: "photocn",
    originalMediaId: media.id,
    originalSrc: media.url,
    output: { format: "webp", quality: 0.85, stripGps: true },
  });
  expect(edit.recipe.lights?.["exposure"]).toBeCloseTo(0.25);
  const copy = await fileBytes(String(props["src"]));
  expect(copy.type).toBe("image/webp");
  expect(copy.body.subarray(8, 12).toString("latin1")).toBe("WEBP");
  // The original file is byte-for-byte what was uploaded.
  const after = await fileBytes(media.url);
  expect(after.body.equals(original.body)).toBe(true);
  expect(after.body.equals(readFileSync(PHOTO))).toBe(true);

  // Published, the page shows the new file.
  await publishPage(author, id);
  const { slug: stored } = await getPage(author, id);
  const visitor = await page.context().browser()?.newPage();
  if (!visitor) throw new Error("no browser");
  await visitor.goto(`/${stored}`);
  const img = visitor.locator("img[alt='A garden in autumn']");
  await expect(img).toBeVisible();
  expect(await img.getAttribute("src")).toContain(String(props["src"]));
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(640);
  await visitor.close();

  // Re-opening (after a reload: publishing moved the page on) loads the original and puts the
  // same sliders back.
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await expect(file(page)).toContainText("garden");
  await expect(file(page)).not.toContainText("edited");
  await page.locator('[data-emvb-image-tool="adjust"]').click();
  await expect(page.getByRole("textbox", { name: "Exposure value" })).toHaveValue("+0.25");
  await page.locator('[data-emvb-image-tool="filters"]').click();
  await expect(page.locator('[data-emvb-image-filter="crema"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(500);
  await shot(page, "reopened");
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0);

  // Reset to original: the first file again, and the copy stays in the library.
  await overlay(page).locator("[data-emvb-image-reset-original]").click();
  await expect(overlay(page).locator("[data-emvb-image-edited]")).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-reset-original]")).toHaveCount(0);
  await saveDraft(page);
  const reset = await storedImage(id);
  expect(reset["src"]).toBe(media.url);
  expect(reset["mediaId"]).toBe(media.id);
  expect(reset["edit"]).toBeUndefined();
  expect((await fileBytes(String(props["src"]))).type).toBe("image/webp");
  expect(seen.csp).toEqual([]);
});

test("a JPEG copy of a photo with a location has it removed by default (W-485)", async ({
  page,
}) => {
  expect(stripJpegGps(readFileSync(PHOTO).buffer.slice(0) as ArrayBuffer).removed).toBe(true);
  const seen = watch(page);
  const id = await createPage(author, "Image editor jpeg", libraryPage(), `ie-jpg-${unique()}`);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await setValue(page, "Contrast", "0.3");
  await page.locator("[data-emvb-image-save]").click();
  await expect(exportDialog(page)).toBeVisible();
  await exportDialog(page).getByRole("combobox").click();
  await page.getByRole("option", { name: "JPEG" }).click();
  const gps = page.getByRole("switch", { name: "Remove location (GPS)" });
  await expect(gps).toBeChecked();
  await expect(page.locator("[data-emvb-image-export-note]")).toHaveText(
    "Full resolution · EXIF kept, location removed",
  );
  await shot(page, "export-jpeg-gps");
  await page.locator("[data-emvb-image-export-save]").click();
  await expect(editor(page)).toHaveCount(0);
  await saveDraft(page);
  const props = await storedImage(id);
  expect(props["edit"]).toMatchObject({ output: { format: "jpeg", stripGps: true } });
  const copy = await fileBytes(String(props["src"]));
  expect(copy.type).toBe("image/jpeg");
  const bytes = copy.body.buffer.slice(
    copy.body.byteOffset,
    copy.body.byteOffset + copy.body.byteLength,
  ) as ArrayBuffer;
  expect(stripJpegGps(bytes).removed).toBe(false);
  expect(String(props["src"])).toMatch(/\.jpe?g$/);
  expect(seen.csp).toEqual([]);
});

const uploadFixture = async (name: string, width: number, height: number) => {
  const res = await author.post("/_emdash/api/media", {
    headers: { "X-EmDash-Request": "1" },
    multipart: {
      file: {
        name,
        mimeType: "image/png",
        buffer: readFileSync(path.join(process.cwd(), "e2e/fixtures", name)),
      },
      width: String(width),
      height: String(height),
    },
  });
  expect(res.status()).toBeLessThan(300);
  return ((await res.json()) as { data: { item: { id: string; url: string } } }).data.item;
};

/** The RGB of one pixel of an image file, decoded by the browser. */
const pixel = (page: Page, url: string, x: number, y: number) =>
  page.evaluate(
    async ([u, px, py]) => {
      const bitmap = await createImageBitmap(await (await fetch(u)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d");
      ctx.drawImage(bitmap, 0, 0);
      return Array.from(ctx.getImageData(px, py, 1, 1).data.subarray(0, 3));
    },
    [url, x, y] as const,
  );

test("a JPEG copy of a transparent PNG is put on white, not black (W-495)", async ({ page }) => {
  const seen = watch(page);
  const png = await uploadFixture("transparent-half.png", 64, 48);
  const props0 = { src: png.url, mediaId: png.id, width: 64, height: 48 };
  const id = await createPage(author, "Image editor png", imagePage(props0), `ie-png-${unique()}`);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.locator("[data-emvb-image-save]").click();
  await expect(exportDialog(page)).toBeVisible();
  await exportDialog(page).getByRole("combobox").click();
  await page.getByRole("option", { name: "JPEG" }).click();
  await page.locator("[data-emvb-image-export-save]").click();
  await expect(editor(page)).toHaveCount(0);
  await saveDraft(page);
  const props = await storedImage(id);
  const copy = await fileBytes(String(props["src"]));
  expect(copy.type).toBe("image/jpeg");
  // Left half was transparent: white now. Right half keeps its blue.
  const [r, g, b] = await pixel(page, String(props["src"]), 4, 24);
  expect(Math.min(r ?? 0, g ?? 0, b ?? 0)).toBeGreaterThan(235);
  const [r2, , b2] = await pixel(page, String(props["src"]), 56, 24);
  expect(b2 ?? 0).toBeGreaterThan(150);
  expect(r2 ?? 255).toBeLessThan(80);
  expect(seen.csp).toEqual([]);
});

test("a picture past the GPU limit opens reduced to fit and saves inside the layout limit (W-496)", async ({
  page,
}) => {
  const strip = await uploadFixture("wide-strip.png", 16400, 16);
  const id = await createPage(
    author,
    "Image editor strip",
    imagePage({ src: strip.url, mediaId: strip.id, width: 10000, height: 10 }),
    `ie-strip-${unique()}`,
  );
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 60_000,
  });
  const max = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl");
    return gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 0;
  });
  if (max && max < 16400) {
    await expect(page.locator("[data-emvb-image-reduced]")).toBeVisible();
  }
  await page.locator("[data-emvb-image-save]").click();
  await expect(exportDialog(page)).toBeVisible();
  await page.locator("[data-emvb-image-export-save]").click();
  await expect(editor(page)).toHaveCount(0);
  await saveDraft(page);
  const props = await storedImage(id);
  expect(Number(props["width"])).toBeLessThanOrEqual(10000);
  // Not the flat grey a too-large WebGL texture used to give: the strip's green survives.
  // (The 2560 px export cap leaves a strip only a few pixels tall: sample its first row.)
  const [r, g] = await pixel(page, String(props["src"]), 10, 0);
  expect(g ?? 0).toBeGreaterThan((r ?? 0) + 60);
});

test("saving from the main-thread renderer works under the admin CSP (W-485)", async ({ page }) => {
  // No OffscreenCanvas: the editor renders on the main thread, whose export fetches data: URLs.
  await page.addInitScript(() => {
    delete (window as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  });
  const seen = watch(page);
  const id = await createPage(author, "Image editor main", libraryPage(), `ie-main-${unique()}`);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await expect(editor(page)).toHaveAttribute("data-emvb-render-mode", "main");
  await page.getByRole("tab", { name: "Color" }).click();
  await setValue(page, "Saturation", "-0.5");
  await page.locator("[data-emvb-image-save]").click();
  await page.locator("[data-emvb-image-export-save]").click();
  await expect(editor(page)).toHaveCount(0, { timeout: 20_000 });
  await saveDraft(page);
  const props = await storedImage(id);
  expect((await fileBytes(String(props["src"]))).type).toBe("image/webp");
  expect(seen.csp).toEqual([]);
});

test("the export step in dark mode and on a phone (W-485)", async ({ page }) => {
  const id = await createPage(author, "Image editor export ui", libraryPage(), `ie-xu-${unique()}`);
  await keepPageEditorMounted(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.locator("[data-emvb-image-save]").click();
  await expect(exportDialog(page)).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, "export-dialog-dark");
  // Esc closes the export step only; the editor stays open.
  await page.keyboard.press("Escape");
  await expect(exportDialog(page)).toHaveCount(0);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready");
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor(page)).toHaveAttribute("data-layout", "compact");
  await page.locator("[data-emvb-image-save]").click();
  await expect(exportDialog(page)).toBeVisible();
  const box = await exportDialog(page).boundingBox();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBeGreaterThan(780);
  await page.waitForTimeout(400);
  await shot(page, "mobile-export");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "mobile-export-dark");
});

/** Opens the page editor with the Image element selected, without opening the image editor. */
async function selectImage(page: Page, id: string) {
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 30_000 });
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
}

const quickSave = async (page: Page) => {
  await setValue(page, "Exposure", "0.2");
  await page.locator("[data-emvb-image-save]").click();
  await expect(exportDialog(page)).toBeVisible();
  await page.locator("[data-emvb-image-export-save]").click();
  await expect(editor(page)).toHaveCount(0, { timeout: 20_000 });
};

test("the media picker's Edit… saves a copy of a library picture and selects it (W-486)", async ({
  page,
}) => {
  const seen = watch(page);
  // The element shows a picture from another website: Edit… works from the library alone.
  const id = await createPage(
    author,
    "Image editor picker",
    imagePage({ src: "https://images.example.com/old.jpg" }),
    `ie-pick-${unique()}`,
  );
  await selectImage(page, id);
  await overlay(page).locator("[data-emvb-media-library]").click();
  const menu = overlay(page).locator(`[data-emvb-media-menu="${media.id}"]`).first();
  await expect(menu).toBeVisible();
  await menu.click();
  const edit = page.getByRole("menuitem", { name: "Edit…" });
  await expect(edit).toBeVisible();
  await shot(page, "picker-menu");
  await edit.click();
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await expect(file(page)).toContainText("640 × 480 px");
  await quickSave(page);
  await expect(overlay(page).locator("[data-emvb-media-dialog]")).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edited]")).toBeVisible();
  await saveDraft(page);
  const props = await storedImage(id);
  expect(props["src"]).not.toBe(media.url);
  expect(props["edit"]).toMatchObject({ originalMediaId: media.id, originalSrc: media.url });
  expect(props["alt"]).toBe("A garden in autumn");
  expect((await fileBytes(String(props["src"]))).type).toBe("image/webp");
  expect(seen.csp).toEqual([]);
});

test("the command palette's Edit image opens the selected Image and saves onto it (W-486)", async ({
  page,
}) => {
  const seen = watch(page);
  const id = await createPage(author, "Image editor palette", libraryPage(), `ie-pal-${unique()}`);
  await page.goto(`${EDITOR}?entry=${id}`);
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible({ timeout: 30_000 });
  // Nothing selected: no Edit image in the palette.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await page.keyboard.type("Edit image");
  await expect(palette.getByRole("option", { name: /Edit image/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select", { hasText: "Image" }).click();
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await page.keyboard.type("edit image");
  const option = palette.getByRole("option", { name: /Edit image/ });
  await expect(option).toHaveCount(1);
  await shot(page, "palette-edit-image");
  await page.keyboard.press("Enter");
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await quickSave(page);
  await expect(overlay(page).locator("[data-emvb-image-edited]")).toBeVisible();
  await saveDraft(page);
  const props = await storedImage(id);
  expect(props["edit"]).toMatchObject({ originalMediaId: media.id });
  expect(props["mediaId"]).not.toBe(media.id);
  expect(seen.csp).toEqual([]);
});

test("the Metadata tool lists the file and camera data, and warns about the location (W-486)", async ({
  page,
}) => {
  const id = await createPage(author, "Image editor meta", libraryPage(), `ie-meta-${unique()}`);
  await keepPageEditorMounted(page);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  await page.locator('[data-emvb-image-tool="metadata"]').first().click();
  const panel = page.locator("[data-emvb-image-panel=metadata]");
  await expect(panel).toBeVisible();
  await expect(page.locator("[data-emvb-image-exif]")).toHaveText("EXIF ready");
  const row = (label: string) => panel.locator(`[data-emvb-image-meta="${label}"] td`);
  await expect(row("Name")).toHaveText("A garden in autumn");
  await expect(row("Dimensions")).toHaveText("640 x 480");
  await expect(row("Camera")).toHaveText(/NIKON COOLPIX P6000/);
  await expect(row("GPS")).toBeVisible();
  await expect(page.locator("[data-emvb-image-meta-gps]")).toContainText(
    "A JPEG copy has it removed",
  );
  expect(await axeProblems(page)).toEqual([]);
  await page.waitForTimeout(300);
  await shot(page, "metadata");
  // The phone sheet, light then dark (dark last: Chromium keeps some tokens after a switch back).
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor(page)).toHaveAttribute("data-layout", "compact");
  await page
    .locator(
      '.emvb-ie-compact-tools:not(.emvb-ie-compact-tools-inline) [data-emvb-image-tool="metadata"]',
    )
    .click();
  await expect(
    page.locator("[data-emvb-image-sheet] [data-emvb-image-panel=metadata]"),
  ).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, "mobile-metadata");
  expect(await axeProblems(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(300);
  await shot(page, "mobile-metadata-dark");
  expect(await axeProblems(page)).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(editor(page)).toHaveAttribute("data-layout", "desktop");
  await page.waitForTimeout(400);
  await shot(page, "metadata-dark");
});

/** Serious or critical axe findings, plus touch targets smaller than 24 px (WCAG 2.2). */
async function axeTouchProblems(page: Page) {
  const result = await new AxeBuilder({ page })
    .include("[data-emvb-image-editor]")
    .withRules(["target-size"])
    .analyze();
  return result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );
}

test("keyboard only (W-487): focus stays in the editor, the crop frame moves and zooms, edits are announced", async ({
  page,
}) => {
  const id = await createPage(author, "Image editor keyboard", libraryPage(), `ie-kb-${unique()}`);
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  /** null while focus is in the editor (or on Kumo's focus guard that sends it back). */
  const outside = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (el?.closest(".emvb-image-editor-popup") || el?.hasAttribute("data-base-ui-focus-guard"))
        return null;
      return el?.tagName ?? "none";
    });
  // Focus trap: Tab and Shift+Tab never leave the dialog.
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    expect(await outside()).toBeNull();
  }
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await outside()).toBeNull();
  }
  const live = page.locator("[data-emvb-image-live]");
  await page.locator('[data-emvb-image-tool="compose"]').first().click();
  await expect(live).toHaveText("Crop tool");
  const frame = page.locator("[data-emvb-image-crop-frame]");
  await frame.focus();
  await expect(frame).toBeFocused();
  const before = await file(page).textContent();
  for (let i = 0; i < 3; i++) await page.keyboard.press("+");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
  await expect(file(page)).not.toHaveText(before ?? "");
  await expect(live).toHaveText(/^Edits: .*Cropped/);
  await page.waitForTimeout(300);
  await shot(page, "keyboard-crop");
  // Each key press is its own undo step; one Undo is announced, then Reset all.
  await page.locator("[data-emvb-image-undo]").first().click();
  await expect(live).toHaveText(/^Edits: Cropped/);
  await resetAll(page);
  await expect(live).toHaveText("Edits: No changes", { timeout: 5_000 });
  await page.locator('[data-emvb-image-tool="metadata"]').first().click();
  await expect(live).toHaveText("Metadata tool");
  await expect(page.locator("[data-emvb-image-meta-edits]")).toContainText("No changes");
  expect(await axeProblems(page)).toEqual([]);
  // Esc closes the editor and focus goes back to Edit image.
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0);
  await expect(overlay(page).locator("[data-emvb-image-edit]")).toBeFocused();
});

test("phone, tablet and desktop widths (W-487): layouts, touch targets and reduced motion", async ({
  page,
}) => {
  const id = await createPage(author, "Image editor widths", libraryPage(), `ie-w-${unique()}`);
  await keepPageEditorMounted(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openImageEditor(page, id);
  await expect(editor(page)).toHaveAttribute("data-emvb-image-editor", "ready", {
    timeout: 30_000,
  });
  for (const [width, height, layout] of [
    [390, 844, "compact"],
    [768, 1024, "desktop"],
    [1440, 900, "desktop"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(editor(page)).toHaveAttribute("data-layout", layout);
    if (layout === "compact") {
      await page
        .locator(
          '.emvb-ie-compact-tools:not(.emvb-ie-compact-tools-inline) [data-emvb-image-tool="compose"]',
        )
        .click();
      await expect(page.locator("[data-emvb-image-sheet]")).toHaveAttribute(
        "data-emvb-image-sheet",
        "open",
      );
    } else {
      await page.locator('[data-emvb-image-tool="compose"]').first().click();
    }
    await page.waitForTimeout(400);
    expect(await axeTouchProblems(page)).toEqual([]);
    expect(await axeProblems(page)).toEqual([]);
    await shot(page, `width-${width}`);
  }
  // Reduced motion: the sheet and the tools don't animate.
  const animated = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>("[data-emvb-image-editor] *")].filter((el) => {
        const s = getComputedStyle(el);
        return parseFloat(s.transitionDuration) > 0.01 || parseFloat(s.animationDuration) > 0.01;
      }).length,
  );
  expect(animated).toBe(0);
});
