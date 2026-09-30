import { expect, test } from "@playwright/test";
import { successSignalLayout } from "../packages/emvb/src/core/forms/success-layout.ts";
import { api, createPage, publishPage, setUpEmvbOnce } from "./support/api.ts";
import { setClass, setColor } from "./support/design.ts";
import { createContactForm, expectSubmission, submitAsVisitor } from "./support/forms.ts";
import { uploadEmvbPixel } from "./support/media.ts";
import { EDITOR, canvas, overlay, saveDraft, unique } from "./support/helpers.ts";

test.describe.configure({ mode: "serial" });

setUpEmvbOnce();

test("BRIEF success signal: build, preview, publish, submit, restyle (W-039)", async ({
  page,
  request,
}) => {
  const tag = unique();
  const colorVar = `sigc-${tag}`;
  const classId = `sigk-${tag}`;
  const slug = `success-${tag}`;
  const heading = `Success ${tag}`;
  const form = await createContactForm(request, `success-${tag}`);
  const media = await uploadEmvbPixel(request);

  await setColor(request, colorVar, "#112233");
  await setClass(request, classId, { name: "Signal", style: { color: "#112233" } });

  try {
    const layout = successSignalLayout({
      formId: form.id,
      colorVar,
      classId,
      imageSrc: media.url,
      heading,
    });
    const id = await createPage(request, "Success signal", layout, slug);

    // 1. Open full-screen editor
    await page.goto(`${EDITOR}?entry=${id}`);
    await expect(overlay(page)).toBeVisible({ timeout: 20_000 });
    await expect(overlay(page).locator(".emvb-topbar-title")).toContainText("Success signal");
    await expect(canvas(page).getByRole("heading", { name: heading })).toBeVisible();
    await expect(canvas(page).locator("img.emvb-image")).toBeVisible();
    await expect(canvas(page).locator("[data-ec-form]")).toBeVisible();

    // Save draft (content already stored via API; exercise Save)
    await saveDraft(page);

    // Preview draft
    const preview = await api(
      request,
      "POST",
      `/_emdash/api/content/emvb_pages/${id}/preview-url`,
      {},
    );
    expect(preview.status).toBe(200);
    const previewUrl = new URL(
      (preview.json?.["data"] as { url: string } | undefined)?.url ?? "",
      "http://x",
    );
    const previewHtml = await (await request.get(previewUrl.pathname + previewUrl.search)).text();
    expect(previewHtml).toContain(heading);
    expect(previewHtml).toContain("data-ec-form");

    // Publish
    await publishPage(request, id);

    // 2. Public page matches canvas content; no EmVB editor JS / data-emvb
    const publicHtml = await (await request.get(`/${slug}`)).text();
    expect(publicHtml).toContain(heading);
    expect(publicHtml).toContain("Welcome to the EmVB success page.");
    expect(publicHtml).toContain("Learn more");
    expect(publicHtml).toContain("data-ec-form");
    expect(publicHtml).toContain(`emvb-k-${classId}`);
    expect(publicHtml).toContain(`--emvb-c-${colorVar}:#112233`);
    expect(publicHtml).not.toContain("data-emvb");
    expect(publicHtml).not.toMatch(/data-emvb-editor|emvb\/admin/i);

    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const publicColor = await page
      .locator("h1.emvb-heading")
      .evaluate((el) => getComputedStyle(el).color);
    // #112233 → rgb(17, 34, 51)
    expect(publicColor).toBe("rgb(17, 34, 51)");

    // 3. Visitor submits the form
    const email = `visitor-${tag}@example.com`;
    await submitAsVisitor(page, email);
    await expectSubmission(request, form.id, email);

    // 4. Change colour variable without republish
    await setColor(request, colorVar, "#445566");
    await page.reload();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    const after = await page
      .locator("h1.emvb-heading")
      .evaluate((el) => getComputedStyle(el).color);
    expect(after).toBe("rgb(68, 85, 102)");
    const afterHtml = await (await request.get(`/${slug}`)).text();
    expect(afterHtml).toContain(`--emvb-c-${colorVar}:#445566`);
    expect(afterHtml).not.toContain(`--emvb-c-${colorVar}:#112233`);
  } finally {
    await setColor(request, colorVar, null);
    await setClass(request, classId, null);
  }
});
