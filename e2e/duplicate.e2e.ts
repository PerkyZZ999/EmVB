import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

setUpEmvbOnce();

type Stored = {
  root: { children: { id: string; htmlId?: string; props: Record<string, unknown> }[] };
};

const BLUE = "rgb(29, 78, 216)";

const layoutFor = (text: string) => ({
  schemaVersion: 9,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
    children: [
      { id: "head0001", type: "heading", props: { text, level: 1 } },
      {
        id: "butn0001",
        type: "button",
        props: { text: "Sign up", href: "/signup" },
        htmlId: "signup",
        style: { backgroundColor: "#1d4ed8", color: "#ffffff" },
        states: { hover: { backgroundColor: "#1e3a8a" } },
      },
    ],
  },
});

test("a duplicated Button with a CSS id saves, keeps its label and styling, and its edits reach the site (W-133)", async ({
  page,
  request,
  browser,
}) => {
  const text = `Duplicate ${unique()}`;
  const slug = `dup-${unique()}`;
  const id = await createPage(request, text, layoutFor(text), slug);
  await openEditor(page, id, text);
  await openLayers(page);
  await overlay(page).getByRole("button", { name: "Actions for Button" }).click();
  await overlay(page).getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(
    page.getByText("The CSS id stays on the original: CSS ids must be unique on the page.", {
      exact: true,
    }),
  ).toBeVisible();

  const buttons = canvas(page).locator(".emvb-button");
  await expect(buttons).toHaveText(["Sign up", "Sign up"]);
  await overlay(page).getByLabel("Text", { exact: true }).fill("Copy label");
  await expect(buttons).toHaveText(["Sign up", "Copy label"]);
  await saveDraft(page);

  const stored = await storedLayout<Stored>(request, id);
  const [, original, copy] = stored.root.children;
  expect(original?.htmlId).toBe("signup");
  expect(copy?.htmlId).toBeUndefined();
  expect(copy?.props).toEqual({ text: "Copy label", href: "/signup" });

  await publishPage(request, id);
  const visitor = await browser.newContext();
  try {
    const site = await visitor.newPage();
    await site.goto(`/${slug}`);
    const shown = site.locator(".emvb-button");
    await expect(shown).toHaveText(["Sign up", "Copy label"]);
    await expect(shown.nth(1)).toHaveCSS("background-color", BLUE);
    await expect(shown.nth(1)).toHaveAttribute("href", "/signup");
    await expect(site.locator("#signup")).toHaveCount(1);
  } finally {
    await visitor.close();
  }
});
