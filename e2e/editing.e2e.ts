import { expect, test, type Page } from "@playwright/test";
import { heading, layoutOfBytes } from "../packages/emvb/test/fixtures/layouts.ts";
import { api, createPage, getPage, parsed, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveStatus, unique } from "./support/helpers.ts";

const PAGES = "/_emdash/admin/plugins/emvb/pages";
const MAX_LAYOUT_BYTES = 512 * 1024;

const layoutFor = (text: string) => ({
  schemaVersion: 5,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
  },
});

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

async function selectHeading(page: Page, text: string) {
  await canvas(page).getByRole("heading", { name: text }).click();
  await expect(overlay(page).locator(".emvb-overlay-label")).toContainText("Heading");
}

test("New page creates a page and opens it; a duplicate slug is refused inline", async ({
  page,
}) => {
  const title = `Created ${unique()}`;
  await page.goto(PAGES);
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByLabel("Title").fill(title);
  const slug = await page.getByLabel("Slug").inputValue();
  expect(slug).toMatch(/^created-/);
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page).toHaveURL(/\/editor\?entry=/, { timeout: 20_000 });
  await expect(canvas(page).getByRole("heading", { name: title })).toBeVisible();

  await page.goto(PAGES);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByLabel("Title").fill("Another page");
  await page.getByLabel("Slug").fill(slug);
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(
    page.getByText(`A page with the slug "${slug}" already exists. Choose a different slug.`),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/pages$/);
});

test("after save and reload the layout is deep-equal, and a draft save leaves the published page alone", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Save check", layoutFor("First text"), `save-${unique()}`);
  await openEditor(page, id, "First text");
  await selectHeading(page, "First text");
  await overlay(page).getByLabel("Text", { exact: true }).fill("Saved text");
  await expect(
    overlay(page).getByRole("button", { name: "Save draft (unsaved changes)" }),
  ).toBeVisible();
  await overlay(page).getByRole("button", { name: "Save draft (unsaved changes)" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const saved = layoutFor("Saved text");
  expect(parsed((await getPage(request, id)).data["layout"])).toEqual(saved);

  await page.reload();
  await openEditor(page, id, "Saved text");
  expect(parsed((await getPage(request, id)).data["layout"])).toEqual(saved);

  await overlay(page).getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Published", { exact: true }).last()).toBeVisible();
  await expect(overlay(page).locator(".emvb-status")).toHaveText("Published");
  await expect(page.getByRole("button", { name: "View page ↗" })).toBeVisible();

  await selectHeading(page, "Saved text");
  await overlay(page).getByLabel("Text", { exact: true }).fill("Draft only");
  await page.keyboard.press("Control+s");
  await expect(saveStatus(page)).toHaveText("Saved");
  const stored = await getPage(request, id);
  expect(stored.status).toBe("published");
  expect(parsed(stored.data["layout"])).toEqual(layoutFor("Draft only"));
  expect(parsed(stored.liveData?.["layout"])).toEqual(saved);
});

test("a concurrent edit from another browser shows the conflict dialog and overwrites nothing", async ({
  page,
  browser,
  request,
}) => {
  const id = await createPage(
    request,
    "Conflict check",
    layoutFor("Shared"),
    `conflict-${unique()}`,
  );
  await openEditor(page, id, "Shared");

  const other = await browser.newContext({ storageState: test.info().project.use.storageState });
  const second = await other.newPage();
  await openEditor(second, id, "Shared");
  await overlay(second).getByLabel("Title").fill("Theirs");
  await second.keyboard.press("Control+s");
  await expect(saveStatus(second)).toHaveText("Saved");
  await other.close();

  await overlay(page).getByLabel("Title").fill("Mine");
  await page.keyboard.press("Control+s");
  const dialog = page.locator('[data-emvb-dialog="conflict"]');
  await expect(dialog).toBeVisible();
  expect((await getPage(request, id)).data["title"]).toBe("Theirs");

  await dialog.getByRole("button", { name: "Reload page" }).click();
  await expect(dialog).toBeHidden();
  await expect(overlay(page).getByLabel("Title")).toHaveValue("Theirs");
  expect((await getPage(request, id)).data["title"]).toBe("Theirs");
});

test("growing a page past the size limit shows the size error and saves nothing", async ({
  page,
  request,
}) => {
  const layout = layoutOfBytes(MAX_LAYOUT_BYTES - 1100);
  layout.root.children.push(heading("hlast001", "x".repeat(900), 2));
  const id = await createPage(request, "Size check", layout, `size-${unique()}`);
  const before = await getPage(request, id);
  await openEditor(page, id);
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select").last().click();
  await overlay(page)
    .getByLabel("Text", { exact: true })
    .fill("x".repeat(900) + "y".repeat(300));
  await page.keyboard.press("Control+s");
  await expect(saveStatus(page)).toContainText("and the limit is 512 KB");
  expect((await getPage(request, id)).rev).toBe(before.rev);
});

test("Delete shows a Restore toast above the editor; clicking its centre restores the element in place", async ({
  page,
  request,
}) => {
  const layout = layoutFor("Keep me");
  layout.root.children.push({
    id: "head0002",
    type: "heading",
    props: { text: "Second", level: 2 },
  });
  const id = await createPage(request, "Restore check", layout, `restore-${unique()}`);
  await openEditor(page, id, "Keep me");
  await selectHeading(page, "Keep me");
  await overlay(page).getByRole("button", { name: "Delete element" }).click();
  await expect(canvas(page).getByRole("heading", { name: "Keep me" })).toHaveCount(0);

  const restore = page.getByRole("button", { name: "Restore" });
  await expect(restore).toBeVisible();
  // The toast slides in; once settled, the element at its centre must be the Restore button.
  const centreOf = async () => {
    const box = await restore.boundingBox();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : { x: -1, y: -1 };
  };
  const hitAt = (point: { x: number; y: number }) =>
    page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.textContent ?? null,
      point,
    );
  await expect.poll(async () => hitAt(await centreOf())).toBe("Restore");
  const centre = await centreOf();
  await page.mouse.click(centre.x, centre.y);

  const headings = canvas(page).getByRole("heading");
  await expect(headings).toHaveText(["Keep me", "Second"]);
  await expect(overlay(page).locator('[data-emvb-selected="head0001"]')).toBeVisible();
});

