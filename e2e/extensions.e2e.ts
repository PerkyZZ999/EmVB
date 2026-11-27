import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, emulateAdminColorScheme, openEditor, overlay, unique } from "./support/helpers.ts";

// W-1086: the sample extension emvb-ext-hello (registered in both demos) puts allowlisted
// classes on its output and ships a stylesheet and a runtime. Both load only on pages that
// render one of its elements, on Node and on Cloudflare Workers.

setUpEmvbOnce();

const GREETING = "ext:emvb-ext-hello/greeting";

const layoutWith = (children: unknown[]) => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children },
});

async function publish(request: APIRequestContext, title: string, children: unknown[]) {
  const slug = `ext-${unique()}`;
  const id = await createPage(request, title, layoutWith(children), slug);
  await publishPage(request, id);
  return { id, slug };
}

test("an extension's classes, stylesheet and runtime reach only the pages that show its element (W-1086)", async ({
  page,
  request,
}) => {
  const withIt = await publish(request, "Extension page", [
    { id: "head0001", type: "heading", props: { text: "Extension page", level: 1 } },
    { id: "greet001", type: GREETING, props: { text: "Hi from the extension" } },
  ]);
  const without = await publish(request, "Plain page", [
    { id: "head0001", type: "heading", props: { text: "Plain page", level: 1 } },
  ]);

  await page.goto(`/${withIt.slug}`);
  const card = page.locator(".emvb-ext > .hello-card");
  await expect(card).toHaveCount(1);
  // The classes are added to the built-in element's own ones; nothing else is added.
  expect(await card.getAttribute("class")).toMatch(/^emvb-div-block( \S+)* hello-card$/);
  const title = card.locator("h2");
  await expect(title).toHaveText("Hi from the extension");
  expect(await title.getAttribute("class")).toMatch(/ hello-title hello-wave$/);
  // The stylesheet is on the page and styles the classes.
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("2px");
  // The runtime is written once and has run.
  await expect(page.locator('script[data-emvb-ext-runtime="emvb-ext-hello"]')).toHaveCount(1);
  await expect(card).toHaveAttribute("data-hello-ready", "");
  await expect(title).toHaveAttribute("data-hello-wave", "on");

  await page.goto(`/${without.slug}`);
  await expect(page.getByRole("heading", { name: "Plain page" })).toBeVisible();
  await expect(page.locator("script[data-emvb-ext-runtime]")).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toContain("hello-card");
  expect(html).not.toContain("/* emvb-ext-hello */");
});

