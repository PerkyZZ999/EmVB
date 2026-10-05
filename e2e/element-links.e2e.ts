import { expect, test } from "@playwright/test";
import { createPage, publishPage, setUpEmvbOnce, storedLayout } from "./support/api.ts";
import { canvas, openEditor, openLayers, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("a Heading and an Icon take a link from their Content tab (W-141)", async ({
  page,
  request,
}) => {
  const text = `Linked heading ${unique()}`;
  const slug = `element-links-${unique()}`;
  const id = await createPage(
    request,
    text,
    {
      schemaVersion: 11,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [
          { id: "head0001", type: "heading", props: { text, level: 2 } },
          {
            id: "icon0001",
            type: "icon",
            props: { iconId: "star", title: "Favourites", size: 24 },
          },
        ],
      },
    },
    slug,
  );
  await openEditor(page, id, text);
  await openLayers(page);
  const select = (nodeId: string) =>
    overlay(page).locator(`[data-emvb-layer="${nodeId}"] .emvb-layer-select`).click();

  await select("head0001");
  const link = overlay(page).getByLabel("Link", { exact: true });
  await link.fill("/pricing");
  await link.blur();
  await overlay(page).getByRole("switch", { name: "Open in a new tab" }).click();
  const shownLink = canvas(page).locator('[data-emvb-id="head0001"] > a.emvb-heading-link');
  await expect(shownLink).toHaveAttribute("href", "/pricing");
  await expect(shownLink).toHaveAttribute("target", "_blank");
  // Clicking the linked heading on the canvas selects it; the editor stays put.
  await shownLink.click();
  await expect(overlay(page).locator(".emvb-topbar-title")).toBeVisible();
  await expect(overlay(page).getByLabel("Link", { exact: true })).toHaveValue("/pricing");

  await select("icon0001");
  const iconLink = overlay(page).getByLabel("Link", { exact: true });
  await iconLink.fill("/favourites");
  await iconLink.blur();
  await expect(
    canvas(page).locator('[data-emvb-id="icon0001"] > a.emvb-icon-link'),
  ).toHaveAttribute("aria-label", "Favourites");

  await saveDraft(page);
  type Stored = { root: { children: { props: Record<string, unknown> }[] } };
  const stored = await storedLayout<Stored>(request, id);
  expect(stored.root.children[0]?.props).toEqual({
    text,
    level: 2,
    href: "/pricing",
    newTab: true,
  });
  expect(stored.root.children[1]?.props).toMatchObject({ href: "/favourites" });

  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const published = page.getByRole("heading", { name: text }).getByRole("link", { name: text });
  await expect(published).toHaveAttribute("href", "/pricing");
  await expect(published).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByRole("link", { name: "Favourites" })).toHaveAttribute(
    "href",
    "/favourites",
  );
});

test("a Button looks like a button before it is styled, with or without a URL (W-148)", async ({
  page,
  request,
}) => {
  const slug = `button-look-${unique()}`;
  const id = await createPage(
    request,
    "Button look",
    {
      schemaVersion: 11,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        style: { color: "#112233" },
        children: [
          { id: "butt0001", type: "button", props: { text: "Linked", href: "/pricing" } },
          { id: "butt0002", type: "button", props: { text: "Plain" } },
          {
            id: "butt0003",
            type: "button",
            props: { text: "Styled", href: "/x" },
            style: { borderRadius: { value: 0, unit: "px" } },
          },
        ],
      },
    },
    slug,
  );
  await publishPage(request, id);
  await page.goto(`/${slug}`);
  const look = (name: string) =>
    page.getByText(name, { exact: true }).evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        decoration: cs.textDecorationLine,
        color: cs.color,
        radius: cs.borderTopLeftRadius,
        padding: Number.parseFloat(cs.paddingTop),
        background: cs.backgroundColor,
      };
    });
  for (const [name, tag] of [
    ["Linked", "A"],
    ["Plain", "BUTTON"],
  ] as const) {
    expect(await look(name)).toEqual({
      tag,
      decoration: "none",
      color: "rgb(17, 34, 51)",
      radius: "6px",
      padding: expect.any(Number),
      background: "rgba(0, 0, 0, 0)",
    });
    expect((await look(name)).padding).toBeGreaterThan(0);
  }
  // A local style still wins over the base look.
  expect((await look("Styled")).radius).toBe("0px");
});
