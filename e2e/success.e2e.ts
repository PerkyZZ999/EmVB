import { expect, test, type Page } from "@playwright/test";
import { successSignalLayout } from "../packages/emvb/src/core/forms/success-layout.ts";
import { api, createPage, ensureEmvbSetup, getPage } from "./support/api.ts";
import { setClass, setColor } from "./support/design.ts";
import { createContactForm, listSubmissions } from "./support/forms.ts";
import { uploadEmvbPixel } from "./support/media.ts";

const EDITOR = "/_emdash/admin/plugins/emvb/editor";
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: test.info().project.use.storageState });
  await ensureEmvbSetup(await context.newPage());
  await context.close();
});

async function publish(request: Parameters<typeof getPage>[0], id: string) {
  const { rev } = await getPage(request, id);
  const result = await api(request, "POST", `/_emdash/api/content/emvb_pages/${id}/publish`, {
    _rev: rev,
  });
  expect(result.status).toBe(200);
}

const overlay = (page: Page) => page.locator("[data-emvb-editor]");
const canvas = (page: Page) => page.frameLocator("iframe[data-emvb-canvas]");

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
    await overlay(page)
      .getByRole("button", { name: /Save draft/ })
      .click();
    await expect(overlay(page).locator(".emvb-save-status")).toContainText("Saved", {
      timeout: 15_000,
    });

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
    await publish(request, id);

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
    await expect(page.locator("[data-ec-form][data-ec-initialized]")).toBeVisible({
      timeout: 15_000,
    });
    const email = `visitor-${tag}@example.com`;
    await page.locator('input[name="email"]').fill(email);
    await page.locator(".ec-form-submit").click();
    await expect(page.locator("[data-form-status]")).toContainText(/EmVB received|Thank|success/i, {
      timeout: 15_000,
    });
    const items = await listSubmissions(request, form.id);
    expect(items.some((item) => item.data?.["email"] === email)).toBe(true);

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
