import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { successSignalLayout } from "../packages/emvb/src/core/forms/success-layout.ts";
import { api, createPage, ensureEmvbSetup, getPage } from "./support/api.ts";
import { setClass, setColor } from "./support/design.ts";
import { createContactForm } from "./support/forms.ts";
import { uploadEmvbPixel } from "./support/media.ts";

const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: test.info().project.use.storageState });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
});

async function publish(request: Parameters<typeof getPage>[0], id: string) {
  const { rev } = await getPage(request, id);
  expect(
    (await api(request, "POST", `/_emdash/api/content/emvb_pages/${id}/publish`, { _rev: rev }))
      .status,
  ).toBe(200);
}

test("published EmVB page has no serious axe violations (W-041)", async ({ page, request }) => {
  const tag = unique();
  const colorVar = `a11yc-${tag}`;
  const classId = `a11yk-${tag}`;
  const form = await createContactForm(request, `a11y-${tag}`);
  const media = await uploadEmvbPixel(request);
  await setColor(request, colorVar, "#112233");
  await setClass(request, classId, { name: "A11y", style: { color: "#112233" } });
  try {
    const slug = `a11y-${tag}`;
    const id = await createPage(
      request,
      "A11y page",
      successSignalLayout({
        formId: form.id,
        colorVar,
        classId,
        imageSrc: media.url,
        heading: `Accessible ${tag}`,
      }),
      slug,
    );
    await publish(request, id);
    // Anonymous-ish: no storage state for public axe (avoid EmDash edit toolbar navigating).
    await page.context().clearCookies();
    await page.goto(`/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: `Accessible ${tag}` })).toBeVisible();
    await expect(page.locator(".emvb-root")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include(".emvb-root")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  } finally {
    // Re-auth not needed for cleanup via request fixture (still has storage state).
    await setColor(request, colorVar, null);
    await setClass(request, classId, null);
  }
});
