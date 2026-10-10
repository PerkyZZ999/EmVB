/**
 * Seeds the Node demo (http://127.0.0.1:4411, dev server) with the Northfold demo site used for
 * the project-site screenshots. Run from the repository root after `bun run demo:node`:
 *
 *   bun site/scripts/seed-demo.ts <folder with the photos>
 *
 * It signs in through the dev bypass, runs Set up EmVB when needed, uploads the photos, creates the
 * enquiry form, saves and publishes the design system, the theme parts and the page, and writes
 * the created ids to `site/scripts/.demo-state.json` for capture-screenshots.ts.
 */
import { chromium, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  design,
  footerLayout,
  headerLayout,
  homeLayout,
  notFoundLayout,
  popupLayout,
  simplePageLayout,
  templateLayout,
  tripOptions,
  type Media,
} from "./demo-content.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

export const BASE = process.env["EMVB_DEMO_URL"] ?? "http://127.0.0.1:4411";
export const STATE_FILE = join(HERE, ".demo-state.json");
const CHROMIUM = process.env["EMVB_CHROMIUM"] ?? "/usr/bin/chromium";

const photos: Record<keyof Media, [file: string, width: number, height: number, alt: string]> = {
  heroRidge: ["hero-ridge.jpg", 2400, 1400, "Green ridges under low cloud"],
  fjord: ["fjord.jpg", 1200, 900, "A fjord between granite cliffs"],
  canyon: ["canyon.jpg", 1200, 900, "Red canyon cliffs at sunset"],
  valley: ["valley.jpg", 1200, 900, "Pines and granite walls beside a river"],
  alpineCamp: ["alpine-camp.jpg", 1200, 900, "Tents in the snow below alpine peaks"],
  hiker: ["hiker.jpg", 1000, 1250, "A hiker above misty ridges"],
  river: ["river.jpg", 1600, 1000, "A river through a misty forest"],
};

