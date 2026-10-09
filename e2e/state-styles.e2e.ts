import { expect, test, type Locator, type Page } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { loadDesign, loadDraft, setClass } from "./support/design.ts";
import {
  canvas,
  openEditor,
  overlay,
  publishSiteStyles,
  saveDraft,
  unique,
} from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

type Node = {
  id: string;
  style?: Record<string, unknown>;
  states?: Record<string, Record<string, unknown>>;
  children?: Node[];
};

const BLUE = "rgb(29, 78, 216)";
const NAVY = "rgb(30, 58, 138)";
const INK = "rgb(23, 37, 84)";
const AMBER = "rgb(245, 158, 11)";

const button = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "button",
  props: { text },
  ...extra,
});

const layoutWith = (children: unknown[]) => ({
  schemaVersion: 13,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children,
  },
});

const read = <K extends string>(target: Locator, keys: K[]) =>
  target.evaluate((el, names) => {
    const style = getComputedStyle(el);
    return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
  }, keys as string[]) as Promise<Record<K, string>>;

const one = (target: Locator, key: string) => read(target, [key]).then((style) => style[key]);

const showStyle = async (page: Page) => {
  const tab = overlay(page).getByRole("tab", { name: "Style" });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
};

async function openSection(page: Page, section: string) {
  const header = overlay(page).locator(`[data-emvb-section="${section}"]`);
  if ((await header.getAttribute("aria-expanded")) !== "true") await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
}

async function type(page: Page, label: string, value: string) {
  const field = overlay(page).getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}

const stateTab = (page: Page, name: string) =>
  overlay(page)
    .getByRole("tablist", { name: "Style state" })
    .getByRole("tab", { name, exact: true });

test("state switcher edits Hover on the element and on a class, previews each state on the canvas, and saves them", async ({
  page,
  request,
}) => {
  const classId = `st-${unique()}`;
  await setClass(request, classId, { name: `States ${classId}`, style: {} });
  try {
    const text = `States ${unique()}`;
    const slug = `states-${unique()}`;
    const id = await createPage(
      request,
      text,
      layoutWith([
        { id: "head0001", type: "heading", props: { text, level: 1 } },
        button("btn00001", "Local", { style: { opacity: 0.9 } }),
        button("btn00002", "Classed", { classes: [classId] }),
      ]),
      slug,
    );
    await openEditor(page, id, text);
    const local = canvas(page).locator('[data-emvb-id="btn00001"]');
    await local.click();
    await showStyle(page);
    await expect(stateTab(page, "Normal")).toHaveAttribute("aria-selected", "true");

    await stateTab(page, "Hover").click();
    await expect(overlay(page).getByText("Editing Hover for this element")).toBeVisible();
    await expect(local).toHaveAttribute("data-emvb-state", "hover");
    await openSection(page, "effects");
    const opacity = overlay(page).getByLabel("Opacity (%)", { exact: true });
    await expect(opacity).toHaveAttribute("placeholder", "90");
    await type(page, "Opacity (%)", "40");
    await expect.poll(() => one(local, "opacity")).toBe("0.4");
    await expect(stateTab(page, "Hover").locator(".emvb-state-dot")).toHaveCount(1);

    await stateTab(page, "Normal").click();
    await expect(local).not.toHaveAttribute("data-emvb-state", /./);
    await expect.poll(() => one(local, "opacity")).toBe("0.9");
    await expect(opacity).toHaveValue("90");

    await overlay(page).getByRole("button", { name: "Add transition", exact: true }).click();
    await expect.poll(() => one(local, "transition-duration")).toBe("0.2s");

    for (const [name, state] of [
      ["Focus", "focus"],
      ["Active", "active"],
    ] as const) {
      await stateTab(page, name).click();
      await expect(local).toHaveAttribute("data-emvb-state", state);
      await expect(overlay(page).getByText(`Editing ${name} for this element`)).toBeVisible();
      await expect(
        overlay(page).getByRole("button", { name: "Add transition", exact: true }),
      ).toHaveCount(0);
      await expect.poll(() => one(local, "opacity")).toBe("0.9");
    }

    const classed = canvas(page).locator('[data-emvb-id="btn00002"]');
    await classed.click();
    await showStyle(page);
    await expect(stateTab(page, "Normal")).toHaveAttribute("aria-selected", "true");
    await expect(local).not.toHaveAttribute("data-emvb-state", /./);
    const chip = overlay(page).locator(`[data-emvb-class-id="${classId}"] .emvb-chip-main`);
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await stateTab(page, "Hover").click();
    await expect(
      overlay(page).getByText(`Editing Hover for class "States ${classId}"`),
    ).toBeVisible();
    await expect(classed).toHaveAttribute("data-emvb-state", "hover");
    await openSection(page, "effects");
    await type(page, "Opacity (%)", "60");
    await expect.poll(() => one(classed, "opacity")).toBe("0.6");
    await expect
      .poll(async () => (await loadDraft(request)).design.classes?.find((c) => c.id === classId))
      .toMatchObject({ style: {}, states: { hover: { opacity: 0.6 } } });
    // Style edits stay in the draft until Publish styles (W-100).
    const unpublished = (await loadDesign(request)).design.classes?.find((c) => c.id === classId);
    expect(unpublished?.states).toBeUndefined();
    await expect(chip.locator("xpath=..").locator(".emvb-state-dot")).toHaveCount(1);

    await saveDraft(page);
    const stored = await storedLayout<{ root: Node }>(request, id);
    const [, first, second] = stored.root.children ?? [];
    expect(first?.states).toEqual({ hover: { opacity: 0.4 } });
    expect(first).toMatchObject({ style: { opacity: 0.9, transition: { duration: 200 } } });
    expect(second?.states).toBeUndefined();

    await publishSiteStyles(page);
    await expect
      .poll(async () => (await loadDesign(request)).design.classes?.find((c) => c.id === classId))
      .toMatchObject({ states: { hover: { opacity: 0.6 } } });
    await publishPage(request, id);
    await page.goto(`/${slug}`);
    const live = page.locator(".emvb-e-btn00001");
    const liveClassed = page.locator(`.emvb-k-${classId}`);
    expect(await one(live, "opacity")).toBe("0.9");
    expect(await one(liveClassed, "opacity")).toBe("1");
    await live.hover();
    await expect.poll(() => one(live, "opacity")).toBe("0.4");
    await liveClassed.hover();
    await expect.poll(() => one(liveClassed, "opacity")).toBe("0.6");
    await expect.poll(() => one(live, "opacity")).toBe("0.9");
  } finally {
    await setClass(request, classId, null);
  }
});

