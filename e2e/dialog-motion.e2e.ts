import { expect, test, type Locator, type Page } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { openEditor, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

async function motion(popup: Locator) {
  return popup.evaluate((element) => {
    const portal = element.closest("[data-base-ui-portal]");
    const backdrop = [...(portal?.children ?? [])].find(
      (child) => child !== element && child.classList.contains("bg-kumo-recessed"),
    );
    return {
      portaled: portal !== null && !portal.closest("[data-emvb-editor], [data-emvb-page]"),
      popup: getComputedStyle(element).transitionDuration,
      backdrop: backdrop ? getComputedStyle(backdrop).transitionDuration : "missing backdrop",
    };
  });
}

async function hostProbe(page: Page) {
  await page.evaluate(() => {
    if (document.querySelector('[data-motion-probe="unowned"]')) return;
    const portal = document.createElement("div");
    portal.setAttribute("data-base-ui-portal", "");
    const probe = document.createElement("span");
    probe.setAttribute("data-motion-probe", "unowned");
    probe.style.transition = "opacity 0.2s";
    portal.append(probe);
    document.body.append(portal);
  });
  await expect(page.locator('[data-motion-probe="unowned"]')).toHaveCSS(
    "transition-duration",
    "0.2s",
  );
}

for (const preference of ["no-preference", "reduce"] as const) {
  test(`W-729: owned creation dialogs honor ${preference} motion without affecting host portals`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: preference });
    await page.route("**/_emdash/api/content/*?*", (route) =>
      route.fulfill({ json: { data: { items: [] } } }),
    );
    await page.goto("/_emdash/admin/plugins/emvb/pages");
    await hostProbe(page);
    const open = page.getByRole("button", { name: "New page", exact: true });
    for (let round = 0; round < 2; round++) {
      await open.click();
      const popup = page.getByRole("dialog", { name: "New page", exact: true });
      const title = popup.getByRole("textbox", { name: "Title", exact: true });
      await expect(title).toBeFocused();
      expect(await motion(popup)).toEqual({
        portaled: true,
        popup: preference === "reduce" ? "0s" : "0.15s",
        backdrop: preference === "reduce" ? "0s" : "0.15s",
      });
      await hostProbe(page);
      await page.screenshot({
        animations: "disabled",
        path: `/tmp/emvb-dialog-motion-${test.info().project.name}-${preference}-${round}.png`,
      });
      if (round === 1 && preference === "no-preference") {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect
          .poll(() => motion(popup))
          .toEqual({ portaled: true, popup: "0s", backdrop: "0s" });
        await expect(title).toBeFocused();
        await hostProbe(page);
      }
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await expect(open).toBeFocused();
    }
  });
}

test("W-729: Keyboard shortcuts marks its portal for reduced motion and retains focus recovery", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const id = await createPage(
    request,
    "Dialog motion",
    { schemaVersion: 16, root: { id: "root0001", type: "container", props: {}, children: [] } },
    `dialog-motion-${unique()}`,
  );
  await openEditor(page, id);
  await hostProbe(page);
  const open = overlay(page).getByRole("button", { name: "Keyboard shortcuts", exact: true });
  await open.click();
  const popup = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
  await expect(popup).toBeVisible();
  expect(await motion(popup)).toEqual({ portaled: true, popup: "0s", backdrop: "0s" });
  await hostProbe(page);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(open).toBeFocused();
});

for (const preference of ["no-preference", "reduce"] as const) {
  test(`W-730: utility dialogs honor ${preference} motion and recover keyboard focus`, async ({
    page,
    request,
  }) => {
    await page.emulateMedia({ reducedMotion: preference });
    const id = await createPage(
      request,
      "Utility dialog motion",
      {
        schemaVersion: 16,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [
            { id: "head0001", type: "heading", props: { text: "Dialog canvas", level: 1 } },
          ],
        },
      },
      `utility-dialog-${unique()}`,
    );
    await openEditor(page, id, "Dialog canvas");
    await hostProbe(page);
    const frame = page.locator("iframe[data-emvb-canvas]");
    const geometry = await frame.evaluate((element) => element.getBoundingClientRect().toJSON());
    for (const [action, name] of [
      ["palette", /^Command palette$/],
      ["Share as a playground link", /^Share as a playground link$/],
      ["Version timeline", /^Version timeline$/],
      ["Page weight", /^Page weight$/],
      ["accessibility", /^Accessibility ·/],
    ] as const) {
      const opener = overlay(page).getByRole("button", {
        name:
          action === "palette"
            ? "Keyboard shortcuts"
            : action === "accessibility"
              ? /^Accessibility score/
              : action,
        exact: true,
      });
      if (action === "palette") {
        await opener.focus();
        await page.keyboard.press("Control+k");
      } else await opener.click();
      const popup = page.getByRole("dialog", { name });
      await expect(popup).toBeVisible();
      expect(await motion(popup), action).toEqual({
        portaled: true,
        popup: preference === "reduce" ? "0s" : "0.15s",
        backdrop: preference === "reduce" ? "0s" : "0.15s",
      });
      if (preference === "no-preference") {
        const focused = await popup.evaluate((element) => element.contains(document.activeElement));
        expect(focused, action).toBe(true);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect
          .poll(() => motion(popup), { message: action })
          .toEqual({ portaled: true, popup: "0s", backdrop: "0s" });
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await expect
          .poll(() => motion(popup), { message: action })
          .toEqual({ portaled: true, popup: "0.15s", backdrop: "0.15s" });
      }
      await hostProbe(page);
      await page.screenshot({
        animations: "disabled",
        path: `/tmp/emvb-utility-dialog-${test.info().project.name}-${action.replaceAll(" ", "-")}-${preference}.png`,
      });
      await page.keyboard.press("Escape");
      await expect(popup).toHaveCount(0);
      await expect(opener).toBeFocused();
      expect(await frame.evaluate((element) => element.getBoundingClientRect().toJSON())).toEqual(
        geometry,
      );
    }
  });
}