export async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await request.fetch(path, {
    method,
    headers: {
      "X-EmDash-Request": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  // oxlint-disable-next-line typescript/no-explicit-any -- callers read loosely shaped EmDash API data
  const json = (await response.json().catch(() => null)) as Record<string, any> | null;
  if (!response.ok())
    throw new Error(`${method} ${path}: ${response.status()} ${JSON.stringify(json)}`);
  return json?.["data"];
}

/** Signs in through the dev bypass and loads the admin until it renders without the welcome dialog. */
export async function signIn(page: Page) {
  await page.goto("/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin");
  await page.waitForURL("**/_emdash/admin**", { timeout: 60_000 });
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto("/_emdash/admin", { waitUntil: "load" });
    const dashboard = page.getByRole("link", { name: "Dashboard" });
    const welcome = page.getByRole("dialog", { name: /Welcome to EmDash/ });
    try {
      await dashboard.or(welcome).first().waitFor({ timeout: 20_000 });
      if (await welcome.isVisible())
        await welcome.getByRole("button", { name: "Get Started" }).click();
      await dashboard.waitFor({ timeout: 10_000 });
      return;
    } catch {
      // The first loads after a dev-server start can fail to hydrate (AGENTS.md); reload.
    }
  }
  throw new Error("The admin did not load");
}

async function ensureSetup(page: Page) {
  await page.goto("/_emdash/admin/plugins/emvb/pages");
  const action = page.getByRole("button", { name: /^(Set up|Upgrade) EmVB$/ });
  const ready = page.locator('[data-emvb-setup="ready"]');
  await action.or(ready).first().waitFor({ timeout: 30_000 });
  if (await action.isVisible()) await action.click();
  await ready.waitFor({ timeout: 30_000 });
}

async function upload(request: APIRequestContext, folder: string) {
  const media = {} as Media;
  for (const [key, [file, width, height, alt]] of Object.entries(photos)) {
    const response = await request.post("/_emdash/api/media", {
      headers: { "X-EmDash-Request": "1" },
      multipart: {
        file: { name: file, mimeType: "image/jpeg", buffer: readFileSync(join(folder, file)) },
        width: String(width),
        height: String(height),
        alt,
      },
    });
    if (!response.ok())
      throw new Error(`upload ${file}: ${response.status()} ${await response.text()}`);
    const item = ((await response.json()) as { data: { item: { id: string; url: string } } }).data
      .item;
    media[key as keyof Media] = { id: item.id, url: item.url, width, height };
  }
  return media;
}

const field = (id: string, type: string, labelText: string, name: string, extra = {}) => ({
  id,
  type,
  label: labelText,
  name,
  required: false,
  width: "full",
  ...extra,
});

async function createForm(request: APIRequestContext) {
  const created = await api(request, "POST", "/_emdash/api/plugins/emdash-forms/forms/create", {
    name: "Trip enquiry",
    slug: "trip-enquiry",
    pages: [
      {
        fields: [
          field("fld_name", "text", "Your name", "name", { required: true }),
          field("fld_email", "email", "Email", "email", { required: true }),
          field("fld_trip", "select", "Which trip?", "trip", { options: tripOptions }),
          field("fld_message", "textarea", "Anything we should know?", "message"),
          field("fld_guide", "checkbox", "Send me the 2026 route guide", "guide"),
        ],
      },
    ],
    settings: {
      confirmationMessage: "Thanks! A guide will reply within two working days.",
      spamProtection: "honeypot",
      submitLabel: "Send enquiry",
      notifyEmails: [],
      digestEnabled: false,
      digestHour: 9,
      retentionDays: 0,
    },
  });
  return created.id as string;
}

async function publishDesign(request: APIRequestContext) {
  const draft = await api(request, "GET", "/_emdash/api/plugins/emvb/design/draft");
  await api(request, "POST", "/_emdash/api/plugins/emvb/design/save", {
    design,
    revision: draft.revision,
  });
  await api(request, "POST", "/_emdash/api/plugins/emvb/design/publish", {
    publishedRevision: draft.publishedRevision,
  });
}

async function createEntry(
  request: APIRequestContext,
  collection: string,
  data: Record<string, unknown>,
  slug: string,
  publish = true,
) {
  const created = await api(request, "POST", `/_emdash/api/content/${collection}`, { data, slug });
  const id = created.item.id as string;
  if (publish) {
    const current = await api(request, "GET", `/_emdash/api/content/${collection}/${id}`);
    await api(request, "POST", `/_emdash/api/content/${collection}/${id}/publish`, {
      _rev: current["_rev"],
    });
  }
  return id;
}

const everywhere = {
  schemaVersion: 1,
  rules: [{ id: "r-entire", op: "include", group: "general", name: "entire_site", args: {} }],
};

async function part(
  request: APIRequestContext,
  title: string,
  partType: string,
  layout: unknown,
  slug: string,
  conditions: unknown = everywhere,
  triggers: unknown = { schemaVersion: 1, open: [{ type: "page_load" }], advanced: {} },
) {
  return createEntry(
    request,
    "emvb_theme_parts",
    { title, layout, part_type: partType, conditions, triggers },
    slug,
  );
}

if (import.meta.main) {
  const folder = process.argv[2];
  if (!folder) throw new Error("Usage: bun site/scripts/seed-demo.ts <photo folder>");
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await signIn(page);
  await ensureSetup(page);
  const request = context.request;
  const media = await upload(request, folder);
  const formId = await createForm(request);
  await publishDesign(request);
  const parts = {
    header: await part(request, "Site header", "header", headerLayout(), "site-header"),
    footer: await part(request, "Site footer", "footer", footerLayout(), "site-footer"),
    popup: await part(
      request,
      "Route guide popup",
      "popup",
      popupLayout(media),
      "route-guide",
      everywhere,
      {
        schemaVersion: 1,
        open: [{ type: "click", selector: "#get-guide" }],
        advanced: { devices: ["desktop", "tablet", "mobile"] },
      },
    ),
    notFound: await part(
      request,
      "Trail not found",
      "error_404",
      notFoundLayout(),
      "trail-not-found",
      {
        schemaVersion: 1,
        rules: [{ id: "r-404", op: "include", group: "singular", name: "not_found", args: {} }],
      },
    ),
    template: await part(request, "Trip page", "page_template", templateLayout(), "trip-page"),
  };
  const extras: [title: string, slug: string, eyebrow: string, lead: string, publish: boolean][] = [
    [
      "Our guides",
      "guides",
      "Company",
      "Twelve guides, all certified, most of them born within a day's walk of the trails they lead.",
      true,
    ],
    [
      "Lofoten and the Western Fjords",
      "lofoten",
      "Norway · 8 days · moderate",
      "Ridges above the sea, fishing villages and the midnight sun.",
      true,
    ],
    [
      "Trail fund",
      "trail-fund",
      "Company",
      "Two percent of every booking goes to the people who keep the paths open.",
      false,
    ],
    [
      "Journal: packing for the Arctic",
      "journal-arctic-packing",
      "Journal",
      "What our guides carry for a week above the Arctic Circle, and what they leave at home.",
      false,
    ],
  ];
  for (const [title, slug, eyebrow, lead, publish] of extras) {
    await createEntry(
      request,
      "emvb_pages",
      { title, layout: simplePageLayout(eyebrow, title, lead), canvas_mode: "site-layout" },
      slug,
      publish,
    );
  }
  const home = await createEntry(
    request,
    "emvb_pages",
    {
      title: "Northfold — guided hiking trips",
      layout: homeLayout(media, formId),
      canvas_mode: "site-layout",
    },
    "northfold",
  );
  writeFileSync(STATE_FILE, `${JSON.stringify({ media, formId, parts, home }, null, 2)}\n`);
  await context.storageState({ path: join(HERE, ".demo-auth.json") });
  await browser.close();
  // oxlint-disable-next-line no-console -- a CLI result line
  console.log(`Seeded: ${BASE}/northfold`);
}
