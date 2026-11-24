/**
 * The stock install smoke's checks on one site (W-1084, W-1095; in the repository since W-1096).
 * scripts/stock-smoke.ts runs them, from the repository root, against each fresh EmDash site:
 *
 *   bun scripts/stock-smoke/checks.ts dev  <base> <state.json> [--ext] --cookie=always|never [--forms]
 *   bun scripts/stock-smoke/checks.ts prod <base> <state.json> [--ext] --cookie=always|never
 *
 * dev: sign in (dev-bypass), Set up EmVB, publish a page with the 1.4 elements (a Menu whose item
 * opens a published Section as a mega panel, a Theme toggle, a Search form, a Form with two steps,
 * the hello extension's Greeting), a plain page and a page made from the Landing starter template
 * in the editor; check the public HTML, the canvas and the public page in a browser. 1.4.1: a
 * missing extension renders nothing for visitors, the site's visitorCookie mode, a Loop's Post
 * image stored the way EmDash's admin stores a picked upload, a link Button takes the site-wide
 * `button` default. prod: read the same pages back from the production server (same database).
 * Add each release's new checks here.
 */
import { chromium } from "@playwright/test";

const [mode, base, statePath] = process.argv.slice(2);
const ext = process.argv.includes("--ext");
const forms = process.argv.includes("--forms");
const cookieMode = process.argv.find((a) => a.startsWith("--cookie="))?.slice(9);
if (cookieMode !== "always" && cookieMode !== "never") throw new Error("--cookie=always|never");
if (!mode || !base || !statePath) throw new Error("usage: dev|prod <base> <state.json>");
const executablePath = process.env["EMVB_CHROMIUM"] ?? "/usr/bin/chromium";

const say = (line: string) => process.stdout.write(`${line}\n`);
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  say(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const count = (text: string, part: string) => text.split(part).length - 1;
/** Scripts on the page, without the dev server's own Vite client (dev only, never built). */
const scripts = (html: string) =>
  (html.match(/<script\b[^>]*>/g) ?? []).filter((tag) => !tag.includes("/@vite/client")).length;
const get = async (path: string) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, html: await res.text() };
};
/** A value deep in a JSON answer (`at(json, "data", "item", "id")`), or undefined. */
const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (v, key) =>
      v !== null && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined,
    value,
  );
const text = (value: unknown) => (typeof value === "string" ? value : "");

type State = { slugs: Record<string, string>; imageSrc?: string };

/** A public GET with no session: the page's HTML and its Set-Cookie lines. */
async function visitor(path: string, cookie?: string) {
  const res = await fetch(`${base}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return {
    status: res.status,
    html: await res.text(),
    setCookie: res.headers.getSetCookie().join("\n"),
  };
}

/** 1.4.1 (#34): the visitorCookie mode the site's astro.config sets. */
async function checkVisitorCookie(slug: string, where: string) {
  const first = await visitor(`/v/${slug}`);
  check(`${where} cookie: 200`, first.status === 200, `${first.status}`);
  check(
    `${where} cookie: first visit is new`,
    first.html.includes("Welcome new") && !first.html.includes("Welcome back"),
  );
  const back = await visitor(`/v/${slug}`, "emvb_seen=1");
  if (cookieMode === "never") {
    check(
      `${where} cookie (never): no emvb_seen set`,
      !first.setCookie.includes("emvb_seen"),
      first.setCookie || "no Set-Cookie",
    );
    check(
      `${where} cookie (never): an old cookie isn't read`,
      back.html.includes("Welcome new") && !back.html.includes("Welcome back"),
    );
  } else {
    check(
      `${where} cookie (default): emvb_seen set on a first visit`,
      /emvb_seen=1;/.test(first.setCookie),
      first.setCookie || "no Set-Cookie",
    );
    check(
      `${where} cookie (default): returning with the cookie`,
      back.html.includes("Welcome back") && !back.html.includes("Welcome new"),
    );
  }
}

/** 1.4.1 (#37): an element whose extension isn't installed renders nothing on public pages. */
function checkMissingExtension(html: string, where: string) {
  check(`${where} missing ext: page renders around it`, html.includes("After the missing block"));
  check(
    `${where} missing ext: no note or placeholder`,
    !html.includes("needs an extension") &&
      !html.includes("emvb-ext-missing") &&
      !html.includes("Kept for later"),
  );
}

