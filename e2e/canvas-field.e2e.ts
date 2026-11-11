import { homedir } from "node:os";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { api, parsed, setUpEmvbOnce } from "./support/api.ts";
import { ROLES, setDevRole } from "./support/roles.ts";
import { canvas, overlay, unique } from "./support/helpers.ts";

// W-902: the demos' own `pages` collection carries an emvb:canvas field (W-900, W-901).
test.describe.configure({ mode: "serial" });
setUpEmvbOnce();

// Screenshots for review (W-904); outside the repo, copied to the box by hand.
const SHOTS = `${homedir()}/agent-tools/emvb-ui`;
const layout = (text: string) => ({
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [{ id: "head0001", type: "heading", props: { text, level: 2 } }],
  },
});

/** Older demo databases predate the seed's `canvas` field; add it the way a site owner would. */
async function ensureCanvasField(request: APIRequestContext) {
  const schema = await api(
    request,
    "GET",
    "/_emdash/api/schema/collections/pages?includeFields=true",
  );
  const fields = ((schema.json ?? {})["data"] as { item: { fields: { slug: string }[] } }).item
    .fields;
  if (fields.some((f) => f.slug === "canvas")) return;
  const created = await api(request, "POST", "/_emdash/api/schema/collections/pages/fields", {
    slug: "canvas",
    label: "Canvas",
    type: "json",
    widget: "emvb:canvas",
    validation: null,
  });
  expect(created.status).toBe(201);
}

async function createHostPage(request: APIRequestContext, data: Record<string, unknown>) {
  const slug = `canvas-${unique()}`;
  const created = await api(request, "POST", "/_emdash/api/content/pages", { data, slug });
  expect(created.status).toBe(201);
  const id = ((created.json ?? {})["data"] as { item: { id: string } }).item.id;
  return { id, slug };
}

const storedCanvas = async (request: APIRequestContext, id: string) =>
  parsed(
    (
      ((await api(request, "GET", `/_emdash/api/content/pages/${id}`)).json ?? {})["data"] as {
        item: { data: Record<string, unknown> };
      }
    ).item.data["canvas"],
  );

let changed: string | null = null;
test.afterAll(() => {
  if (changed) setDevRole(changed, ROLES.admin);
});

test.beforeAll(async ({ playwright }, info) => {
  const request = await playwright.request.newContext({
    baseURL: info.project.use.baseURL,
    storageState: info.project.use.storageState as string,
  });
  await ensureCanvasField(request);
  await request.dispose();
});

test("the demo grants schema:read: an invalid layout in a host field is refused, a valid one saved", async ({
  request,
}) => {
  const { id } = await createHostPage(request, { title: "Canvas checks" });
  const bad = await api(request, "PUT", `/_emdash/api/content/pages/${id}`, {
    data: { canvas: { schemaVersion: 17, root: { id: "x", type: "nope", props: {} } } },
  });
  expect(bad.status).toBeGreaterThanOrEqual(400);
  expect(await storedCanvas(request, id)).toBeFalsy();
  const good = await api(request, "PUT", `/_emdash/api/content/pages/${id}`, {
    data: { canvas: layout("Checked") },
  });
  expect(good.status).toBe(200);
  expect(await storedCanvas(request, id)).toEqual(layout("Checked"));
});

