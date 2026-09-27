import { expect, test, type Page } from "@playwright/test";
import { api } from "./support/api.ts";
import { ROLES, setDevRole } from "./support/roles.ts";

const PAGES = "/_emdash/admin/plugins/emvb/pages";
const EDITOR = "/_emdash/admin/plugins/emvb/editor";
const NO_ACCESS = "You don't have access to EmVB";

test.describe.configure({ mode: "serial" });

// Every other e2e file expects the dev user to be an admin again, even after a failure.
let changedPlatform: string | undefined;
function becomeRole(platform: string, role: number) {
  changedPlatform = platform;
  setDevRole(platform, role);
}
test.afterAll(() => {
  if (changedPlatform) setDevRole(changedPlatform, ROLES.admin);
});

const sidebarLink = (page: Page) =>
  page.getByRole("complementary", { name: "Admin navigation" }).locator(`a[href$="${PAGES}"]`);

const lower = [
  ["subscriber", ROLES.subscriber],
  ["contributor", ROLES.contributor],
  ["author", ROLES.author],
] as const;

for (const [name, role] of lower) {
  test(`${name} (${role}): no Visual pages link, no access on both pages, and 403 from EmVB routes`, async ({
    page,
    request,
  }, testInfo) => {
    becomeRole(testInfo.project.name, role);
    await page.goto("/_emdash/admin");
    // The link is in the DOM (EmDash can't role-gate plugin pages) but the shim hides it.
    await expect(sidebarLink(page)).toHaveCount(1, { timeout: 20_000 });
    await expect(sidebarLink(page)).toBeHidden();

    await page.goto(PAGES);
    await expect(page.getByText(NO_ACCESS)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-emvb-page="pages"]')).toHaveCount(0);

    await page.goto(`${EDITOR}?entry=01ROLECHECK`);
    await expect(page.getByText(NO_ACCESS)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-emvb-entry]")).toHaveCount(0);

    const save = await api(request, "POST", "/_emdash/api/plugins/emvb/design/save", {
      design: { schemaVersion: 1, variables: { colors: [] } },
      revision: null,
    });
    expect(save.status).toBe(403);
  });
}

const allowed = [
  ["editor", ROLES.editor],
  ["admin", ROLES.admin],
] as const;

for (const [name, role] of allowed) {
  test(`${name} (${role}): sees the link, a working page, and opens the editor by URL`, async ({
    page,
    request,
  }, testInfo) => {
    becomeRole(testInfo.project.name, role);
    await page.goto("/_emdash/admin");
    await expect(sidebarLink(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#emvb-sidebar-shim")).toHaveCount(0);

    await sidebarLink(page).click();
    await expect(page.locator('[data-emvb-page="pages"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(NO_ACCESS)).toHaveCount(0);

    // `/editor` isn't declared (D-024): it only renders because the router resolves exported pages.
    await page.goto(`${EDITOR}?entry=01ROLECHECK`);
    await expect(page.locator('[data-emvb-entry="01ROLECHECK"]')).toBeVisible({ timeout: 20_000 });
    await expect(sidebarLink(page)).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Admin navigation" }).locator('a[href*="/editor"]'),
    ).toHaveCount(0);

    const current = await api(request, "GET", "/_emdash/api/plugins/emvb/design");
    const data = current.json?.["data"] as { design: unknown; revision: string | null };
    const save = await api(request, "POST", "/_emdash/api/plugins/emvb/design/save", {
      design: data.design,
      revision: data.revision,
    });
    expect(save.status).toBe(200);
  });
}
