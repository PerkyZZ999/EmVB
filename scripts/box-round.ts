/**
 * The automated box test round (W-943, W-1084; one command since W-1096): a page with the 1.4
 * features on the node demo (a sticky header that hides while scrolling, a mega menu, a Search
 * form, a Theme toggle, an off-canvas panel), every screen through axe (wcag2a/aa, serious and
 * critical), sideways overflow and console errors, at desktop 1440, laptop 1280 and phone 390,
 * light and dark; then the editor and admin screens. The hands-on part stays a checklist.
 *
 *   bun scripts/box-round.ts [--logs <dir>] [--port 6511] [--base <url of a running node demo>]
 *
 * Without --base it starts the node demo itself, on fresh data in the logs folder. Findings go to
 * <logs>/findings.json with a screenshot per screen. Exits non-zero on any defect other than the
 * known ones of EmDash's own admin (KNOWN).
 */
import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");
const option = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const out = resolve(option("logs") ?? join(ROOT, ".verify", "box"));
const port = Number(option("port") ?? 6511);
const given = option("base");
const base = given ?? `http://127.0.0.1:${port}`;
const executablePath = process.env["EMVB_CHROMIUM"] ?? "/usr/bin/chromium";
await mkdir(out, { recursive: true });

/** Findings in EmDash's own admin chrome, not EmVB's: noted, not failed. */
const KNOWN = [
  // EmDash's account button: its aria-label "Dev Admin" leaves out its visible initials.
  { where: /^admin pages /, rule: "label-content-name-mismatch", html: 'aria-label="Dev Admin"' },
];

/** A value deep in a JSON answer (`at(json, "data", "item", "id")`), or undefined. */
const at = (value: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (v, key) =>
      v !== null && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined,
    value,
  );
const px = (value: number) => ({ value, unit: "px" });
const layout = (children: unknown[]) => ({
  schemaVersion: 18,
  root: { id: "root0001", type: "container", props: {}, children },
});

type Finding = { kind: "ok" | "defect" | "note" | "known"; where: string; detail: string };
const findings: Finding[] = [];
const note = (kind: Finding["kind"], where: string, detail: string) => {
  findings.push({ kind, where, detail });
  process.stdout.write(`${kind.padEnd(6)} ${where}: ${detail}\n`);
};

async function upAt(url: string, seconds: number) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- polls until the server answers
      await fetch(url, { signal: AbortSignal.timeout(5000) });
      return true;
    } catch {
      // oxlint-disable-next-line no-await-in-loop -- same
      await Bun.sleep(1000);
    }
  }
  return false;
}

// The node demo on its own fresh data and Vite cache (EMVB_VITE_CACHE, if the caller set one).
const demo = given
  ? undefined
  : Bun.spawn(
      // --ignore-lock: Astro 7.4 allows one locked dev server per folder, and e2e runs may have one.
      [
        "setsid",
        "bun",
        "x",
        "astro",
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--ignore-lock",
      ],
      {
        cwd: join(ROOT, "demos/node"),
        env: {
          ...process.env,
          ASTRO_DEV_BACKGROUND: "1",
          EMVB_DEMO_DATA: join(out, "data"),
        },
        stdout: Bun.file(join(out, "demo.log")),
        stderr: "ignore",
      },
    );