test("an author can't change a host layout and sees it read-only (D-061)", async ({
  page,
  request,
}, info) => {
  const { id } = await createHostPage(request, { title: "Author view", canvas: layout("Kept") });
  changed = info.project.name;
  setDevRole(changed, ROLES.author);
  const wipe = await api(request, "PUT", `/_emdash/api/content/pages/${id}`, {
    data: { canvas: null },
  });
  expect(wipe.status).toBeGreaterThanOrEqual(400);
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  const widget = page.locator('[data-emvb-widget="canvas"]');
  await expect(widget).toContainText("Only editors and administrators can change this layout.");
  await expect(widget.getByRole("button", { name: "Edit with EmVB" })).toHaveCount(0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await widget.scrollIntoViewIfNeeded();
    await widget.screenshot({
      path: `${SHOTS}/canvas-card-author-${info.project.name}-${scheme}.png`,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
  setDevRole(changed, ROLES.admin);
  changed = null;
  expect(await storedCanvas(request, id)).toEqual(layout("Kept"));
});

test("an admin edits the field in EmVB, applies, saves the entry, and the page renders it", async ({
  page,
  request,
}, info) => {
  const project = info.project.name;
  const { id, slug } = await createHostPage(request, {
    title: "Field mode",
    canvas: layout("Before"),
  });
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  const widget = page.locator('[data-emvb-widget="canvas"]');
  await expect(widget).toContainText("2 elements");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await widget.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/canvas-widget-${project}-${scheme}.png` });
    await widget.screenshot({ path: `${SHOTS}/canvas-card-${project}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await widget.getByRole("button", { name: "Edit with EmVB" }).click();
  const editor = overlay(page);
  await expect(editor.getByRole("button", { name: "Apply" })).toBeVisible({ timeout: 20_000 });
  await expect(editor.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await expect(editor.locator(".emvb-save-button")).toHaveCount(0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: `${SHOTS}/canvas-field-editor-${project}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(editor).toHaveCount(0);

  // The entry's own Save stores the applied layout; then publish it and visit the page.
  const next = layout("After");
  const put = await api(request, "PUT", `/_emdash/api/content/pages/${id}`, {
    data: { canvas: next },
  });
  expect(put.status).toBe(200);
  expect((await api(request, "POST", `/_emdash/api/content/pages/${id}/publish`, {})).status).toBe(
    200,
  );
  const response = await page.goto(`/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "After", level: 2 })).toBeVisible();
});

test("W-907: Apply, then the entry's own Save, stores the layout the published page shows", async ({
  page,
  request,
}) => {
  const before = `Form ${unique()}`;
  const after = `${before} saved`;
  const { id, slug } = await createHostPage(request, {
    title: "Form save",
    canvas: layout(before),
  });
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  const widget = page.locator('[data-emvb-widget="canvas"]');
  await widget.getByRole("button", { name: "Edit with EmVB" }).click();
  const editor = overlay(page);
  await canvas(page).getByRole("heading", { name: before }).click();
  await editor.getByLabel("Text", { exact: true }).fill(after);
  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(editor).toHaveCount(0);
  await expect(widget).toContainText(after);
  // Apply only changes the form; nothing is stored until the entry is saved.
  expect(JSON.stringify(await storedCanvas(request, id))).toContain(before);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify(await storedCanvas(request, id)), { timeout: 15_000 })
    .toContain(after);
  expect((await api(request, "POST", `/_emdash/api/content/pages/${id}/publish`, {})).status).toBe(
    200,
  );
  const response = await page.goto(`/${slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: after, level: 2 })).toBeVisible();
});

test("W-911: Preview in field mode shows the unsaved layout, sandboxed, without storing it", async ({
  page,
  request,
}, info) => {
  const before = `Peek ${unique()}`;
  const after = `${before} unsaved`;
  const { id } = await createHostPage(request, { title: "Field preview", canvas: layout(before) });
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  await page
    .locator('[data-emvb-widget="canvas"]')
    .getByRole("button", { name: "Edit with EmVB" })
    .click();
  const editor = overlay(page);
  await canvas(page).getByRole("heading", { name: before }).click();
  await editor.getByLabel("Text", { exact: true }).fill(after);
  await editor.getByRole("button", { name: "Preview", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="field-preview"]');
  const frame = dialog.locator("iframe[data-emvb-field-preview]");
  await expect(frame).toHaveAttribute("sandbox", "");
  await expect(
    page.frameLocator('[data-emvb-dialog="field-preview"] iframe').getByRole("heading", {
      name: after,
      level: 2,
    }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: "Mobile" }).click();
  await expect(frame).toHaveAttribute("data-emvb-field-preview", "mobile");
  expect((await frame.boundingBox())?.width).toBeCloseTo(390, 0);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({
      path: `${SHOTS}/w911-field-preview-${info.project.name}-${scheme}.png`,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await dialog.getByRole("button", { name: "Back to editing" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "Apply" })).toBeVisible();
  expect(JSON.stringify(await storedCanvas(request, id))).toContain(before);
  expect(JSON.stringify(await storedCanvas(request, id))).not.toContain(after);
});

test("W-920: the field Preview frame wears the site's own stylesheet in light and dark", async ({
  page,
  request,
}, info) => {
  const text = `Styled ${unique()}`;
  const { id } = await createHostPage(request, { title: "Styled preview", canvas: layout(text) });
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  await page
    .locator('[data-emvb-widget="canvas"]')
    .getByRole("button", { name: "Edit with EmVB" })
    .click();
  await overlay(page).getByRole("button", { name: "Preview", exact: true }).click();
  const heading = page
    .frameLocator('[data-emvb-dialog="field-preview"] iframe')
    .getByRole("heading", { name: text, level: 2 });
  await expect(heading).toBeVisible();
  // site.css sets system-ui; the browser default would be a serif.
  await expect
    .poll(() => heading.evaluate((el) => getComputedStyle(el).fontFamily))
    .toContain("system-ui");
  expect(await heading.evaluate((el) => getComputedStyle(el.ownerDocument.body).marginTop)).toBe(
    "0px",
  );
  // A frame wider than the stage scrolls; centring must not clip its left edge (W-920).
  // The dialog scales in over 150 ms, so measure only once it has settled and read both
  // boxes in the same tick; two separate reads can straddle the animation.
  const { stageX, frameX } = await page.evaluate(async () => {
    const dialog = document.querySelector('[data-emvb-dialog="field-preview"]');
    await Promise.all(
      (dialog?.getAnimations({ subtree: true }) ?? []).map((a) => a.finished.catch(() => null)),
    );
    const stage = document.querySelector(".emvb-field-preview-stage")?.getBoundingClientRect();
    const frame = document
      .querySelector("iframe[data-emvb-field-preview]")
      ?.getBoundingClientRect();
    return { stageX: stage?.x ?? Number.NaN, frameX: frame?.x ?? Number.NaN };
  });
  expect(frameX).toBeGreaterThanOrEqual(stageX);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({
      path: `${SHOTS}/w920-field-preview-${info.project.name}-${scheme}.png`,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
});

test("W-912: Convert to EmVB starts a layout from the saved body and never changes the body", async ({
  page,
  request,
}, info) => {
  const title = `Convert ${unique()}`;
  const content = [
    {
      _type: "block",
      _key: "a1",
      style: "h2",
      markDefs: [],
      children: [{ _type: "span", _key: "s1", text: "Our story", marks: [] }],
    },
    {
      _type: "block",
      _key: "a2",
      style: "normal",
      markDefs: [],
      children: [
        { _type: "span", _key: "s2", text: "<img src=x onerror=alert(1)> plain words", marks: [] },
      ],
    },
    {
      _type: "block",
      _key: "a3",
      style: "normal",
      listItem: "bullet",
      level: 1,
      markDefs: [],
      children: [{ _type: "span", _key: "s3", text: "Point one", marks: [] }],
    },
  ];
  const { id } = await createHostPage(request, { title, content });
  const stored = async () =>
    ((await api(request, "GET", `/_emdash/api/content/pages/${id}`)).json ?? {})["data"] as {
      item: { data: Record<string, unknown> };
    };
  const before = JSON.stringify((await stored()).item.data["content"]);
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  const widget = page.locator('[data-emvb-widget="canvas"]');
  const convert = widget.getByRole("button", { name: "Convert to EmVB" });
  await expect(convert).toBeVisible();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await widget.screenshot({
      path: `${SHOTS}/w912-convert-card-${info.project.name}-${scheme}.png`,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await convert.click();
  const editor = overlay(page);
  await expect(editor.getByRole("button", { name: "Apply" })).toBeVisible({ timeout: 20_000 });
  await expect(canvas(page).getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(canvas(page).getByRole("heading", { name: "Our story", level: 2 })).toBeVisible();
  await expect(canvas(page).getByText("<img src=x onerror=alert(1)> plain words")).toBeVisible();
  await expect(canvas(page).locator("img")).toHaveCount(0);
  await expect(canvas(page).getByRole("listitem")).toHaveText(["Point one"]);
  await editor.getByRole("button", { name: "Apply" }).click();
  await expect(widget).toContainText("5 elements");
  await expect(widget.locator('[data-emvb-convert="done"]')).toContainText("Converted 3 blocks");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await widget.screenshot({
      path: `${SHOTS}/w912-converted-card-${info.project.name}-${scheme}.png`,
    });
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(async () => JSON.stringify((await stored()).item.data["canvas"] ?? null), {
      timeout: 15_000,
    })
    .toContain("Our story");
  expect(JSON.stringify((await stored()).item.data["content"])).toBe(before);
});

test("W-963: Convert to rich text copies the layout's words into content after a confirm", async ({
  page,
  request,
}) => {
  const title = `Rich ${unique()}`;
  const old = [
    {
      _type: "block",
      _key: "o1",
      style: "normal",
      markDefs: [],
      children: [{ _type: "span", _key: "s1", text: "Old body", marks: [] }],
    },
  ];
  const canvasLayout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "head0001", type: "heading", props: { text: "From the canvas", level: 2 } },
        {
          id: "text0001",
          type: "text",
          props: { text: "Bold words here", marks: [{ start: 0, end: 4, bold: true }] },
        },
        { id: "list0001", type: "list", props: { items: ["Alpha", "Beta"] } },
      ],
    },
  };
  const { id } = await createHostPage(request, { title, content: old, canvas: canvasLayout });
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  const widget = page.locator('[data-emvb-widget="canvas"]');
  await widget.getByRole("button", { name: "Convert to rich text" }).click();
  const dialog = page.locator('[data-emvb-dialog="convert-rich-text"]');
  await expect(dialog).toContainText("Copy this layout into content?");
  await expect(dialog).toContainText("replacing what it holds now");
  // Nothing is written before the confirm.
  const body = async () =>
    parsed(
      (
        ((await api(request, "GET", `/_emdash/api/content/pages/${id}`)).json ?? {})["data"] as {
          item: { data: Record<string, unknown> };
        }
      ).item.data["content"],
    ) as { style?: string; listItem?: string; children?: { text: string; marks: string[] }[] }[];
  expect(JSON.stringify(await body())).toContain("Old body");
  await Promise.all([
    page.waitForEvent("load"),
    dialog.getByRole("button", { name: "Replace content" }).click(),
  ]);
  const blocks = await body();
  expect(
    blocks.map((b) => [b.listItem ?? b.style, b.children?.map((c) => c.text).join("")]),
  ).toEqual([
    ["h2", "From the canvas"],
    ["normal", "Bold words here"],
    ["bullet", "Alpha"],
    ["bullet", "Beta"],
  ]);
  expect(blocks[1]?.children?.[0]?.marks).toEqual(["strong"]);
  // The layout is left alone.
  expect(JSON.stringify(await storedCanvas(request, id))).toContain("From the canvas");
});