/** 1.4.1 (#32): a Loop's Post image shows the image picked the way the admin stores it. */
async function checkPostImage(html: string, where: string, expected: string | undefined) {
  const src = html
    .match(/<img[^>]*class="[^"]*emvb-post-image[^"]*"[^>]*>/)?.[0]
    .match(/src="([^"]+)"/)?.[1];
  check(`${where} post image: src`, !!src && src === expected, `${src} vs ${expected}`);
  if (src) {
    const res = await fetch(new URL(src.replaceAll("&amp;", "&"), base));
    check(
      `${where} post image: file serves`,
      res.ok && (res.headers.get("content-type") ?? "").startsWith("image/"),
      `${res.status} ${res.headers.get("content-type")}`,
    );
  }
}

/** 1.4.1 (#30): a Button with a URL (a link) takes the site-wide `button` default. */
async function checkLinkButton(slug: string, where: string) {
  const browser = await chromium.launch({ executablePath });
  const p = await browser.newPage();
  await p.goto(`${base}/v/${slug}`);
  const look = (name: string) =>
    p
      .getByText(name, { exact: true })
      .evaluate((el) => [
        el.tagName,
        getComputedStyle(el).color,
        getComputedStyle(el).backgroundColor,
      ]);
  const link = await look("Book now");
  const plain = await look("Plain button");
  check(
    `${where} link Button takes the button default`,
    link[0] === "A" && link[1] === "rgb(255, 255, 255)" && link[2] === "rgb(200, 30, 30)",
    link.join(" "),
  );
  check(
    `${where} plain Button takes the button default`,
    plain[2] === "rgb(200, 30, 30)",
    plain.join(" "),
  );
  await browser.close();
}

function checkFeaturePage(html: string, where: string) {
  check(`${where}: theme toggle`, html.includes("data-emvb-theme-toggle"));
  check(`${where}: search form`, /<form[^>]*action="\/search"/.test(html));
  check(
    `${where}: mega panel`,
    html.includes("emvb-menu-panel--mega") && html.includes("Boots mega"),
  );
  check(`${where}: form steps`, html.includes("emvb-form-step-nav") && html.includes("Your trip"));
  if (ext) {
    check(
      `${where}: extension renders (not the placeholder)`,
      html.includes("hello-card") && !/class="[^"]*emvb-ext-missing/.test(html),
    );
    check(`${where}: extension text`, html.includes("Hello from the stock smoke"));
    check(
      `${where}: extension runtime once`,
      count(html, "data-emvb-ext-runtime") === 1,
      `${count(html, "data-emvb-ext-runtime")}`,
    );
    const rules = count(html, ".hello-card{") + count(html, ".hello-card {");
    check(
      `${where}: extension CSS once`,
      count(html, ".hello-card") >= 1 && rules <= 1,
      `${rules}`,
    );
  }
}

if (mode === "prod") {
  const state = (await Bun.file(statePath).json()) as State;
  for (const [name, slug] of Object.entries(state.slugs)) {
    // oxlint-disable-next-line no-await-in-loop -- one page after another, as a visitor would
    const { status, html } = await get(`/v/${slug}`);
    check(`prod ${name}: 200`, status === 200, `${status}`);
    if (name === "features") checkFeaturePage(html, "prod features");
    if (name === "plain")
      check("prod plain: no script", scripts(html) === 0, `${scripts(html)} <script>`);
    if (name === "template")
      check("prod template: landing hero", html.includes("Say what you do in one clear line"));
    if (name === "missing") checkMissingExtension(html, "prod");
    // oxlint-disable-next-line no-await-in-loop -- same
    if (name === "postImage") await checkPostImage(html, "prod", state.imageSrc);
    // oxlint-disable-next-line no-await-in-loop -- same
    if (name === "button") await checkLinkButton(slug, "prod");
    // oxlint-disable-next-line no-await-in-loop -- same
    if (name === "cookie") await checkVisitorCookie(slug, "prod");
  }
  check("prod: unknown slug 404", (await get("/v/no-such-page-xyz")).status === 404);
  say(failures ? `FAILED ${failures}` : "ALL OK");
  process.exit(failures ? 1 : 0);
}

