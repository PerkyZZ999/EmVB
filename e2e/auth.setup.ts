import { expect, test as setup } from "@playwright/test";

setup("sign in as the dev admin and warm up the admin", async ({ page }, testInfo) => {
  setup.setTimeout(180_000);
  const platform = testInfo.project.name.replace(/-setup$/, "");
  const dashboard = page.getByRole("link", { name: "Dashboard" });
  const welcome = page.getByRole("dialog", { name: /Welcome to EmDash/ });

  // The dev bypass only exists in dev mode (VALIDATION.md K20).
  await page.goto("/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin");
  await page.waitForURL("**/_emdash/admin**");

  // The first admin loads after a dev-server start can abort while Vite optimizes dependencies,
  // and under Bun the plugin registry can fail to hydrate once (VALIDATION.md S0-1).
  // Load the admin until it renders cleanly twice in a row.
  await expect(async () => {
    for (let i = 0; i < 2; i++) {
      const errors: string[] = [];
      const onConsole = (msg: { type(): string; text(): string }) => {
        if (msg.type() === "error") errors.push(msg.text());
      };
      page.on("console", onConsole);
      await page.goto("/_emdash/admin", { waitUntil: "load" });
      await expect(dashboard.or(welcome)).toBeVisible({ timeout: 20_000 });
      // A new user's first visit opens a welcome dialog that hides the rest of the admin.
      if (await welcome.isVisible())
        await welcome.getByRole("button", { name: "Get Started" }).click();
      await expect(dashboard).toBeVisible();
      page.off("console", onConsole);
      expect(errors).toEqual([]);
    }
  }).toPass({ timeout: 150_000, intervals: [1_000, 2_000, 5_000] });
  await page.context().storageState({ path: `e2e/.auth/${platform}.json` });
});
