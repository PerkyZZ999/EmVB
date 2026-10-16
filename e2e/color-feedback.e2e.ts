import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { canvas, openEditor, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

test("W-728: color variable creation keeps stable feedback and retries without losing values", async ({
  page,
  request,
}) => {
  const text = `Color feedback ${unique()}`;
  const id = await createPage(
    request,
    text,
    {
      schemaVersion: 16,
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