const stopDemo = async () => {
  if (!demo) return;
  try {
    process.kill(-demo.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  await Promise.race([demo.exited, Bun.sleep(5000)]);
  try {
    process.kill(-demo.pid, "SIGKILL");
  } catch {
    // Already gone.
  }
};
if (demo) await mkdir(join(out, "data"), { recursive: true });
// Its own Vite cache (EMVB_VITE_CACHE) starts as a copy of the demo's usual one when that is newer,
// so the box round's server doesn't optimise every dependency again (W-1096).
const ownCache = process.env["EMVB_VITE_CACHE"];
if (demo && ownCache) {
  const meta = (dir: string) => join(ROOT, "demos/node", dir, "deps/_metadata.json");
  const mtime = (dir: string) => Bun.file(meta(dir)).lastModified;
  if (
    (await Bun.file(meta("node_modules/.vite")).exists()) &&
    (!(await Bun.file(meta(ownCache)).exists()) || mtime(ownCache) < mtime("node_modules/.vite"))
  ) {
    await rm(join(ROOT, "demos/node", ownCache), { recursive: true, force: true });
    await Bun.spawn([
      "cp",
      "-a",
      "--reflink=auto",
      join(ROOT, "demos/node/node_modules/.vite"),
      join(ROOT, "demos/node", ownCache),
    ]).exited;
  }
}
if (!(await upAt(`${base}/`, 300))) {
  await stopDemo();
  throw new Error(`the node demo didn't answer on ${base}`);
}

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ baseURL: base });
context.setDefaultTimeout(30_000);
const page = await context.newPage();
/** Runs one step; a failure is a finding, not the end of the round. */
async function step(where: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    note("defect", where, `step failed: ${String((error as Error).message).split("\n")[0]}`);
    await page
      .screenshot({ path: `${out}/${where.replaceAll(" ", "-")}-failed.png` })
      .catch(() => undefined);
  }
}
const consoleErrors: string[] = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`${page.url()} :: ${m.text()}`);
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror ${page.url()} :: ${e.message}`));

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

try {
  await visit("/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin");
  await page.waitForURL("**/_emdash/admin**", { timeout: 180_000 });
  await visit("/_emdash/admin/plugins/emvb/pages");
  const welcome = page.getByRole("button", { name: "Get Started" });
  await welcome.waitFor({ timeout: 15_000 }).catch(() => undefined);
  if (await welcome.isVisible()) await welcome.click();
  const action = page.getByRole("button", { name: /^(Set up|Upgrade) EmVB$/ });
  const ready = page.locator('[data-emvb-setup="ready"]');
  await action.or(ready).first().waitFor({ timeout: 120_000 });
  if (await action.isVisible()) await action.click();
  await ready.waitFor({ timeout: 60_000 });

  const api = async (method: string, path: string, body?: unknown) => {
    const res = await context.request.fetch(path, {
      method,
      headers: {
        "X-EmDash-Request": "1",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { data: JSON.stringify(body) }),
    });
    return { status: res.status(), json: (await res.json().catch(() => null)) as unknown };
  };
  const create = async (collection: string, data: Record<string, unknown>, slug: string) =>
    String(
      at(
        (await api("POST", `/_emdash/api/content/${collection}`, { data, slug })).json,
        "data",
        "item",
        "id",
      ) ?? "",
    );
  const publish = async (collection: string, id: string) => {
    const got = await api("GET", `/_emdash/api/content/${collection}/${id}`);
    return (
      await api("POST", `/_emdash/api/content/${collection}/${id}/publish`, {
        _rev: at(got.json, "data", "_rev"),
      })
    ).status;
  };
  const tag = Date.now().toString(36);

  const sectionId = await create(
    "emvb_theme_parts",
    {
      title: `Box mega ${tag}`,
      part_type: "section",
      layout: layout([
        { id: "mgah0001", type: "heading", props: { text: "Products", level: 2 } },
        { id: "mgal0001", type: "link", props: { text: "All products", href: "/products" } },
      ]),
      conditions: { schemaVersion: 1, rules: [] },
    },
    `box-mega-${tag}`,
  );
  await publish("emvb_theme_parts", sectionId);
  const panelTitle = `Box menu ${tag}`;
  const panelId = await create(
    "emvb_theme_parts",
    {
      title: panelTitle,
      part_type: "popup",
      layout: layout([{ id: "pnlh0001", type: "heading", props: { text: panelTitle, level: 2 } }]),
      conditions: {
        schemaVersion: 1,
        rules: [
          { id: "default-entire", op: "include", group: "general", name: "entire_site", args: {} },
        ],
      },
      triggers: {
        schemaVersion: 1,
        open: [{ type: "click", selector: `#open-${tag}` }],
        advanced: {},
        panel: { edge: "left", size: "narrow" },
      },
    },
    `box-panel-${tag}`,
  );
  await publish("emvb_theme_parts", panelId);

  const slug = `box-round-${tag}`;
  const pageId = await create(
    "emvb_pages",
    {
      title: "Box round",
      layout: layout([
        {
          id: "head0001",
          type: "container",
          props: {},
          style: {
            position: "sticky",
            top: px(0),
            backgroundColor: "#ffffff",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: px(16),
            motion: { sticky: { background: "#f4f4f5", hide: true, distance: 100 } },
          },
          children: [
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
                {
                  id: "item0002",
                  type: "menu-item",
                  props: { text: "About", href: "/about" },
                  children: [],
                },
              ],
            },
            { id: "srch0001", type: "search-form", props: {} },
            { id: "thme0001", type: "theme-toggle", props: {} },
            { id: "butn0001", type: "button", props: { text: "Menu" }, htmlId: `open-${tag}` },
          ],
        },
        { id: "h1000001", type: "heading", props: { text: "Box round", level: 1 } },
        {
          id: "text0001",
          type: "text",
          props: { text: "A page with the 1.4 elements for the box test round." },
        },
        { id: "spac0001", type: "spacer", props: { height: px(1200) } },
      ]),
    },
    slug,
  );
  await publish("emvb_pages", pageId);

  const audit = async (where: string, target: Page = page, legacy = false) => {
    // The editor canvas and template previews are sandboxed frames without scripts: axe can't run
    // in them and would wait for them forever, so it checks the page around them (as W-943 did).
    const axe = await Promise.race([
      new AxeBuilder({ page: target })
        .withTags(["wcag2a", "wcag2aa"])
        .setLegacyMode(legacy)
        .options({ iframes: false })
        .analyze(),
      Bun.sleep(90_000).then(() => {
        throw new Error("axe took over 90 s");
      }),
    ]);
    const bad = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const known = (v: (typeof bad)[number]) =>
      KNOWN.some(
        (k) =>
          k.where.test(where) && k.rule === v.id && v.nodes.every((n) => n.html.includes(k.html)),
      );
    const overflow = await target.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    if (overflow) {
      const wide = await target.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 6)
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`,
          ),
      );
      note("note", `${where} overflow`, wide.join(" | "));
    }
    const real = bad.filter((v) => !known(v));
    const detail = `axe ${bad.length} serious/critical${bad.length ? ` (${bad.map((v) => `${v.id}×${v.nodes.length}${known(v) ? " known" : ""}`).join(", ")})` : ""}, ${overflow ? "SIDEWAYS OVERFLOW" : "no overflow"}`;
    note(real.length || overflow ? "defect" : bad.length ? "known" : "ok", where, detail);
    for (const v of bad)
      for (const n of v.nodes.slice(0, 3))
        note(
          "note",
          `${where} ${v.id}`,
          `${n.target.join(" ")} :: ${n.html.slice(0, 160)} :: ${(n.failureSummary ?? "").replaceAll("\n", " ").slice(0, 200)}`,
        );
    await target.screenshot({ path: `${out}/${where.replaceAll(" ", "-")}.png` });
  };

  for (const [device, width] of [
    ["desktop", 1440],
    ["laptop", 1280],
    ["phone", 390],
  ] as const) {
    for (const scheme of ["light", "dark"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one screen after another
      await step(`public ${device} ${scheme}`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`/${slug}`);
        await page.getByRole("heading", { level: 1, name: "Box round" }).waitFor();
        await audit(`public ${device} ${scheme}`);
      });
    }
  }
  await page.emulateMedia({ colorScheme: "light" });

  // Mega panel by keyboard, then the off-canvas panel, at desktop.
  await step("public panels", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/${slug}`);
    const products = page
      .getByRole("navigation", { name: "Primary" })
      .locator("summary", { hasText: "Products" });
    await products.focus();
    await page.keyboard.press("Enter");
    const mega = page.locator(".emvb-menu-panel--mega");
    await mega
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(
        async () => {
          await audit("public mega panel open");
          await page.keyboard.press("Escape");
        },
        () => note("defect", "public mega panel", "did not open with Enter"),
      );
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: panelTitle });
    await dialog.waitFor({ state: "visible", timeout: 5000 }).then(
      async () => {
        await audit("public off-canvas panel open");
        await page.keyboard.press("Escape");
      },
      () => note("defect", "public off-canvas panel", "did not open"),
    );
  });
  // Theme toggle switches and remembers; the sticky header hides while scrolling down.
  await step("public toggle and sticky header", async () => {
    const theme = () =>
      page.evaluate(
        () =>
          document.documentElement.getAttribute("data-emvb-theme") ??
          document.documentElement.className,
      );
    await page.locator("[data-emvb-theme-toggle]").first().click();
    const after = await theme();
    await page.reload();
    const remembered = await theme();
    note(
      after === remembered ? "ok" : "defect",
      "public theme toggle",
      `after click "${after}", after reload "${remembered}"`,
    );
    await page.mouse.wheel(0, 600);
    const header = page.locator(".emvb-e-head0001");
    const away = await header
      .and(page.locator("[data-emvb-away]"))
      .waitFor({ timeout: 5000 })
      .then(
        () => true,
        () => false,
      );
    note(away ? "ok" : "defect", "public sticky header", "hidden while scrolling down");
  });

  // Editor: the page, the Add → Templates tab, light and dark.
  for (const scheme of ["light", "dark"] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme after the other
    await step(`editor ${scheme}`, async () => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/_emdash/admin/plugins/emvb/editor?entry=${pageId}`);
      const overlay = page.locator("[data-emvb-editor]");
      await overlay.locator(".emvb-topbar-title").waitFor({ timeout: 60_000 });
      await page
        .frameLocator("iframe[data-emvb-canvas]")
        .getByRole("heading", { name: "Box round" })
        .waitFor({ timeout: 30_000 });
      await page.waitForTimeout(800);
      await audit(`editor page ${scheme}`, page, true);
      await overlay.getByRole("tab", { name: "Add", exact: true }).click();
      await overlay
        .getByRole("tablist", { name: "Add" })
        .getByRole("tab", { name: "Templates" })
        .click();
      await page.waitForTimeout(800);
      await audit(`editor templates ${scheme}`, page, true);
    });
  }
  await page.emulateMedia({ colorScheme: "light" });

  // Admin: Pages list with New page (template picker) and Import HTML, desktop and phone.
  for (const [device, width] of [
    ["desktop", 1440],
    ["phone", 390],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one width after the other
    await step(`admin ${device}`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/_emdash/admin/plugins/emvb/pages");
      await page
        .getByRole("button", { name: "New page", exact: true })
        .waitFor({ timeout: 30_000 });
      await audit(`admin pages ${device}`);
      await page.getByRole("button", { name: "New page", exact: true }).click();
      await page
        .getByRole("combobox", { name: "Page template", exact: true })
        .waitFor({ timeout: 10_000 });
      // The dialog fades in; W-943 saw transient contrast hits before it settled.
      await page.waitForTimeout(800);
      await audit(`admin new page dialog ${device}`);
      await page.keyboard.press("Escape");
      const importHtml = page.getByRole("button", { name: /Import HTML/ });
      if (await importHtml.count()) {
        await importHtml.first().click();
        await page.waitForTimeout(800);
        await audit(`admin import html dialog ${device}`);
        await page.keyboard.press("Escape");
      } else note("note", `admin import html ${device}`, "no Import HTML button found");
    });
  }

  const emvbErrors = consoleErrors.filter(
    (e) => !/Failed to load resource|404|about:srcdoc/.test(e),
  );
  note(
    emvbErrors.length ? "defect" : "ok",
    "console",
    emvbErrors.length
      ? JSON.stringify(emvbErrors).slice(0, 1500)
      : `no errors (${consoleErrors.length} filtered 404/srcdoc lines)`,
  );
  await Promise.all(
    [panelId, sectionId].map((id) => api("DELETE", `/_emdash/api/content/emvb_theme_parts/${id}`)),
  );
  await Bun.write(
    `${out}/findings.json`,
    JSON.stringify({ slug, pageId, findings, consoleErrors }, null, 2),
  );
} finally {
  await browser.close();
  await stopDemo();
}
const defects = findings.filter((f) => f.kind === "defect");
process.stdout.write(
  `box round: ${defects.length} defects, ${findings.filter((f) => f.kind === "known").length} known (EmDash's own), ${findings.filter((f) => f.kind === "ok").length} ok; ${out}\n`,
);
process.exit(defects.length === 0 ? 0 : 1);
