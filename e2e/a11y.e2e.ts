import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { successSignalLayout } from "../packages/emvb/src/core/forms/success-layout.ts";
import { createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { setClass, setColor } from "./support/design.ts";
import { createContactForm } from "./support/forms.ts";
import { uploadEmvbPixel } from "./support/media.ts";
import { unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

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
    await publishPage(request, id);
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
