import { expect, test } from "@playwright/test";
import { createPage, setUpEmvbOnce } from "./support/api.ts";
import { formPageLayout } from "./support/forms.ts";
import { canvas, openEditor, openLayers, overlay, unique } from "./support/helpers.ts";

setUpEmvbOnce();
test.use({ viewport: { width: 1440, height: 900 } });

test("W-735: field definitions explain loading, unavailable and empty states without losing input", async ({
  page,
  request,
}) => {
  const formId = "01FEEDBACK";
  const id = await createPage(
    request,
    "Field feedback",
    formPageLayout(formId),
    `field-feedback-${unique()}`,
  );
  const releases = Array.from({ length: 3 }, () => Promise.withResolvers<void>());
  let phase = 0;
  const requested: number[] = [];
  await page.route("**/_emdash/api/plugins/emdash-forms/definition", async (route) => {
    const body = route.request().postDataJSON() as { id: string };
    if (body.id !== formId) return route.fallback();
    const index = phase;
    requested.push(index);
    await releases[index]?.promise;
    if (index === 0) {
      await route.fulfill({
        status: 503,
        json: { error: { code: "BUSY", message: "Try later." } },
      });
    } else {
      await route.fulfill({
        json: {
          data: {
            pages: [
              {
                fields:
                  index === 1
                    ? []
                    : [{ name: "email", type: "email", label: "Email", required: true }],
              },
            ],
          },
        },
      });
    }
  });
  try {
    await openEditor(page, id);
    await openLayers(page);
    const fieldLayer = overlay(page).locator('[data-emvb-layer="inp00001"] .emvb-layer-select');
    const formLayer = overlay(page).locator('[data-emvb-layer="form0001"] .emvb-layer-select');
    await fieldLayer.click();
    const name = overlay(page).getByRole("textbox", { name: "Field name", exact: true });
    const status = overlay(page).getByRole("status", { name: "Form fields status", exact: true });
    const picker = overlay(page).getByRole("combobox", { name: "Field", exact: true });
    const frame = overlay(page).locator("iframe[data-emvb-canvas]");
    const width = await frame.evaluate((el) => el.getBoundingClientRect().width);
    await expect(status).toHaveText("Loading form fields… You can enter a field name.");
    await expect(picker).toHaveCount(0);
    await name.fill("unfinished name");
    await expect(name).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(status).toHaveText("Loading form fields… You can enter a field name.");
    releases[0]?.resolve();
    await expect(status).toHaveText("Could not load form fields. Enter a field name manually.");
    await expect(name).toHaveValue("unfinished name");
    await expect(name).toBeFocused();
    await expect(name).toBeEnabled();
    await name.fill("manual_email");
    await expect(canvas(page).locator('input[name="manual_email"]')).toHaveCount(1);
    await page.screenshot({
      path: `/tmp/emvb-field-feedback-${test.info().project.name}-unavailable.png`,
    });

    await formLayer.click();
    phase = 1;
    await fieldLayer.click();
    await expect.poll(() => requested.includes(1)).toBe(true);
    await expect(status).toHaveText("Loading form fields… You can enter a field name.");
    releases[1]?.resolve();
    await expect(status).toHaveText("This form has no fields yet. Enter a field name manually.");
    await expect(name).toHaveValue("manual_email");
    await expect(picker).toHaveCount(0);

    await formLayer.click();
    phase = 2;
    await fieldLayer.click();
    await expect.poll(() => requested.includes(2)).toBe(true);
    await name.fill("unfinished name");
    await expect(name).toBeFocused();
    releases[2]?.resolve();
    await expect(picker).toBeVisible();
    await expect(status).toHaveText("");
    await expect(name).toBeFocused();
    await expect(name).toHaveValue("unfinished name");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await picker.click();
    await page.getByRole("option", { name: "Email *", exact: true }).click();
    await expect(name).toHaveValue("email");
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
    await expect(canvas(page).locator('input[name="email"]')).toHaveCount(1);
    expect(await frame.evaluate((el) => el.getBoundingClientRect().width)).toBe(width);

    await formLayer.click();
    await overlay(page).getByRole("textbox", { name: "Form id", exact: true }).fill("");
    await fieldLayer.click();
    await expect(status).toHaveText(
      "Choose a form on the parent Form element to list its fields, or enter a field name manually.",
    );
    await expect(name).toHaveValue("email");
    await expect(name).toBeEnabled();
    await expect(picker).toHaveCount(0);
    expect([...new Set(requested)]).toEqual([0, 1, 2]);
  } finally {
    for (const release of releases) release.resolve();
  }
});
