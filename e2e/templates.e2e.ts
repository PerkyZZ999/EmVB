import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, overlay, saveDraft, unique } from "./support/helpers.ts";

setUpEmvbOnce();

type Node = { id: string; type: string; props?: Record<string, unknown>; children?: Node[] };
const all = (node: Node): Node[] => [node, ...(node.children ?? []).flatMap(all)];

/** Contrast of an element's text against the first mostly opaque background behind it. */
function contrastBehind(el: Element): number {
  // Helpers stay inside: Playwright sends this function to the page on its own.
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const rgba = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const luminance = ([r = 0, g = 0, b = 0]: number[]) => {
    const [lr, lg, lb] = [r, g, b].map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (lr ?? 0) + 0.7152 * (lg ?? 0) + 0.0722 * (lb ?? 0);
  };
  const text = rgba(getComputedStyle(el).color);
  let back = [255, 255, 255];
  for (let at: Element | null = el; at; at = at.parentElement) {
    const bg = rgba(getComputedStyle(at).backgroundColor);
    if (bg.length >= 3 && (bg[3] ?? 1) >= 0.5) {
      back = bg;
      break;
    }
  }
  const [a, b] = [luminance(text), luminance(back)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("W-1068 starter templates: browse with the keyboard, insert twice with new ids, one H1, light and dark", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const u = unique();
  const title = `Templates ${u}`;
  const slug = `templates-${u}`;
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text: title, level: 1 } }],
      },
    },
    slug,
  );
  await openEditor(page, id, title);
  await overlay(page).getByRole("tab", { name: "Add", exact: true }).click();
  const switcher = overlay(page).getByRole("tablist", { name: "Add" });
  await switcher.getByRole("tab", { name: "Templates" }).click();
  const panel = overlay(page).locator('[data-emvb-panel="templates"]');
  await expect(panel).toBeVisible();
  // Pictures are drawn with the site's styles, out of the tab order and hidden from screen readers.
  await expect(
    panel.locator('.emvb-template-preview[aria-hidden="true"] iframe').first(),
  ).toBeAttached();

  // Keyboard: search, Tab to the tile and press Enter.
  const search = panel.getByLabel("Search templates");
  await search.fill("questions");
  const faq = panel.getByRole("button", { name: "FAQ", exact: true });
  await expect(panel.locator("[data-emvb-template]")).toHaveCount(1);
  await search.press("Tab");
  await expect(faq).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(canvas(page).getByRole("heading", { name: "Questions and answers" })).toBeVisible();

  // The same template again, and a hero: each insert has new ids; the hero's H1 becomes an H2.
  await search.fill("");
  await panel.getByRole("button", { name: "FAQ", exact: true }).click();
  await panel.getByRole("button", { name: "Hero", exact: true }).click();
  await expect(canvas(page).getByRole("heading", { name: "Questions and answers" })).toHaveCount(2);
  await expect(
    canvas(page).getByRole("heading", { level: 2, name: "Say what you do in one clear line" }),
  ).toBeVisible();
  await saveDraft(page);

  const stored = await storedLayout<{ root: Node }>(request, id);
  const nodes = all(stored.root);
  const ids = nodes.map((n) => n.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(nodes.filter((n) => n.type === "heading" && n.props?.["level"] === 1)).toHaveLength(1);
  expect(JSON.stringify(stored).includes("tpl-")).toBe(false);
  expect(nodes.filter((n) => n.type === "accordion")).toHaveLength(2);

  await publishPage(request, id);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const question = page.getByText("How do I get started?").first();
    await question.click();
    await expect(
      page.getByText("Explain the first step in a sentence or two.").first(),
    ).toBeVisible();
    // Text stays readable on whatever is behind it, in either scheme (WCAG AA, 4.5:1).
    for (const name of ["Questions and answers", "Say what you do in one clear line"]) {
      const heading = page.getByRole("heading", { name }).first();
      expect(await heading.evaluate(contrastBehind)).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("W-1068 New page can start from a starter page template", async ({ page }) => {
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  await page.getByRole("button", { name: "New page", exact: true }).click();
  await page.getByRole("combobox", { name: "Page template", exact: true }).click();
  await page.getByRole("option", { name: "Contact page (starter)", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(`Contact ${unique()}`);
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
  await expect(canvas(page).getByRole("heading", { level: 2, name: "Get in touch" })).toBeVisible();
  await expect(canvas(page).getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("W-1068 a dragged template drops in the site's styles, with its H1 made an H2", async ({
  page,
  request,
}) => {
  const u = unique();
  const title = `Drag templates ${u}`;
  const id = await createPage(
    request,
    title,
    {
      schemaVersion: 18,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text: title, level: 1 } }],
      },
    },
    `drag-templates-${u}`,
  );
  await openEditor(page, id, title);
  await overlay(page).getByRole("tab", { name: "Add", exact: true }).click();
  await overlay(page)
    .getByRole("tablist", { name: "Add" })
    .getByRole("tab", { name: "Templates" })
    .click();
  // Playwright's mouse drag from this panel stalled (2026-11-21, both demos), so the drag is played as
  // DOM drag events: the tile's own dragstart fills the transfer, the canvas gets the drop.
  const tile = overlay(page).locator('[data-emvb-template="hero"]');
  const type = await tile.evaluate((el) => {
    const transfer = new DataTransfer();
    el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
    return transfer.getData("application/x-emvb-new-element");
  });
  expect(type).toBe("template:hero");
  await canvas(page)
    .getByRole("heading", { name: title })
    .evaluate((el, dragged) => {
      const box = el.getBoundingClientRect();
      const transfer = new DataTransfer();
      transfer.setData("application/x-emvb-new-element", dragged);
      const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height * 0.8 };
      for (const name of ["dragenter", "dragover", "drop"]) {
        const init = { bubbles: true, cancelable: true, dataTransfer: transfer, ...at };
        el.dispatchEvent(new DragEvent(name, init));
      }
    }, type);
  await expect(
    canvas(page).getByRole("heading", { level: 2, name: "Say what you do in one clear line" }),
  ).toBeVisible();
  await saveDraft(page);
  const stored = await storedLayout<{ root: Node }>(request, id);
  const nodes = all(stored.root);
  expect(nodes.filter((n) => n.type === "heading" && n.props?.["level"] === 1)).toHaveLength(1);
  expect(nodes.filter((n) => n.type === "layout-section")).toHaveLength(1);
});
