import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { getPage, parsed, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, saveStatus, unique } from "./support/helpers.ts";
import { useAgentClient } from "./support/mcp.ts";

/**
 * W-1064 acceptance: an agent reads get_page_brief over EmDash's MCP endpoint, drafts a whole
 * page as ONE proposal, and a person reviews it in the Agent tab as one card: each section named
 * by its heading, previewed on the canvas, then accepted all at once and saved.
 */

test.describe.configure({ mode: "serial" });
setUpEmvbOnce();
const { call, ok } = useAgentClient();

type Brief = {
  brief: { purpose: string };
  page: {
    pageId: string;
    rootId: string;
    baseRevision: string;
    baseDesignRevision: string | null;
    outline: { children?: { id: string }[] };
  };
  elements: { type: string }[];
  steps: string[];
};

const section = (n: number, heading: string, level: number) => ({
  id: `sect${n}0001`,
  type: "layout-section",
  props: {},
  children: [
    { id: `head${n}0001`, type: "heading", props: { text: heading, level } },
    { id: `text${n}0001`, type: "text", props: { text: `${heading}: details for families.` } },
    { id: `butn${n}0001`, type: "button", props: { text: `Go to ${heading}`, href: "/contact" } },
  ],
});

test("an agent drafts a whole page as one proposal; a person previews and accepts it as one unit", async ({
  page,
  request,
}) => {
  const title = `Brunch ${unique()}`;
  const created = ok<{ pageId: string }>(await call("create_page", { title }));
  const brief = ok<Brief>(
    await call("get_page_brief", {
      purpose: "Weekend brunch at our bakery",
      audience: "Families nearby",
      sections: ["Hero", "Menu", "Visit us"],
      pageId: created.pageId,
    }),
  );
  expect(brief.brief.purpose).toBe("Weekend brunch at our bakery");
  expect(brief.elements.map((e) => e.type)).toContain("layout-section");
  expect(brief.steps.join(" ")).toContain("ONE propose_changes call");

  await openEditor(page, created.pageId, title);
  const before = await getPage(request, created.pageId);
  const ops = [
    ...(brief.page.outline.children ?? []).map((c) => ({ kind: "delete", id: c.id })),
    {
      kind: "insert",
      parentId: brief.page.rootId,
      index: 0,
      node: section(1, "Weekend brunch", 1),
    },
    { kind: "insert", parentId: brief.page.rootId, index: 1, node: section(2, "The menu", 2) },
    { kind: "insert", parentId: brief.page.rootId, index: 2, node: section(3, "Visit us", 2) },
  ];
  ok(
    await call("propose_changes", {
      pageId: created.pageId,
      baseRevision: brief.page.baseRevision,
      baseDesignRevision: brief.page.baseDesignRevision,
      ops,
    }),
  );
  // Nothing is written until the person accepts.
  expect((await getPage(request, created.pageId)).rev).toBe(before.rev);

  const ui = overlay(page);
  const tab = ui.getByRole("tab", { name: "Agent (1)" });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  const cards = ui.locator("[data-emvb-proposal]");
  await expect(cards).toHaveCount(1);
  const added = cards.locator('[data-emvb-proposal-group="added"]');
  for (const heading of ["Weekend brunch", "The menu", "Visit us"])
    await expect(added).toContainText(`Add Section “${heading}” to Container (4 elements)`);
  await expect(cards.locator('[data-emvb-proposal-group="removed"]')).toContainText(title);
  const axe = await new AxeBuilder({ page }).include("[data-emvb-codesign]").analyze();
  expect(
    axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => v.id),
  ).toEqual([]);

  const frame = canvas(page);
  await cards.getByRole("button", { name: "Preview" }).click();
  await expect(frame.getByRole("heading", { name: "The menu" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("whole-page-preview.png") });
  await ui.getByRole("button", { name: "Stop preview" }).click();
  await expect(frame.getByRole("heading", { name: "The menu" })).toHaveCount(0);

  await cards.getByRole("button", { name: `Accept all (${ops.length})` }).click();
  await expect(frame.getByRole("heading", { name: "Weekend brunch", level: 1 })).toBeVisible();
  await expect(frame.getByRole("heading", { name: title })).toHaveCount(0);
  await expect(ui.locator("[data-emvb-codesign-empty]")).toBeVisible({ timeout: 15_000 });

  await ui.getByRole("button", { name: "Save draft (unsaved changes)" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const stored = parsed((await getPage(request, created.pageId)).data["layout"]) as {
    root: { children: { id: string }[] };
  };
  expect(stored.root.children.map((c) => c.id)).toEqual(["sect10001", "sect20001", "sect30001"]);
});