test("page settings show the SEO section closed until opened", async ({ page, request }) => {
  const id = await createPage(request, "SEO check", layoutFor("SEO"), `seo-${unique()}`);
  await openEditor(page, id, "SEO");
  await expect(overlay(page).getByLabel("Meta title")).toHaveCount(0);
  await overlay(page).getByRole("button", { name: "SEO", exact: true }).click();
  await overlay(page).getByLabel("Meta title").fill("Search title");
  await page.keyboard.press("Control+s");
  await expect(saveStatus(page)).toHaveText("Saved");
  const stored = await api(request, "GET", `/_emdash/api/content/emvb_pages/${id}`);
  expect(JSON.stringify(stored.json)).toContain("Search title");
});

test("Site styles opens the Variables drawer", async ({ page, request }) => {
  const id = await createPage(
    request,
    "Site styles check",
    layoutFor("Styled"),
    `site-${unique()}`,
  );
  await openEditor(page, id, "Styled");
  await overlay(page).getByRole("button", { name: "Site styles" }).click();
  await expect(overlay(page).locator("[data-emvb-site-styles]")).toBeVisible();
  await expect(overlay(page).locator('[data-emvb-site-tab="variables"]')).toBeVisible();
  await expect(
    overlay(page).getByText("Changes to site styles apply to all pages immediately."),
  ).toBeVisible();
});

test("a colour variable can be created, bound and edited, and the design persists", async ({
  page,
  request,
}) => {
  const id = await createPage(request, "Variable check", layoutFor("Coloured"), `var-${unique()}`);
  const name = `Accent ${unique()}`;
  await openEditor(page, id, "Coloured");
  await selectHeading(page, "Coloured");
  await overlay(page).getByRole("tab", { name: "Style" }).click();
  await overlay(page).getByRole("button", { name: "New variable" }).click();
  await overlay(page).getByLabel("Variable name").fill(name);
  await overlay(page).getByLabel("Value", { exact: true }).fill("#0055ff");
  await overlay(page).getByRole("button", { name: "Create variable" }).click();
  const title = canvas(page).getByRole("heading", { name: "Coloured" });
  await expect(title).toHaveCSS("color", "rgb(0, 85, 255)");

  await overlay(page).getByLabel(`${name} value`).fill("#ff0000");
  await overlay(page).getByLabel(`${name} value`).press("Enter");
  await expect(title).toHaveCSS("color", "rgb(255, 0, 0)");
  await page.keyboard.press("Control+s");
  await expect(saveStatus(page)).toHaveText("Saved");

  const design = await api(request, "GET", "/_emdash/api/plugins/emvb/design");
  const data = design.json?.["data"] as
    | { design: { variables: { colors: unknown[] } } }
    | undefined;
  const colors = data?.design.variables.colors ?? [];
  expect(colors).toContainEqual(expect.objectContaining({ name, value: "#ff0000" }));
  await page.reload();
  await openEditor(page, id, "Coloured");
  await expect(canvas(page).getByRole("heading", { name: "Coloured" })).toHaveCSS(
    "color",
    "rgb(255, 0, 0)",
  );
});

const tabPanel = (id: string, label: string, text: string) => ({
  id,
  type: "tab-panel",
  props: { label },
  children: [heading(`h${id.slice(1)}`, text)],
});

test("on the canvas a tab label shows its panel, and so does a panel chosen in Layers", async ({
  page,
  request,
}) => {
  const layout = {
    schemaVersion: 5,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        {
          id: "tabs0001",
          type: "tabs",
          props: {},
          children: [
            tabPanel("tpa00001", "First", "Panel one"),
            tabPanel("tpb00001", "Second", "Panel two"),
            tabPanel("tpc00001", "Third", "Panel three"),
          ],
        },
      ],
    },
  };
  const id = await createPage(request, "Canvas tabs", layout, `tabs-${unique()}`);
  await openEditor(page, id, "Panel one");
  const shown = (text: string) => canvas(page).getByRole("heading", { name: text });
  await expect(shown("Panel two")).toBeHidden();

  await canvas(page).locator(".emvb-tab-label", { hasText: "Second" }).click();
  await expect(shown("Panel two")).toBeVisible();
  await expect(shown("Panel one")).toBeHidden();
  await expect(overlay(page).locator(".emvb-overlay-label")).toContainText("Tab panel");

  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select").filter({ hasText: "Panel three" }).click();
  await expect(shown("Panel three")).toBeVisible();
  await expect(shown("Panel two")).toBeHidden();
});
