import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

test("W-734: bound color saves retain focus, stable feedback and retryable drafts", async ({
  page,
  request,
}) => {
  const text = `Bound color feedback ${unique()}`;
  const id = await createPage(
    request,
    text,
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
      },
    },
    `bound-color-feedback-${unique()}`,
  );
  const design = {
    schemaVersion: 15,
    variables: {
      colors: [
        { id: "brand", name: "Brand", value: "#0055ff" },
        { id: "ink", name: "Ink", value: "#111111" },
      ],
    },
  };
  await page.route("**/_emdash/api/plugins/emvb/design/draft*", (route) =>
    route.fulfill({
      json: {
        data: {
          design,
          published: design,
          revision: null,
          publishedRevision: null,
          unpublished: false,
        },
      },
    }),
  );
  const first = Promise.withResolvers<void>();
  const retry = Promise.withResolvers<void>();
  const values: string[] = [];
  await page.route("**/_emdash/api/plugins/emvb/design/save", async (route) => {
    const body = route.request().postDataJSON() as {
      design: { variables: { colors: { value: string }[] } };
    };
    values.push(body.design.variables.colors[0]?.value ?? "");
    if (values.length === 1) {
      await first.promise;
      await route.fulfill({
        status: 503,
        json: { error: { code: "BUSY", message: "Try saving again." } },
      });
    } else {
      await retry.promise;
      await route.fulfill({ json: { data: { revision: "w734-simulated-revision" } } });
    }
  });
  try {
    await openEditor(page, id, text);
    const heading = canvas(page).getByRole("heading", { name: text, exact: true });
    await heading.click();
    await overlay(page).getByRole("tab", { name: "Style", exact: true }).click();
    const typography = overlay(page).locator('[data-emvb-section="typography"]');
    if ((await typography.getAttribute("aria-expanded")) !== "true") await typography.click();
    const control = overlay(page).locator('[data-emvb-control="color"]').first();
    await control.getByRole("button", { name: "Brand (#0055ff)", exact: true }).click();
    await expect(heading).toHaveCSS("color", "rgb(0, 85, 255)");
    const value = control.getByRole("textbox", { name: "Brand value", exact: true });
    const status = control.getByRole("status", { name: "Color variable status", exact: true });
    const feedback = control.locator(".emvb-variable-value-feedback");
    const frame = overlay(page).locator("iframe[data-emvb-canvas]");
    const height = await feedback.evaluate((el) => el.getBoundingClientRect().height);
    const width = await value.evaluate((el) => el.getBoundingClientRect().width);
    const frameWidth = await frame.evaluate((el) => el.getBoundingClientRect().width);
    await value.fill("#abcdef");
    await value.press("Enter");
    await expect.poll(() => values.length).toBe(1);
    await expect(value).toHaveJSProperty("readOnly", true);
    await expect(value).toHaveAttribute("aria-busy", "true");
    await expect(value).toBeFocused();
    await expect(status).toHaveText("Saving color variable…");
    expect(await feedback.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
    expect(await value.evaluate((el) => el.getBoundingClientRect().width)).toBe(width);
    expect(await frame.evaluate((el) => el.getBoundingClientRect().width)).toBe(frameWidth);
    await value.press("Enter");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(status).toHaveText("Saving color variable…");
    await expect(value).toBeFocused();
    expect(values).toEqual(["#abcdef"]);
    expect(await feedback.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
    await page.screenshot({
      path: `/tmp/emvb-bound-color-${test.info().project.name}-pending.png`,
    });
    first.resolve();
    await expect(control.getByRole("alert")).toContainText("Try saving again.");
    await expect(value).toHaveValue("#abcdef");
    await expect(value).toHaveJSProperty("readOnly", false);
    await expect(value).toHaveAttribute("aria-busy", "false");
    await expect(value).toBeFocused();
    await value.fill("#123456");
    await value.press("Enter");
    await expect.poll(() => values.length).toBe(2);
    await expect(status).toHaveText("Saving color variable…");
    await expect(value).toHaveJSProperty("readOnly", true);
    retry.resolve();
    await expect(status).toHaveText("Color variable saved. Publish styles to make it live.");
    await expect(value).toHaveJSProperty("readOnly", false);
    await expect(value).toHaveAttribute("aria-busy", "false");
    await expect(value).toBeFocused();
    await expect(heading).toHaveCSS("color", "rgb(18, 52, 86)");
    expect(await feedback.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
    await value.press("Enter");
    await value.press("Tab");
    expect(values).toEqual(["#abcdef", "#123456"]);
  } finally {
    first.resolve();
    retry.resolve();
  }
});

test("W-728: color variable creation keeps stable feedback and retries without losing values", async ({
  page,
  request,
}) => {
  const text = `Color feedback ${unique()}`;
  const id = await createPage(
    request,
    text,
    {
      schemaVersion: 17,
      root: {
        id: "root0001",
        type: "container",
        props: {},
        children: [{ id: "head0001", type: "heading", props: { text, level: 1 } }],
      },
    },
    `color-feedback-${unique()}`,
  );
  const design = { schemaVersion: 15, variables: { colors: [] } };
  await page.route("**/_emdash/api/plugins/emvb/design/draft*", (route) =>
    route.fulfill({
      json: {
        data: {
          design,
          published: design,
          revision: null,
          publishedRevision: null,
          unpublished: false,
        },
      },
    }),
  );
  const release = Promise.withResolvers<void>();
  const values: string[] = [];
  await page.route("**/_emdash/api/plugins/emvb/design/save", async (route) => {
    const body = route.request().postDataJSON() as {
      design: { variables: { colors: { value: string }[] } };
    };
    values.push(body.design.variables.colors.at(-1)?.value ?? "");
    if (values.length === 1) {
      await release.promise;
      await route.fulfill({
        status: 503,
        json: { error: { code: "BUSY", message: "Try saving again." } },
      });
    } else await route.fulfill({ json: { data: { revision: "w728-simulated-revision" } } });
  });
  try {
    await openEditor(page, id, text);
    const heading = canvas(page).getByRole("heading", { name: text, exact: true });
    await heading.click();
    await overlay(page).getByRole("tab", { name: "Style", exact: true }).click();
    const typography = overlay(page).locator('[data-emvb-section="typography"]');
    if ((await typography.getAttribute("aria-expanded")) !== "true") await typography.click();
    const control = overlay(page).locator('[data-emvb-control="color"]').first();
    await control.getByRole("button", { name: "New variable", exact: true }).click();
    const form = control.locator('[data-emvb-form="new-variable"]');
    const name = form.getByRole("textbox", { name: "Variable name", exact: true });
    const value = form.getByRole("textbox", { name: "Value", exact: true });
    await name.fill("Accent");
    await value.fill("#abcdef");
    const create = form.getByRole("button", { name: /Create variable$/ });
    const cancel = form.getByRole("button", { name: "Cancel", exact: true });
    const status = form.getByRole("status", { name: "Color variable status", exact: true });
    const frame = overlay(page).locator("iframe[data-emvb-canvas]");
    const width = await create.evaluate((el) => el.getBoundingClientRect().width);
    const height = await form.evaluate((el) => el.getBoundingClientRect().height);
    const frameWidth = await frame.evaluate((el) => el.getBoundingClientRect().width);
    await create.click();
    await expect.poll(() => values.length).toBe(1);
    await expect(name).toBeDisabled();
    await expect(value).toBeDisabled();
    await expect(cancel).toBeDisabled();
    await expect(create).toBeDisabled();
    await expect(create).toHaveAttribute("aria-busy", "true");
    await expect(status).toHaveText("Creating color variable…");
    await expect(create.locator('svg[role="status"]')).toHaveCount(1);
    expect(await create.evaluate((el) => el.getBoundingClientRect().width)).toBe(width);
    expect(await form.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
    expect(await frame.evaluate((el) => el.getBoundingClientRect().width)).toBe(frameWidth);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(create.locator('svg[role="status"], animate, animateTransform')).toHaveCount(0);
    await expect(create).toBeDisabled();
    await expect(status).toHaveText("Creating color variable…");
    expect(await create.evaluate((el) => el.getBoundingClientRect().width)).toBe(width);
    expect(await form.evaluate((el) => el.getBoundingClientRect().height)).toBe(height);
    await page.screenshot({
      path: `/tmp/emvb-color-feedback-${test.info().project.name}-reduce.png`,
    });
    release.resolve();
    await expect(form.getByRole("alert")).toContainText("Try saving again.");
    await expect(name).toBeEnabled();
    await expect(value).toBeEnabled();
    await expect(cancel).toBeEnabled();
    await expect(create).toBeEnabled();
    await expect(create).toHaveAttribute("aria-busy", "false");
    await expect(name).toHaveValue("Accent");
    await expect(value).toHaveValue("#abcdef");
    await value.fill("#123456");
    await create.click();
    await expect(form).toHaveCount(0);
    await expect(control.getByRole("textbox", { name: "Accent value", exact: true })).toHaveValue(
      "#123456",
    );
    await expect(heading).toHaveCSS("color", "rgb(18, 52, 86)");
    expect(values).toEqual(["#abcdef", "#123456"]);
  } finally {
    release.resolve();
  }
});
