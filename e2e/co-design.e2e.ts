import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createPage, getPage, parsed, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, saveStatus, unique } from "./support/helpers.ts";
import { useAgentClient, type Outline } from "./support/mcp.ts";

/**
 * W-930 acceptance: an agent proposes over MCP while the page is open; the person reviews it in
 * the Agent tab (ghost preview, accept one, reject one, undo), and Save draft labels the version.
 */

const layout = {
  schemaVersion: 18,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    children: [
      { id: "head0001", type: "heading", props: { text: "Co-design start", level: 1 } },
      { id: "text0001", type: "text", props: { text: "Keep this text" } },
    ],
  },
};

test.describe.configure({ mode: "serial" });
setUpEmvbOnce();
const { call, ok } = useAgentClient();

test("a person reviews an agent proposal change by change in the editor", async ({
  page,
  request,
}) => {
  const pageId = await createPage(request, "Co-design", layout, `codesign-${unique()}`);
  await openEditor(page, pageId, "Co-design start");
  const outline = ok<Outline>(await call("list_page_outline", { pageId }));
  ok(
    await call("propose_changes", {
      pageId,
      baseRevision: outline.baseRevision,
      baseDesignRevision: outline.baseDesignRevision,
      ops: [
        { kind: "update", id: "head0001", set: { props: { text: "Agent headline" } } },
        {
          kind: "insert",
          parentId: "root0001",
          index: 2,
          node: { id: "text0009", type: "text", props: { text: "Agent paragraph" } },
        },
        { kind: "delete", id: "text0001" },
      ],
    }),
  );

  const ui = overlay(page);
  const tab = ui.getByRole("tab", { name: "Agent (1)" });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  const card = ui.locator("[data-emvb-proposal]");
  await expect(card.locator('[data-emvb-proposal-group="changed"]')).toContainText(
    "Agent headline",
  );
  await expect(card.locator('[data-emvb-proposal-group="added"]')).toContainText("Agent paragraph");
  await expect(card.locator('[data-emvb-proposal-group="removed"]')).toContainText(
    "Keep this text",
  );
  const axe = await new AxeBuilder({ page }).include("[data-emvb-codesign]").analyze();
  expect(
    axe.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => v.id),
  ).toEqual([]);

  // D-067: the panel in light and dark, kept with the run's results for review.
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await ui
      .locator("[data-emvb-codesign]")
      .screenshot({ path: test.info().outputPath(`agent-panel-${colorScheme}.png`) });
  }
  await page.emulateMedia({ colorScheme: "light" });

  // Ghost preview: shown on the canvas, marked, and the page itself unchanged.
  await card.getByRole("button", { name: "Preview" }).click();
  await expect(ui.locator("[data-emvb-ghost-banner]")).toBeVisible();
  const frame = canvas(page);
  await expect(frame.getByText("Agent paragraph")).toBeVisible();
  await expect(frame.locator('[data-emvb-id="text0009"]')).toHaveCSS("outline-style", "solid");
  await page.screenshot({ path: test.info().outputPath("ghost-preview.png") });
  await expect(frame.locator('[data-emvb-id="text0001"]')).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  await expect(ui.getByRole("button", { name: "Save draft (unsaved changes)" })).toHaveCount(0);
  await ui.getByRole("button", { name: "Stop preview" }).click();
  await expect(frame.getByText("Agent paragraph")).toHaveCount(0);

  // Accept the headline and the paragraph, reject the removal.
  await card.getByRole("button", { name: /^Accept: Change Heading/ }).click();
  await expect(frame.getByRole("heading", { name: "Agent headline" })).toBeVisible();
  await card.getByRole("button", { name: /^Reject: Remove Text/ }).click();
  await card.getByRole("button", { name: /^Accept: Add Text/ }).click();
  await expect(frame.getByText("Agent paragraph")).toBeVisible();
  await expect(frame.getByText("Keep this text")).toBeVisible();
  await expect(ui.locator("[data-emvb-codesign-empty]")).toBeVisible({ timeout: 15_000 });

  // Undo covers an accepted change; redo brings it back.
  await ui.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame.getByText("Agent paragraph")).toHaveCount(0);
  await ui.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(frame.getByText("Agent paragraph")).toBeVisible();

  // Save draft is a normal version, labelled Via agent in the timeline.
  await ui.getByRole("button", { name: "Save draft (unsaved changes)" }).click();
  await expect(saveStatus(page)).toHaveText("Saved");
  const stored = parsed((await getPage(request, pageId)).data["layout"]) as {
    root: { children: { props: { text: string } }[] };
  };
  expect(stored.root.children.map((c) => c.props.text)).toEqual([
    "Agent headline",
    "Keep this text",
    "Agent paragraph",
  ]);
  await ui.locator("[data-emvb-timeline-open]").click();
  await expect(page.locator("[data-emvb-agent-version]").first()).toHaveText("Via agent", {
    timeout: 15_000,
  });
});
