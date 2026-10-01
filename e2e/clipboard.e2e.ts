import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  api,
  createPage,
  createThemePart,
  parsed,
  setUpEmvbOnce,
  storedLayout,
} from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

type Node = {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style?: unknown;
  states?: unknown;
  classes?: string[];
  children?: Node[];
};
type Stored = { schemaVersion: number; root: Node };

const STYLE = {
  color: "#aa2200",
  transition: { duration: 200, easing: "ease-out", property: "colors" },
};
const STATES = { hover: { color: "#0022aa" }, focus: { backgroundColor: "#eeeeee" } };

const pageWith = (children: Node[]): Stored => ({
  schemaVersion: 3,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children,
  },
});

const ids = (node: Node): string[] => [node.id, ...(node.children ?? []).flatMap(ids)];

async function storedPart(request: APIRequestContext, id: string) {
  const { status, json } = await api(request, "GET", `/_emdash/api/content/emvb_theme_parts/${id}`);
  expect(status).toBe(200);
  const data = json?.["data"] as { item?: { data: Record<string, unknown> } } | undefined;
  expect(data?.item).toBeTruthy();
  return parsed(data?.item?.data["layout"]) as Stored;
}

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("an element copied on one page pastes on another page and in a theme part", async ({
  page,
  request,
}) => {
  const source = await createPage(
    request,
    "Copy source",
    pageWith([
      {
        id: "head0001",
        type: "heading",
        props: { text: "Copied heading", level: 2 },
        style: STYLE,
        states: STATES,
      },
    ]),
    `copy-source-${unique()}`,
  );
  const target = await createPage(
    request,
    "Paste target",
    pageWith([{ id: "head0001", type: "heading", props: { text: "Target", level: 1 } }]),
    `paste-target-${unique()}`,
  );
  const part = await createThemePart(request, {
    title: `Paste part ${unique()}`,
    partType: "header",
  });

  await openEditor(page, source, "Copied heading");
  await canvas(page).getByRole("heading", { name: "Copied heading" }).click();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(overlay(page).locator(".emvb-sr-only[aria-live]")).toHaveText("Heading copied");
  expect(await page.evaluate(() => localStorage.getItem("emvb-clipboard"))).toContain(
    "Copied heading",
  );

  await openEditor(page, target, "Target");
  await canvas(page).getByRole("heading", { name: "Target" }).click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(canvas(page).getByRole("heading", { name: "Copied heading" })).toBeVisible();
  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, target);
  expect(stored.root.children?.map((n) => n.props["text"])).toEqual(["Target", "Copied heading"]);
  const pasted = stored.root.children?.[1];
  expect(pasted?.style).toEqual(STYLE);
  expect(pasted?.states).toEqual(STATES);
  expect(new Set(ids(stored.root)).size).toBe(ids(stored.root).length);

  await openEditor(page, part, undefined, "emvb_theme_parts");
  await openLayers(page);
  await overlay(page).locator(".emvb-layer-select").first().click();
  await page.keyboard.press("ControlOrMeta+v");
  await saveDraft(page);
  const inPart = await storedPart(request, part);
  expect(inPart.root.children?.at(-1)?.props["text"]).toBe("Copied heading");
});

test("Copy style and Paste style in the Layers menu carry state styles and the transition", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Style copy",
    pageWith([
      {
        id: "head0001",
        type: "heading",
        props: { text: "Styled", level: 2 },
        style: STYLE,
        states: STATES,
      },
      { id: "text0001", type: "text", props: { text: "Plain text" }, style: { color: "#000000" } },
    ]),
    `style-copy-${unique()}`,
  );
  await openEditor(page, id, "Styled");
  await openLayers(page);
  const menu = async (layer: string, item: string) => {
    await overlay(page).locator(`[data-emvb-layer="${layer}"] .emvb-layer-menu-btn`).click();
    await overlay(page).getByRole("menuitem", { name: item, exact: true }).click();
  };
  await menu("text0001", "Copy");
  await overlay(page).locator('[data-emvb-layer="text0001"] .emvb-layer-menu-btn').click();
  await expect(overlay(page).getByRole("menuitem", { name: "Paste", exact: true })).toBeEnabled();
  await overlay(page).locator('[data-emvb-layer="text0001"] .emvb-layer-menu-btn').click();
  await menu("head0001", "Copy style");
  await menu("text0001", "Paste style");
  await saveDraft(page);
  const stored = await storedLayout<Stored>(request, id);
  const text = stored.root.children?.find((n) => n.id === "text0001");
  expect(text).toEqual({
    id: "text0001",
    type: "text",
    props: { text: "Plain text" },
    style: STYLE,
    states: STATES,
  });
});

test("a paste the drop rules refuse shows the reason on the canvas and changes nothing", async ({
  page,
  request,
}) => {
  const id = await createPage(
    request,
    "Refused paste",
    pageWith([{ id: "head0001", type: "heading", props: { text: "Here", level: 2 } }]),
    `refused-paste-${unique()}`,
  );
  await openEditor(page, id, "Here");
  await page.evaluate(() =>
    localStorage.setItem(
      "emvb-clipboard",
      JSON.stringify({
        format: "emvb-clipboard",
        version: 1,
        schemaVersion: 3,
        kind: "element",
        node: { id: "inpt0001", type: "text-input", props: { field: "email" } },
      }),
    ),
  );
  await canvas(page).getByRole("heading", { name: "Here" }).click();
  await page.keyboard.press("ControlOrMeta+v");
  await expect(overlay(page).locator("[data-emvb-invalid-label]")).toContainText(
    "Form fields must be placed inside a form.",
  );
  await expect(overlay(page).locator("[data-emvb-invalid-outline]")).toBeVisible();
  await expect(overlay(page).locator("[data-emvb-invalid-label]")).toHaveCount(0, {
    timeout: 8000,
  });
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children?.map((n) => n.id)).toEqual(["head0001"]);
});
