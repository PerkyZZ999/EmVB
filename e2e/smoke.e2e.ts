import { expect, test } from "@playwright/test";

test("the EmVB plugin is loaded by the host", async ({ request }) => {
  const res = await request.get("/_emdash/api/plugins/emvb/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ success: true, data: { ok: true, plugin: "emvb" } });
  // W-1001: the version is for signed-in editors only.
  const version = await request.get("/_emdash/api/plugins/emvb/version", {
    headers: { "X-EmDash-Request": "1" },
  });
  expect(await version.json()).toEqual({
    success: true,
    data: { plugin: "emvb", version: "1.1.1" },
  });
});

test("the admin loads for the signed-in admin without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/_emdash/admin");
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  expect(errors).toEqual([]);
});
