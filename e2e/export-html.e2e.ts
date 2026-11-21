import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { api, createPage, parsed, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { settleAdminColorScheme, unique } from "./support/helpers.ts";
import { uploadEmvbPixel } from "./support/media.ts";

/**
 * W-963 acceptance: Export pages on the Pages list downloads a zip of a published page that
 * opens on its own, with the tabs script it needs, and a report.
 */

setUpEmvbOnce();

/** The files of a stored (uncompressed) zip, as the export writes it. */
function unzip(bytes: Buffer): Map<string, Buffer> {
  const end = bytes.length - 22;
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i += 1) {
    const size = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const local = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const start = local + 30 + bytes.readUInt16LE(local + 26);
    out.set(name, bytes.subarray(start, start + size));
    at += 46 + nameLength;
  }
  return out;
}

test("W-963: a published page exports as HTML that works on its own", async ({ page, request }) => {
  const title = `Export ${unique()}`;
  const slug = title.toLowerCase().replaceAll(" ", "-");
  // The page's own image, from the media library: the export must copy it.
  const pixel = await uploadEmvbPixel(request);
  const pixelFile = `media/${pixel.url.split("/").pop() ?? ""}`;
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: title, level: 1 } },
          { id: "imag0001", type: "image", props: { src: pixel.url, alt: "Pixel" } },
          {
            id: "tabs0001",
            type: "tabs",
            props: {},
            children: [
              {
                id: "tabp0001",
                type: "tab-panel",
                props: { label: "First" },
                children: [{ id: "text0001", type: "text", props: { text: "First panel" } }],
              },
              {
                id: "tabp0002",
                type: "tab-panel",
                props: { label: "Second" },
                children: [{ id: "text0002", type: "text", props: { text: "Second panel" } }],
              },
            ],
          },
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);

  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Export pages", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="export-pages"]');
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Pages" }).click();
  await page.getByRole("option", { name: title, exact: true }).click();

  for (const colorScheme of ["light", "dark"] as const) {
    await settleAdminColorScheme(page, colorScheme);
    const axe = await new AxeBuilder({ page })
      .include('[data-emvb-dialog="export-pages"]')
      .analyze();
    expect(
      axe.violations
        .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
        .map((v) => v.id),
    ).toEqual([]);
    await dialog.screenshot({ path: test.info().outputPath(`export-dialog-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: null });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^emvb-export-${slug}-\\d{4}-\\d{2}-\\d{2}\\.zip$`),
  );
  await expect(dialog.locator("[data-emvb-export-status]")).toContainText("Downloaded 1 page.");

  const files = unzip(readFileSync(await download.path()));
  // Every file the page needs, its own image included, is in the zip.
  const expected = [
    `${slug}/index.html`,
    `${slug}/style.css`,
    "assets/emvb-tabs.js",
    "assets/export-index.css",
    "index.html",
    "EXPORT-REPORT.md",
    pixelFile,
  ];
  for (const name of expected) expect([...files.keys()]).toContain(name);
  // Anything else is a media copy one of the exported pages or sheets uses, such as the image of
  // a site-wide header another test published (the export holds what the page shows).
  const texts = [...files]
    .filter(([name]) => name.endsWith(".html") || name.endsWith(".css"))
    .map(([, data]) => data.toString("utf8"))
    .join("\n");
  for (const name of [...files.keys()].filter((n) => !expected.includes(n))) {
    expect(name).toMatch(/^media\//);
    expect(texts).toContain(`../${name}`);
  }
  const html = files.get(`${slug}/index.html`)?.toString("utf8") ?? "";
  expect(html).toContain(`<title>${title}</title>`);
  expect(html).not.toContain("/_emdash/admin");

  // The exported folder opens straight from disk, styled, with working tabs.
  const root = test.info().outputPath("export");
  for (const [name, data] of files) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }
  await page.goto(`file://${join(root, slug, "index.html")}`);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText("First panel")).toBeVisible();
  await page.getByRole("tab", { name: "First" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Second" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Second panel")).toBeVisible();
});