test("the extension runtime leaves the wave off under reduced motion (W-1086)", async ({
  page,
  request,
}) => {
  const { slug } = await publish(request, "Calm extension page", [
    { id: "greet001", type: GREETING, props: { text: "Calm hello" } },
  ]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/${slug}`);
  const card = page.locator(".hello-card");
  await expect(card).toHaveAttribute("data-hello-ready", "");
  expect(await card.locator(".hello-wave").getAttribute("data-hello-wave")).toBeNull();
});

test("the editor canvas shows the extension's output with its classes and stylesheet, and no runtime (W-1086)", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Extension canvas",
    layoutWith([
      { id: "head0001", type: "heading", props: { text: "Extension canvas", level: 1 } },
      { id: "greet001", type: GREETING, props: { text: "Hello on the canvas" } },
    ]),
    `ext-${unique()}`,
  );
  await openEditor(page, id, "Extension canvas");
  const card = canvas(page).locator('[data-emvb-id="greet001"] > .hello-card');
  await expect(card).toHaveCount(1);
  await expect(card.locator("h2")).toHaveText("Hello on the canvas");
  expect(await card.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("2px");
  await expect(canvas(page).locator("script")).toHaveCount(0);
  // The stylesheet stays in the canvas frame: the admin page itself never gets it.
  expect(
    await page.evaluate(() => document.documentElement.outerHTML.includes(".hello-card")),
  ).toBe(false);
});

// extensionApi 1.5: the canvas root carries the admin's own light or dark mode, as a public page
// carries a visitor's choice, so a kit's dark rules show while editing and follow a switch. A kit's
// rule is keyed on `[data-emvb-theme=dark]` on the root (see scopeExtensionCss).
test("the editor canvas follows the admin's light or dark mode, and a kit's themed style follows it (extensionApi 1.5)", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Extension theme",
    layoutWith([
      { id: "head0001", type: "heading", props: { text: "Extension theme", level: 1 } },
      { id: "greet001", type: GREETING, props: { text: "Hello in a theme" } },
    ]),
    `ext-${unique()}`,
  );
  // The admin must be loaded before its colour scheme can be read, so set the scheme after the editor opens.
  await openEditor(page, id, "Extension theme");
  await emulateAdminColorScheme(page, "light");
  const root = canvas(page).locator("html");
  await expect(root).toHaveAttribute("data-emvb-theme", "light");
  // A stylesheet written the way a kit's is after scoping: a default, and a rule for the dark root.
  const card = canvas(page).locator('[data-emvb-id="greet001"] > .hello-card');
  await expect(card).toHaveCount(1);
  await card.evaluate((el) => {
    const style = el.ownerDocument.createElement("style");
    style.textContent =
      ".hello-card{background-color:rgb(255,255,255)}" +
      '[data-emvb-theme="dark"] .hello-card{background-color:rgb(1,2,3)}';
    el.ownerDocument.head.append(style);
  });
  const background = () => card.evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect.poll(background).toBe("rgb(255, 255, 255)");
  // The admin switches to dark: the canvas root follows, and the themed rule now applies.
  await emulateAdminColorScheme(page, "dark");
  await expect(root).toHaveAttribute("data-emvb-theme", "dark");
  await expect.poll(background).toBe("rgb(1, 2, 3)");
  // And back.
  await emulateAdminColorScheme(page, "light");
  await expect(root).toHaveAttribute("data-emvb-theme", "light");
  await expect.poll(background).toBe("rgb(255, 255, 255)");
});
// W-1088 (#37): an element whose extension isn't installed (removed from astro.config) keeps its
// data. Visitors see nothing in its place; the editor canvas and the field Preview keep the note.
const GONE = "ext:emvb-ext-gone/notice";

test("a missing extension shows nothing to visitors and a note in the editor and Preview (W-1088)", async ({
  page,
  request,
}) => {
  const { id, slug } = await publish(request, "Missing extension page", [
    { id: "head0001", type: "heading", props: { text: "Missing extension page", level: 1 } },
    { id: "gone0001", type: GONE, props: { text: "Kept for later" } },
    { id: "text0001", type: "text", props: { text: "After the missing block" } },
  ]);

  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { name: "Missing extension page" })).toBeVisible();
  await expect(page.getByText("After the missing block")).toBeVisible();
  await expect(page.locator(".emvb-ext-missing, [data-emvb-ext]")).toHaveCount(0);
  await expect(page.getByText("This block needs an extension that is not installed.")).toHaveCount(
    0,
  );

  await openEditor(page, id, "Missing extension page");
  const note = canvas(page).locator('[data-emvb-id="gone0001"].emvb-ext-missing');
  await expect(note).toHaveText(`Missing extension “${GONE}”`);

  // Field mode's Preview shows the public page as the editor has it, note included.
  const schema = await api(
    request,
    "GET",
    "/_emdash/api/schema/collections/pages?includeFields=true",
  );
  const fields = ((schema.json ?? {})["data"] as { item: { fields: { slug: string }[] } }).item
    .fields;
  if (!fields.some((f) => f.slug === "canvas")) {
    const added = await api(request, "POST", "/_emdash/api/schema/collections/pages/fields", {
      slug: "canvas",
      label: "Canvas",
      type: "json",
      widget: "emvb:canvas",
      validation: null,
    });
    expect(added.status).toBe(201);
  }
  const created = await api(request, "POST", "/_emdash/api/content/pages", {
    data: {
      title: "Missing extension field",
      canvas: layoutWith([
        { id: "head0001", type: "heading", props: { text: "Field page", level: 2 } },
        { id: "gone0001", type: GONE, props: {} },
      ]),
    },
    slug: `ext-field-${unique()}`,
  });
  expect(created.status).toBe(201);
  const hostId = ((created.json ?? {})["data"] as { item: { id: string } }).item.id;
  await page.goto(`/_emdash/admin/content/pages/${hostId}`);
  await page
    .locator('[data-emvb-widget="canvas"]')
    .getByRole("button", { name: "Edit with EmVB" })
    .click();
  await expect(canvas(page).getByRole("heading", { name: "Field page" })).toBeVisible();
  await overlay(page).getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.frameLocator('[data-emvb-dialog="field-preview"] iframe');
  await expect(preview.getByRole("heading", { name: "Field page" })).toBeVisible();
  await expect(preview.locator(".emvb-ext-missing")).toHaveText(
    "This block needs an extension that is not installed.",
  );
});

// W-1088 (#36): the sample's "About Hello" panel names its "site-info" source; the editor lists
// the source's values read-only (the server resolves them, on Node and on Workers).
test("an extension panel lists its source's values read-only (W-1088)", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Extension panel",
    layoutWith([{ id: "head0001", type: "heading", props: { text: "Extension panel", level: 1 } }]),
    `ext-${unique()}`,
  );
  await openEditor(page, id, "Extension panel");
  const panel = overlay(page).locator('[data-emvb-ext-panel="ext:emvb-ext-hello/about"]');
  await panel.scrollIntoViewIfNeeded();
  const values = panel.locator('dl[aria-label="Hello site info values"]');
  await expect(values).toBeVisible();
  await expect(values.locator("dt")).toHaveText(["title", "tagline"]);
  await expect(values.locator("dd")).toHaveText(["EmVB", "Extensions API sample"]);
  await expect(values.locator("input, textarea, [contenteditable]")).toHaveCount(0);
});