test("published page applies real :hover, :focus-visible and :active styles with a transition that reduced motion turns off", async ({
  page,
  request,
}) => {
  const classId = `st-${unique()}`;
  await setClass(request, classId, {
    name: `Pill ${classId}`,
    style: { opacity: 0.95 },
    states: { hover: { opacity: 0.5, color: "#f59e0b" } },
  });
  try {
    const slug = `states-live-${unique()}`;
    const id = await createPage(
      request,
      "States live",
      layoutWith([
        button("btn00001", "Go", {
          classes: [classId],
          style: {
            backgroundColor: "#1d4ed8",
            color: "#ffffff",
            borderWidth: { value: 2, unit: "px" },
            borderStyle: "solid",
            borderColor: "#1d4ed8",
            transition: { duration: 200, easing: "ease-out", property: "colors" },
          },
          states: {
            hover: { backgroundColor: "#1e3a8a", opacity: 0.8 },
            focus: { borderColor: "#f59e0b" },
            active: { backgroundColor: "#172554" },
          },
        }),
      ]),
      slug,
    );
    await publishPage(request, id);
    await page.goto(`/${slug}`);
    const live = page.locator(".emvb-e-btn00001");
    const keys = ["background-color", "border-top-color", "opacity", "color"];
    expect(await read(live, keys)).toEqual({
      "background-color": BLUE,
      "border-top-color": BLUE,
      opacity: "0.95",
      color: "rgb(255, 255, 255)",
    });
    expect(await read(live, ["transition-property", "transition-duration"])).toEqual({
      "transition-property": "color, background-color, border-color",
      "transition-duration": "0.2s, 0.2s, 0.2s",
    });

    // A state rule beats every Normal rule; within one state the local rule beats the class.
    await live.hover();
    await expect
      .poll(() => read(live, keys))
      .toEqual({
        "background-color": NAVY,
        "border-top-color": BLUE,
        opacity: "0.8",
        color: AMBER,
      });

    await page.mouse.down();
    await expect.poll(() => one(live, "background-color")).toBe(INK);
    expect(await live.evaluate((el) => el.matches(":focus-visible"))).toBe(false);
    expect(await one(live, "border-top-color")).toBe(BLUE);
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await expect.poll(() => one(live, "background-color")).toBe(BLUE);

    await page.locator("body").click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if (await live.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(live).toBeFocused();
    expect(await live.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    await expect.poll(() => one(live, "border-top-color")).toBe(AMBER);
    expect(await one(live, "background-color")).toBe(BLUE);

    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await read(live, ["transition-property", "transition-duration"])).toEqual({
      "transition-property": "none",
      "transition-duration": "0s",
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await one(live, "transition-duration")).toBe("0.2s, 0.2s, 0.2s");
  } finally {
    await setClass(request, classId, null);
  }
});