test("W-963: published pages copy into a collection as rich-text drafts", async ({
  page,
  request,
}) => {
  const title = `Rich copy ${unique()}`;
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: title, level: 1 } },
          { id: "text0001", type: "text", props: { text: "Words to keep" } },
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Export pages", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="export-pages"]');
  await dialog.getByText("Rich text in a collection", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Collection" }).click();
  await page.getByRole("option", { name: "Pages", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Pages" }).click();
  await page.getByRole("option", { name: title, exact: true }).click();
  for (const colorScheme of ["light", "dark"] as const) {
    await settleAdminColorScheme(page, colorScheme);
    const axe = await new AxeBuilder({ page })
      .include('[data-emvb-dialog="export-pages"]')
      .analyze();
    expect(
      axe.violations
        .filter((v) => ["serious", "critical"].includes(v.impact ?? ""))
        .map((v) => v.id),
    ).toEqual([]);
    await dialog.screenshot({ path: test.info().outputPath(`copy-dialog-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: null });
  await dialog.getByRole("button", { name: "Copy pages", exact: true }).click();
  await expect(dialog.locator("[data-emvb-export-status]")).toHaveText("Created 1 draft in Pages.");

  const list = await api(
    request,
    "GET",
    `/_emdash/api/content/pages?limit=50&orderBy=updatedAt&order=desc`,
  );
  const items = (
    (list.json ?? {})["data"] as {
      items: { id: string; slug: string; status: string; data: Record<string, unknown> }[];
    }
  ).items;
  const copy = items.find((item) => item.slug === slug);
  expect(copy?.status).toBe("draft");
  expect(copy?.data["title"]).toBe(title);
  expect(JSON.stringify(parsed(copy?.data["content"]))).toContain("Words to keep");
  if (copy) await api(request, "DELETE", `/_emdash/api/content/pages/${copy.id}`);
});

/** An Icon box, which rich text can't hold (W-1091). */
const iconBox = (id: string) => ({
  id,
  type: "icon-box",
  props: { iconId: "star", title: "Fast", text: "Quick to load" },
});

test("W-1091 (#39): the rich-text summary names what it left out, with proper plurals", async ({
  page,
  request,
}) => {
  const title = `Left out ${unique()}`;
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text: title, level: 1 } },
          iconBox("ibox0001"),
          iconBox("ibox0002"),
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Export pages", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="export-pages"]');
  await dialog.getByText("Rich text in a collection", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Collection" }).click();
  await page.getByRole("option", { name: "Pages", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Pages" }).click();
  await page.getByRole("option", { name: title, exact: true }).click();
  await dialog.getByRole("button", { name: "Copy pages", exact: true }).click();
  await expect(dialog.locator("[data-emvb-export-status]")).toHaveText(
    "Created 1 draft in Pages. Left out, as rich text can't hold them: 2 icon boxes.",
  );
  const list = await api(request, "GET", `/_emdash/api/content/pages?limit=50`);
  const items = ((list.json ?? {})["data"] as { items: { id: string; slug: string }[] }).items;
  const copy = items.find((item) => item.slug === slug);
  if (copy) await api(request, "DELETE", `/_emdash/api/content/pages/${copy.id}`);
});

test("W-1091 (#26): a translated page copies as one rich-text entry per language", async ({
  page,
  request,
}) => {
  const word = `care${unique().replace(/\W/g, "")}`;
  const slug = `plans-${word}`;
  const layoutSaying = (text: string) => ({
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "text0001", type: "text", props: { text: `${text} ${word}` } }],
    },
  });
  const make = async (title: string, locale: string, translationOf?: string) => {
    const created = await api(request, "POST", "/_emdash/api/content/emvb_pages", {
      data: { title, layout: layoutSaying(title) },
      slug,
      locale,
      ...(translationOf ? { translationOf } : {}),
    });
    expect(created.status, JSON.stringify(created.json)).toBe(201);
    const id = (created.json?.["data"] as { item?: { id?: string } } | undefined)?.item?.id;
    if (!id) throw new Error("no id");
    await publishPage(request, id);
    return id;
  };
  const en = await make(`Care plans ${word}`, "en");
  await make(`Forfaits ${word}`, "fr", en);

  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("searchbox", { name: "Search pages" }).fill(word);
  await expect(page.locator("[data-emvb-row]")).toHaveCount(2);
  await page.getByRole("checkbox", { name: `Select all pages shown` }).click();
  await page.locator("[data-emvb-bulk-bar]").getByRole("button", { name: "Export" }).click();
  const dialog = page.locator('[data-emvb-dialog="export-pages"]');
  await dialog.getByText("Rich text in a collection", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Collection" }).click();
  await page.getByRole("option", { name: "Pages", exact: true }).click();
  await dialog.getByRole("button", { name: "Copy pages", exact: true }).click();
  await expect(dialog.locator("[data-emvb-export-status]")).toHaveText(
    "Created 2 drafts in Pages.",
  );

  type Entry = {
    id: string;
    slug: string;
    locale: string;
    translationGroup: string;
    data: Record<string, unknown>;
  };
  const copies: Entry[] = [];
  for (const locale of ["en", "fr"]) {
    // oxlint-disable-next-line no-await-in-loop -- one language at a time
    const list = await api(request, "GET", `/_emdash/api/content/pages?limit=50&locale=${locale}`);
    const items = ((list.json ?? {})["data"] as { items: Entry[] }).items;
    copies.push(...items.filter((item) => item.slug === slug));
  }
  expect(
    copies.map((c) => [c.locale, JSON.stringify(parsed(c.data["content"])).includes("Forfaits")]),
  ).toEqual([
    ["en", false],
    ["fr", true],
  ]);
  // The French entry is a translation of the English one.
  expect(copies[1]?.translationGroup).toBe(copies[0]?.translationGroup);
  for (const copy of copies.toReversed())
    // oxlint-disable-next-line no-await-in-loop -- translations before their source
    await api(request, "DELETE", `/_emdash/api/content/pages/${copy.id}`);
});

test("W-977: an entry of your own collection exports as HTML, from its Canvas card and Export pages", async ({
  page,
  request,
}) => {
  // The demos' `pages` collection carries an emvb:canvas field (W-902).
  const title = `Entry export ${unique()}`;
  const slug = title.toLowerCase().replaceAll(" ", "-");
  const canvasLayout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [{ id: "head0001", type: "heading", props: { text: title, level: 1 } }],
    },
  };
  const created = await api(request, "POST", "/_emdash/api/content/pages", {
    data: { title, canvas: canvasLayout },
    slug,
  });
  expect(created.status).toBe(201);
  const id = ((created.json ?? {})["data"] as { item: { id: string } }).item.id;
  const read = await api(request, "GET", `/_emdash/api/content/pages/${id}`);
  const rev = ((read.json ?? {})["data"] as Record<string, string>)["_rev"];
  const published = await api(request, "POST", `/_emdash/api/content/pages/${id}/publish`, {
    _rev: rev,
  });
  expect(published.status).toBe(200);

  // From the entry's Canvas card.
  await page.goto(`/_emdash/admin/content/pages/${id}`);
  const widget = page.locator('[data-emvb-widget="canvas"]');
  const [fromCard] = await Promise.all([
    page.waitForEvent("download"),
    widget.getByRole("button", { name: "Export HTML" }).click(),
  ]);
  await expect(widget.locator('[data-emvb-export-entry-status="done"]')).toBeVisible();
  const cardFiles = unzip(readFileSync(await fromCard.path()));
  expect(cardFiles.get(`${slug}/index.html`)?.toString("utf8")).toContain(title);

  // From Export pages, choosing the collection and the entry.
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "Export pages", exact: true }).click();
  const dialog = page.locator('[data-emvb-dialog="export-pages"]');
  await dialog.getByRole("combobox", { name: "Export from" }).click();
  await page.getByRole("option", { name: "EmVB pages" }).waitFor();
  const optionNames = await page.getByRole("option").allTextContents();
  const collection = optionNames.find((name) => name !== "EmVB pages");
  if (!collection) throw new Error("no canvas collection offered");
  await page.getByRole("option", { name: collection, exact: true }).click();
  await expect(dialog.locator("[data-emvb-export-entries-note]")).toBeVisible();
  await expect(dialog.getByText("Rich text in a collection")).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "Entries" }).click();
  await page.getByRole("option", { name: title, exact: true }).click();
  const [fromDialog] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  await expect(dialog.locator("[data-emvb-export-status]")).toContainText("Downloaded 1 entry.");
  const files = unzip(readFileSync(await fromDialog.path()));
  expect(files.get(`${slug}/index.html`)?.toString("utf8")).toContain(title);
  expect(files.get("EXPORT-REPORT.md")?.toString("utf8")).toContain(title);
});