// --- dev ---
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ baseURL: base });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`${page.url()} :: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()} :: ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});

/** A cold dev server reloads the page while Vite optimises dependencies: retry the visit. */
async function visit(path: string) {
  for (let i = 0; i < 6; i++) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retries
      await page.goto(path, { timeout: 120_000 });
      // oxlint-disable-next-line no-await-in-loop -- same
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
      return;
    } catch (error) {
      if (i === 5) throw error;
      // oxlint-disable-next-line no-await-in-loop -- same
      await page.waitForTimeout(3000);
    }
  }
}
await visit("/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin");
await page.waitForURL("**/_emdash/admin**", { timeout: 180_000 });
const adminText = await page
  .locator("body")
  .innerText({ timeout: 60_000 })
  .catch(() => "");
check("admin loads", page.url().includes("/_emdash/admin") && adminText.length > 0, page.url());
const welcome = page.getByRole("button", { name: "Get Started" });
const action = page.getByRole("button", { name: /^(Set up|Upgrade) EmVB$/ });
const ready = page.locator('[data-emvb-setup="ready"]');
// W-1096: a cold dev server reloads the admin when Vite optimises its dependencies, and the
// first load after that can stay on "Loading EmDash..." (as e2e/auth.setup.ts knows): load the
// page again, up to three times, until EmVB's setup screen shows.
for (let attempt = 1; ; attempt++) {
  // oxlint-disable-next-line no-await-in-loop -- one load after another
  await visit("/_emdash/admin/plugins/emvb/pages");
  // oxlint-disable-next-line no-await-in-loop -- same
  await welcome.waitFor({ timeout: 15_000 }).catch(() => undefined);
  // oxlint-disable-next-line no-await-in-loop -- same
  if (await welcome.isVisible()) await welcome.click();
  // oxlint-disable-next-line no-await-in-loop -- same
  const shown = await action
    .or(ready)
    .first()
    .waitFor({ timeout: 60_000 })
    .then(
      () => true,
      () => false,
    );
  if (shown) break;
  if (attempt === 3) throw new Error("EmVB's setup screen didn't show after three loads");
}
if (await action.isVisible()) await action.click();
await ready.waitFor({ timeout: 60_000 });
check("Set up EmVB: ready", true);

const req = context.request;
const api = async (method: string, path: string, body?: unknown) => {
  const res = await req.fetch(path, {
    method,
    headers: {
      "X-EmDash-Request": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { data: JSON.stringify(body) }),
  });
  return { status: res.status(), json: (await res.json().catch(() => null)) as unknown };
};
const publish = async (collection: string, id: string) => {
  const got = await api("GET", `/_emdash/api/content/${collection}/${id}`);
  return (
    await api("POST", `/_emdash/api/content/${collection}/${id}/publish`, {
      _rev: at(got.json, "data", "_rev"),
    })
  ).status;
};
const create = async (collection: string, data: Record<string, unknown>, slug: string) => {
  const res = await api("POST", `/_emdash/api/content/${collection}`, { data, slug });
  check(
    `create ${collection}/${slug}`,
    res.status === 201,
    `${res.status} ${res.status === 201 ? "" : JSON.stringify(res.json).slice(0, 300)}`,
  );
  return text(at(res.json, "data", "item", "id"));
};
const layout = (children: unknown[]) => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children },
});
const tag = Date.now().toString(36);

// Mega panel: a published Section theme part.
const sectionId = await create(
  "emvb_theme_parts",
  {
    title: `Mega ${tag}`,
    part_type: "section",
    layout: layout([{ id: "mgah0001", type: "heading", props: { text: "Boots mega", level: 2 } }]),
    conditions: { schemaVersion: 1, rules: [] },
  },
  `mega-${tag}`,
);
check("publish section part", (await publish("emvb_theme_parts", sectionId)) === 200);

/** A field of the forms plugin's form. */
const formField = (name: string, type: string) => ({
  id: `f_${name}`,
  type,
  label: name,
  name,
  required: false,
  width: "full",
});
let formId = "no-forms-plugin";
if (forms) {
  const res = await api("POST", "/_emdash/api/plugins/emdash-forms/forms/create", {
    name: `Trip ${tag}`,
    slug: `trip-${tag}`,
    pages: [{ fields: [formField("name", "text"), formField("guests", "number")] }],
    settings: {
      confirmationMessage: "Thanks",
      spamProtection: "none",
      submitLabel: "Book",
      notifyEmails: [],
      digestEnabled: false,
      digestHour: 9,
      retentionDays: 0,
    },
  });
  check("forms plugin: create form", res.status === 200, `${res.status}`);
  formId = text(at(res.json, "data", "id")) || formId;
}
const input = (id: string, field: string, label: string, extra = {}) => ({
  id,
  type: "text-input",
  props: { field, label, ...extra },
});
const children = [
  { id: "head0001", type: "heading", props: { text: "EmVB stock smoke", level: 1 } },
  {
    id: "menu0001",
    type: "menu",
    props: { direction: "row", label: "Primary" },
    children: [
      {
        id: "item0001",
        type: "menu-item",
        props: { text: "Products", panelPartId: sectionId, wide: true },
        children: [],
      },
      { id: "item0002", type: "menu-item", props: { text: "About", href: "/about" }, children: [] },
    ],
  },
  { id: "thme0001", type: "theme-toggle", props: {} },
  { id: "srch0001", type: "search-form", props: {} },
  {
    id: "form0001",
    type: "form",
    props: { formId, nextLabel: "Continue", prevLabel: "Back" },
    children: [
      {
        id: "step0001",
        type: "form-step",
        props: { title: "About you" },
        children: [input("inpt0001", "name", "Name")],
      },
      {
        id: "step0002",
        type: "form-step",
        props: { title: "Your trip" },
        children: [input("inpt0002", "guests", "Guests", { inputType: "number", min: 1 })],
      },
      { id: "subm0001", type: "submit", props: { label: "Book" } },
    ],
  },
  ...(ext
    ? [
        {
          id: "greet001",
          type: "ext:emvb-ext-hello/greeting",
          props: { text: "Hello from the stock smoke" },
        },
      ]
    : []),
];
const featuresSlug = `features-${tag}`;
const featuresId = await create(
  "emvb_pages",
  { title: "Features", layout: layout(children) },
  featuresSlug,
);
check("publish features page", (await publish("emvb_pages", featuresId)) === 200);
const plainSlug = `plain-${tag}`;
const plainId = await create(
  "emvb_pages",
  {
    title: "Plain",
    layout: layout([
      { id: "head0001", type: "heading", props: { text: "Plain page", level: 1 } },
      { id: "text0001", type: "text", props: { text: "No script here." } },
    ]),
  },
  plainSlug,
);
check("publish plain page", (await publish("emvb_pages", plainId)) === 200);

const feat = await get(`/v/${featuresSlug}`);
check("dev features: 200", feat.status === 200, `${feat.status}`);
checkFeaturePage(feat.html, "dev features");
await Bun.write(`${statePath}.features.html`, feat.html);
const plain = await get(`/v/${plainSlug}`);
check("dev plain: 200", plain.status === 200);
check("dev plain: no script", scripts(plain.html) === 0, `${scripts(plain.html)} <script>`);
check("dev: unknown slug 404", (await get("/v/no-such-page-xyz")).status === 404);

// --- 1.4.1 ---
const missingSlug = `missing-${tag}`;
const missingId = await create(
  "emvb_pages",
  {
    title: "Missing extension",
    layout: layout([
      { id: "head0001", type: "heading", props: { text: "Missing extension page", level: 1 } },
      { id: "gone0001", type: "ext:emvb-ext-gone/thing", props: { text: "Kept for later" } },
      { id: "text0001", type: "text", props: { text: "After the missing block" } },
    ]),
  },
  missingSlug,
);
check("publish missing-extension page", (await publish("emvb_pages", missingId)) === 200);
const missing = await get(`/v/${missingSlug}`);
check("dev missing ext: 200", missing.status === 200, `${missing.status}`);
checkMissingExtension(missing.html, "dev");

const cookieSlug = `cookie-${tag}`;
const cookieId = await create(
  "emvb_pages",
  {
    title: "Cookie",
    layout: layout([
      {
        id: "newv0001",
        type: "heading",
        props: { text: "Welcome new", level: 2 },
        audience: { visitor: "new" },
      },
      {
        id: "retv0001",
        type: "heading",
        props: { text: "Welcome back", level: 2 },
        audience: { visitor: "returning" },
      },
    ]),
  },
  cookieSlug,
);
check("publish cookie page", (await publish("emvb_pages", cookieId)) === 200);
await checkVisitorCookie(cookieSlug, "dev");

// Post image: upload through EmDash media, then store it on a post as EmDash's admin does when an
// editor picks an upload (no src; a storage key), as e2e/site-fixes-1.4.1.e2e.ts does.
const pixel = await Bun.file("e2e/fixtures/emvb-pixel.png").arrayBuffer();
const upload = await req.fetch("/_emdash/api/media", {
  method: "POST",
  headers: { "X-EmDash-Request": "1" },
  multipart: {
    file: { name: "emvb-pixel.png", mimeType: "image/png", buffer: Buffer.from(pixel) },
    width: "1",
    height: "1",
    alt: "Pixel",
  },
});
const uploaded = (await upload.json().catch(() => null)) as unknown;
const mediaId = text(at(uploaded, "data", "item", "id"));
const mediaUrl = text(at(uploaded, "data", "item", "url"));
check(
  "media upload",
  [200, 201].includes(upload.status()) && mediaId !== "",
  `${upload.status()} ${mediaUrl}`,
);
const storageKey = mediaUrl.replace(/^.*\/_emdash\/api\/media\/file\//, "");
const postTitle = `w1090-${tag}`;
const postId = await create(
  "posts",
  {
    title: postTitle,
    featured_image: {
      id: mediaId,
      provider: "local",
      filename: "emvb-pixel.png",
      mimeType: "image/png",
      meta: { storageKey },
    },
  },
  postTitle,
);
check("publish post", (await publish("posts", postId)) === 200);
const imageSrc = `/_emdash/api/media/file/${storageKey}`;
const postImageSlug = `post-image-${tag}`;
const postImageId = await create(
  "emvb_pages",
  {
    title: "Post image",
    layout: layout([
      {
        id: "loop0001",
        type: "loop",
        props: { collection: "posts", filter: `title=${postTitle}` },
        children: [{ id: "pimg0001", type: "post-image", props: {} }],
      },
    ]),
  },
  postImageSlug,
);
check("publish post image page", (await publish("emvb_pages", postImageId)) === 200);
await checkPostImage((await get(`/v/${postImageSlug}`)).html, "dev", imageSrc);

// Site styles: a `button` default (and an `a` default), published.
const draft = at((await api("GET", "/_emdash/api/plugins/emvb/design/draft")).json, "data");
const current = (at(draft, "design") ?? {}) as Record<string, unknown>;
const design = {
  ...current,
  defaults: {
    ...(current["defaults"] as Record<string, unknown> | undefined),
    button: { color: "#ffffff", backgroundColor: "#c81e1e" },
    a: { color: "#1f4fd1" },
  },
};
const saved = await api("POST", "/_emdash/api/plugins/emvb/design/save", {
  design,
  revision: at(draft, "revision"),
});
check(
  "save site styles with a button default",
  saved.status === 200,
  `${saved.status} ${saved.status === 200 ? "" : JSON.stringify(saved.json).slice(0, 300)}`,
);
const pubStyles = await api("POST", "/_emdash/api/plugins/emvb/design/publish", {
  publishedRevision: at(draft, "publishedRevision"),
});
check("publish site styles", pubStyles.status === 200, `${pubStyles.status}`);
const buttonSlug = `button-${tag}`;
const buttonId = await create(
  "emvb_pages",
  {
    title: "Button default",
    layout: layout([
      { id: "butn0001", type: "button", props: { text: "Book now", href: "/book" } },
      { id: "butn0002", type: "button", props: { text: "Plain button" } },
    ]),
  },
  buttonSlug,
);
check("publish button page", (await publish("emvb_pages", buttonId)) === 200);
await checkLinkButton(buttonSlug, "dev");

// Editor opens on the features page; the canvas shows the extension, not its placeholder.
await visit(`/_emdash/admin/plugins/emvb/editor?entry=${featuresId}`);
await page.locator("[data-emvb-editor] .emvb-topbar-title").waitFor({ timeout: 60_000 });
const canvas = page.frameLocator("iframe[data-emvb-canvas]");
await canvas.getByRole("heading", { name: "EmVB stock smoke" }).waitFor({ timeout: 30_000 });
check("editor opens with the page on the canvas", true);
if (ext) {
  const card = canvas.locator(".hello-card");
  await card
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  check(
    "canvas: extension renders",
    (await card.count()) > 0 && (await canvas.locator(".emvb-ext-missing").count()) === 0,
  );
}
await page.screenshot({ path: `${statePath}.editor.png` });

// New page from the Landing starter template, in the editor.
await visit("/_emdash/admin/plugins/emvb/pages");
await page.getByRole("button", { name: "New page", exact: true }).click();
await page.getByRole("combobox", { name: "Page template", exact: true }).click();
await page.getByRole("option", { name: /Landing page/ }).click();
await page.getByLabel("Title", { exact: true }).fill(`Landing ${tag}`);
await page.getByRole("button", { name: "Create page", exact: true }).click();
await page.locator("[data-emvb-editor]").waitFor({ timeout: 30_000 });
await canvas
  .getByRole("heading", { name: "Say what you do in one clear line" })
  .first()
  .waitFor({ timeout: 30_000 });
check("starter template opens in the editor", true);
const templateId = new URL(page.url()).searchParams.get("entry") ?? "";
const tpl = await api("GET", `/_emdash/api/content/emvb_pages/${templateId}`);
const templateSlug = text(at(tpl.json, "data", "item", "slug"));
check("publish template page", (await publish("emvb_pages", templateId)) === 200, templateSlug);
const tplPage = await get(`/v/${templateSlug}`);
check(
  "dev template: renders",
  tplPage.status === 200 && tplPage.html.includes("Say what you do in one clear line"),
);

// The public features page in a browser: no page errors, the toggle and the extension runtime run.
const pub = await browser.newPage();
const pubErrors: string[] = [];
pub.on("pageerror", (e) => pubErrors.push(e.message));
pub.on("console", (m) => {
  if (m.type() === "error") pubErrors.push(m.text());
});
pub.on("response", (r) => {
  if (r.status() >= 400) pubErrors.push(`${r.status()} ${r.url()}`);
});
await pub.goto(`${base}/v/${featuresSlug}`);
await pub
  .locator("[data-emvb-theme-toggle][data-emvb-ready]")
  .first()
  .waitFor({ timeout: 15_000 })
  .then(
    () => check("public: theme toggle script ran", true),
    () => check("public: theme toggle script ran", false),
  );
if (ext) {
  const readyCards = await pub.evaluate(() => document.querySelectorAll(".hello-card").length);
  check("public: extension card present", readyCards === 1, `${readyCards}`);
}
// Chromium's own /favicon.ico request (the bare test route has no icon link) never reaches
// Playwright's network events, only the console: a console 404 without a failed response is it.
const favicon = await fetch(`${base}/favicon.ico`).then((r) => r.status);
const pubReal = pubErrors.filter(
  (e) => !(favicon === 404 && /^Failed to load resource: .*404/.test(e)),
);
check(
  "public: no page errors",
  pubReal.length === 0,
  `${JSON.stringify(pubErrors).slice(0, 400)}; /favicon.ico ${favicon}`,
);
await pub.screenshot({ path: `${statePath}.public.png`, fullPage: true });

// Expected: EmVB's collection probes before setup (404) and Vite re-optimising a dev dependency
// ("504 Outdated Optimize Dep", the page reloads itself).
const relevant = errors.filter(
  (e) => !/404|Failed to load resource/.test(e) && !/^504 .*\/node_modules\/\.vite\/deps\//.test(e),
);
check(
  "admin/editor console errors (non-404)",
  relevant.length === 0,
  JSON.stringify(relevant).slice(0, 600),
);
say(`all console errors: ${JSON.stringify(errors)}`);
await Bun.write(
  statePath,
  JSON.stringify(
    {
      slugs: {
        features: featuresSlug,
        plain: plainSlug,
        template: templateSlug,
        missing: missingSlug,
        postImage: postImageSlug,
        button: buttonSlug,
        cookie: cookieSlug,
      },
      imageSrc,
    } satisfies State,
    null,
    2,
  ),
);
await browser.close();
say(failures ? `FAILED ${failures}` : "ALL OK");
process.exit(failures ? 1 : 0);
