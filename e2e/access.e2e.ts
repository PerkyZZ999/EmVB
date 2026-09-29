import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { api, createPage, setUpEmvbOnce } from "./support/api.ts";
import { ROLES, setDevRole } from "./support/roles.ts";
import { EDITOR } from "./support/helpers.ts";

const PAGES = "/_emdash/admin/plugins/emvb/pages";
const NO_ACCESS = "You don't have access to EmVB";

const pageLayout = {
  schemaVersion: 1,
  root: { id: "root0001", type: "container", props: {}, children: [] },
};
const createAs = (request: APIRequestContext) =>
  api(request, "POST", "/_emdash/api/content/emvb_pages", {
    data: { title: "Role check", layout: pageLayout },
  });

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

// Page saves need the `emvb_pages` collection, and a new database has none until setup runs.
setUpEmvbOnce();

const sidebarLink = (page: Page) =>
  page.getByRole("complementary", { name: "Admin navigation" }).locator(`a[href$="${PAGES}"]`);

const lower = [
  ["subscriber", ROLES.subscriber],
  ["contributor", ROLES.contributor],
  ["author", ROLES.author],
] as const;

for (const [name, role] of lower) {
  test(`${name} (${role}): no Visual pages link, no access on both pages, and EmVB routes and page saves refused`, async ({
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
    await expect(page.locator("[data-emvb-editor]")).toHaveCount(0);

    const save = await api(request, "POST", "/_emdash/api/plugins/emvb/design/save", {
      design: { schemaVersion: 1, variables: { colors: [] } },
      revision: null,
    });
    expect(save.status).toBe(403);

    // EmDash refuses roles without content permissions (403); EmVB's hook refuses the rest (422).
    const created = await createAs(request);
    expect([403, 422]).toContain(created.status);
    expect(created.json?.["data"]).toBeUndefined();
  });
}

const allowed = [
  ["editor", ROLES.editor],
  ["admin", ROLES.admin],
] as const;

for (const [name, role] of allowed) {
  test(`${name} (${role}): sees the link, a working page, opens the editor by URL, and saves pages`, async ({
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
    await expect(page.locator("[data-emvb-editor]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-emvb-entry="01ROLECHECK"]')).toHaveCount(1);
    await expect(page.locator("#emvb-sidebar-shim")).toHaveCount(0);
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
    await createPage(request, "Role check", pageLayout);
  });
}
