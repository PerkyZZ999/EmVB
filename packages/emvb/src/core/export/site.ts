/**
 * The HTML/CSS export (W-963): published pages as static files a person can take to any host.
 * Pure: the admin loads the data, this renders it with the public renderer and lays out files.
 */
import {
  collectLoopItemPartIds,
  collectSectionPartIds,
  defaultConditions,
  defaultFloatSettings,
  defaultTriggers,
  escapeAttr,
  escapeText,
  FLOAT_CHROME_CSS,
  floatHasOwnSurface,
  hasBindings,
  listMatchingThemeParts,
  parseThemePartType,
  pickThemePartWinner,
  POPUP_CHROME_CSS,
  renderPage,
  validateConditions,
  validateFloatSettings,
  validateLayout,
  validateTriggers,
  wrapFloatMarkup,
  wrapPopupMarkup,
  type ConditionsDoc,
  type DesignSystem,
  type FloatSettings,
  type Layout,
  type LayoutNode,
  type ThemeDynamicData,
  type ThemePartCandidate,
  type ThemePartType,
  type ThemeRequestContext,
  type TriggersDoc,
} from "../index.ts";
import { someNode } from "../tree-ops.ts";
import { EXPORT_RUNTIMES } from "./runtimes.generated.ts";
import type { ZipEntry } from "./zip.ts";

/** A published page as the content API returns it. */
export type ExportPageInput = {
  id: string;
  title: string;
  slug: string;
  layout: unknown;
  description?: string;
  /** W-977: an entry of one of your collections: its public path and collection. */
  path?: string;
  collection?: string;
};

/** A published theme part as the content API returns it (`data` fields). */
export type ExportPartInput = {
  id: string;
  title: string;
  partType: unknown;
  layout: unknown;
  conditions?: unknown;
  triggers?: unknown;
  float?: unknown;
  updatedAt?: string;
};

export type ExportReport = {
  pages: { title: string; path: string }[];
  /** Pages left out: unreadable layout. */
  skipped: { title: string; reason: string }[];
  /** What the exported files show only as they were on export day, by page path. */
  snapshots: { path: string; what: string }[];
  /** Every image, video or file URL the exported pages use. */
  media: string[];
};

export type SiteExport = { files: ZipEntry[]; report: ExportReport };

type Part = {
  id: string;
  title: string;
  partType: ThemePartType;
  layout: Layout;
  conditions: ConditionsDoc;
  triggers: TriggersDoc;
  float: FloatSettings;
  updatedAt: string;
};

const blank = (raw: unknown) => raw === undefined || raw === null || raw === "";

function readLayout(raw: unknown): Layout | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  const result = validateLayout(value);
  return result.ok ? result.layout : null;
}

function readPart(input: ExportPartInput): Part | null {
  const partType = parseThemePartType(input.partType);
  const layout = readLayout(input.layout);
  if (!partType || !layout) return null;
  const conditions = validateConditions(
    blank(input.conditions) ? defaultConditions() : input.conditions,
  );
  const triggers = validateTriggers(blank(input.triggers) ? defaultTriggers() : input.triggers);
  const float = validateFloatSettings(blank(input.float) ? defaultFloatSettings() : input.float);
  if (!conditions.ok || (partType === "popup" && !triggers.ok)) return null;
  if (partType === "float" && !float.ok) return null;
  return {
    id: input.id,
    title: input.title,
    partType,
    layout,
    conditions: conditions.conditions,
    triggers: triggers.ok ? triggers.triggers : defaultTriggers(),
    float: float.ok ? float.settings : defaultFloatSettings(),
    updatedAt: input.updatedAt ?? "",
  };
}

/** A folder name for a page: its slug when safe, else its id. */
export function pageFolder(slug: string, id: string, taken: Set<string>): string {
  const clean = slug
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const base =
    clean && clean !== "assets" && clean !== "media" ? clean : `page-${id.replace(/\W/g, "")}`;
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base}-${n}`;
  taken.add(name);
  return name;
}

const has = (o: Record<string, Layout>) => Object.keys(o).length > 0;

/** Synced sections and loop item parts a layout uses, nested ones too (as the public site). */
function templatesFor(layout: Layout, parts: Map<string, Part>): ThemeDynamicData | undefined {
  const pick = (start: string[], type: ThemePartType) => {
    const out: Record<string, Layout> = {};
    const queue = [...start];
    const seen = new Set<string>();
    while (queue.length > 0 && seen.size < 32) {
      const id = queue.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const part = parts.get(id);
      if (!part || part.partType !== type) continue;
      out[id] = part.layout;
      queue.push(
        ...(type === "section"
          ? collectSectionPartIds(part.layout)
          : collectLoopItemPartIds(part.layout)),
      );
    }
    return out;
  };
  const loopTemplates = pick(collectLoopItemPartIds(layout), "loop_item");
  const sectionTemplates = pick(
    [layout, ...Object.values(loopTemplates)].flatMap((l) => collectSectionPartIds(l)),
    "section",
  );
  if (!has(loopTemplates) && !has(sectionTemplates)) return undefined;
  return {
    ...(has(loopTemplates) ? { loopTemplates } : {}),
    ...(has(sectionTemplates) ? { sectionTemplates } : {}),
  };
}

const DYNAMIC_TYPES = new Set([
  "loop",
  "pagination",
  "post-title",
  "post-excerpt",
  "post-content",
  "post-image",
  "post-date",
  "post-author",
  "post-link",
]);

/** What in these layouts the export can only show as it renders today, without live data. */
function snapshotNotes(layouts: Layout[]): string[] {
  const any = (test: (node: LayoutNode) => boolean) => layouts.some((l) => someNode(l.root, test));
  const notes: string[] = [];
  if (any((node) => DYNAMIC_TYPES.has(node.type)))
    notes.push(
      "Loops and post fields: lists of posts are empty, since they need the site's content.",
    );
  if (any((node) => hasBindings(node)))
    notes.push(
      "Bound fields: text and links bound to site settings, posts or the URL show their fallback.",
    );
  if (any((node) => node.audience !== undefined || node.variant !== undefined))
    notes.push(
      "Audience rules and A/B tests: every variant is in the HTML, but nothing chooses between them.",
    );
  if (any((node) => node.type === "form"))
    notes.push("Forms: the HTML is there, but sending needs a server (EmDash's forms plugin).");
  if (any((node) => node.type === "language-switcher"))
    notes.push("Language switcher: it lists no languages in a static export.");
  return notes;
}

// S-06 (W-996): only attributes that load media; a link's href is a page the visitor may open,
// and copying it fetched any same-origin URL (admin API answers included) into the zip.
const ATTR_URL = /\s(?:src|poster)="([^"]+)"/g;
const SRCSET = /\ssrcset="([^"]+)"/g;
const CSS_URL = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/g;
const MEDIA_EXT = /\.(?:avif|webp|png|jpe?g|gif|svg|ico|mp4|webm|ogg|mp3|pdf|woff2?)$/i;

/** S-06: the URL's path alone, so `?x=.png` can't make an API URL look like a media file. */
function pathOf(url: string): string {
  try {
    return new URL(url, "https://export.invalid/").pathname;
  } catch {
    return "";
  }
}

const unescapeAttr = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Media URLs in rendered HTML and CSS: images, video, audio, fonts, documents. */
export function mediaUrls(html: string, css: string): string[] {
  const found = new Set<string>();
  const add = (raw: string | undefined) => {
    const url = raw?.trim();
    if (!url || url.startsWith("#") || url.startsWith("data:")) return;
    if (/^(?:mailto|tel|javascript):/i.test(url)) return;
    const path = pathOf(url);
    const isMediaPath = path.startsWith("/_emdash/api/media/") || MEDIA_EXT.test(path);
    if (isMediaPath) found.add(url);
  };
  for (const m of html.matchAll(ATTR_URL)) add(unescapeAttr(m[1] ?? ""));
  for (const m of html.matchAll(SRCSET))
    for (const candidate of unescapeAttr(m[1] ?? "").split(","))
      add(candidate.trim().split(/\s+/)[0]);
  for (const m of css.matchAll(CSS_URL)) add(m[1] ?? m[2] ?? m[3]);
  return [...found];
}

const RUNTIME_FILES = {
  popups: "assets/emvb-popups.js",
  floats: "assets/emvb-floats.js",
  tabs: "assets/emvb-tabs.js",
  menu: "assets/emvb-menu.js",
  alerts: "assets/emvb-alerts.js",
  lightbox: "assets/emvb-lightbox.js",
} as const;

function documentHtml(opts: {
  title: string;
  description?: string;
  lang: string;
  dir?: string;
  css: string;
  body: string;
  scripts: string[];
}): string {
  return [
    "<!doctype html>",
    `<html lang="${escapeAttr(opts.lang)}"${opts.dir ? ` dir="${escapeAttr(opts.dir)}"` : ""}>`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(opts.title)}</title>`,
    ...(opts.description
      ? [`<meta name="description" content="${escapeAttr(opts.description)}">`]
      : []),
    `<link rel="stylesheet" href="${escapeAttr(opts.css)}">`,
    "</head>",
    "<body>",
    opts.body,
    ...opts.scripts.map((src) => `<script src="${escapeAttr(src)}" defer></script>`),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/**
 * The export's files: `<folder>/index.html` and `<folder>/style.css` per page, the runtime
 * scripts used, `index.html` listing the pages and `EXPORT-REPORT.md`.
 */
export function buildSiteExport(input: {
  pages: readonly ExportPageInput[];
  parts: readonly ExportPartInput[];
  design: DesignSystem;
  /** The document language; the site's own is best. */
  lang?: string;
  /** Exported on (ISO date), for the report. */
  date?: string;
}): SiteExport {
  const lang = input.lang ?? "en";
  const parts = new Map<string, Part>();
  for (const raw of input.parts) {
    const part = readPart(raw);
    if (part) parts.set(part.id, part);
  }
  const candidates: ThemePartCandidate[] = [...parts.values()].map((part) => ({
    id: part.id,
    partType: part.partType,
    conditions: part.conditions,
    updatedAt: part.updatedAt,
  }));
  const files: ZipEntry[] = [];
  const report: ExportReport = { pages: [], skipped: [], snapshots: [], media: [] };
  const media = new Set<string>();
  const runtimes = new Set<keyof typeof RUNTIME_FILES>();
  const taken = new Set<string>();

  const renderPart = (part: Part, scopeOnly = false) => {
    const result = renderPage(part.layout, input.design, {
      dynamic: templatesFor(part.layout, parts),
      scope: part.id,
      partIds: true,
      lang,
    });
    if (scopeOnly) return result;
    const ownLandmark = /<(?:header|footer)[\s>]/.test(result.html);
    const tag =
      !ownLandmark && (part.partType === "header" || part.partType === "footer")
        ? part.partType
        : "div";
    return {
      ...result,
      html: result.html
        ? `<${tag} class="emvb-theme-${part.partType}" data-emvb-theme-part="${escapeAttr(part.id)}">${result.html}</${tag}>`
        : "",
    };
  };

  for (const page of input.pages) {
    const layout = readLayout(page.layout);
    if (!layout) {
      report.skipped.push({ title: page.title, reason: "its layout couldn't be read" });
      continue;
    }
    const folder = pageFolder(page.slug, page.id, taken);
    const ctx: ThemeRequestContext = {
      path: page.path ?? `/${page.slug}`,
      isFront: false,
      is404: false,
      isSearch: false,
      kind: "singular",
      entryId: page.id,
      ...(page.collection ? { collection: page.collection } : {}),
    };
    const header = pickThemePartWinner(candidates, "header", ctx);
    const footer = pickThemePartWinner(candidates, "footer", ctx);
    const popups = listMatchingThemeParts(candidates, "popup", ctx);
    const floats = listMatchingThemeParts(candidates, "float", ctx);
    const partOf = (c: ThemePartCandidate | null) => (c ? parts.get(c.id) : undefined);

    const main = renderPage(layout, input.design, {
      dynamic: templatesFor(layout, parts),
      scope: page.id,
      lang,
    });
    const headerPart = partOf(header);
    const footerPart = partOf(footer);
    const top = headerPart ? renderPart(headerPart) : undefined;
    const bottom = footerPart ? renderPart(footerPart) : undefined;
    const popupRenders = popups.flatMap((match) => {
      const part = partOf(match);
      if (!part) return [];
      const result = renderPart(part, true);
      return [{ ...result, html: wrapPopupMarkup(part.id, result.html, part.triggers) }];
    });
    const floatRenders = floats.flatMap((match) => {
      const part = partOf(match);
      if (!part) return [];
      const result = renderPart(part, true);
      const surface = !floatHasOwnSurface(part.layout, input.design);
      return [
        {
          ...result,
          html: wrapFloatMarkup(part.id, part.title, result.html, part.float, surface),
        },
      ];
    });
    const all = [top, main, bottom, ...popupRenders, ...floatRenders].filter(
      (r): r is NonNullable<typeof r> => r !== undefined,
    );
    const css = [
      ...all.map((r) => r.css),
      ...(popupRenders.length > 0 ? [POPUP_CHROME_CSS] : []),
      ...(floatRenders.length > 0 ? [FLOAT_CHROME_CSS] : []),
    ]
      .filter(Boolean)
      .join("\n");
    const html = [
      top?.html,
      main.html,
      bottom?.html,
      ...popupRenders.map((r) => r.html),
      ...floatRenders.map((r) => r.html),
    ]
      .filter(Boolean)
      .join("\n");
    const used: (keyof typeof RUNTIME_FILES)[] = [];
    if (popupRenders.length > 0) used.push("popups");
    if (floatRenders.length > 0) used.push("floats");
    if (all.some((r) => r.needsTabsRuntime)) used.push("tabs");
    if (all.some((r) => r.needsMenuRuntime)) used.push("menu");
    // W-1025: the widget runtimes a page asked for.
    for (const name of new Set(all.flatMap((r) => r.runtimes))) used.push(name);
    for (const name of used) runtimes.add(name);

    files.push(
      {
        path: `${folder}/index.html`,
        data: documentHtml({
          title: page.title,
          ...(page.description ? { description: page.description } : {}),
          lang,
          ...(input.design.direction ? { dir: input.design.direction } : {}),
          css: "style.css",
          body: html,
          scripts: used.map((name) => `../${RUNTIME_FILES[name]}`),
        }),
      },
      { path: `${folder}/style.css`, data: `${css}\n` },
    );
    for (const url of mediaUrls(html, css)) media.add(url);
    const layouts = [
      layout,
      ...[headerPart, footerPart, ...popups.map(partOf), ...floats.map(partOf)]
        .filter((p): p is Part => p !== undefined)
        .map((p) => p.layout),
    ];
    for (const what of snapshotNotes(layouts)) report.snapshots.push({ path: `${folder}/`, what });
    report.pages.push({ title: page.title, path: `${folder}/` });
  }

  for (const name of runtimes)
    files.push({ path: RUNTIME_FILES[name], data: EXPORT_RUNTIMES[name] });
  report.media = [...media].toSorted();
  files.push(
    {
      path: "index.html",
      data: documentHtml({
        title: "Exported pages",
        lang,
        css: "assets/export-index.css",
        body: [
          "<main>",
          "<h1>Exported pages</h1>",
          "<ul>",
          ...report.pages.map(
            (p) => `<li><a href="${escapeAttr(p.path)}index.html">${escapeText(p.title)}</a></li>`,
          ),
          "</ul>",
          "<p>See EXPORT-REPORT.md for what changed in the export.</p>",
          "</main>",
        ].join("\n"),
        scripts: [],
      }),
    },
    {
      path: "assets/export-index.css",
      data: "body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem}\n",
    },
    { path: "EXPORT-REPORT.md", data: reportMarkdown(report, input.date) },
  );
  return { files, report };
}

function reportMarkdown(report: ExportReport, date?: string): string {
  const lines = [
    "# EmVB export report",
    "",
    ...(date ? [`Exported ${date}.`, ""] : []),
    "Each page is a folder with `index.html` and `style.css`: plain HTML and CSS, the same markup",
    "your site served. Scripts are included only for popups, floats, tabs and menu dropdowns.",
    "",
    `## Pages (${report.pages.length})`,
    "",
    ...report.pages.map((p) => `- ${p.title}: \`${p.path}\``),
    "",
  ];
  if (report.skipped.length > 0)
    lines.push(
      "## Not exported",
      "",
      ...report.skipped.map((s) => `- ${s.title}: ${s.reason}`),
      "",
    );
  if (report.snapshots.length > 0)
    lines.push(
      "## Snapshot only",
      "",
      "These parts need the live site, so the export shows them as they render without it:",
      "",
      ...report.snapshots.map((s) => `- \`${s.path}\`: ${s.what}`),
      "",
    );
  lines.push(
    "## Links and media",
    "",
    "Links between pages keep the paths they had on your site. Media files are listed here; if you",
    "chose to copy them, they are in `media/` and the pages point there.",
    "",
    ...(report.media.length > 0 ? report.media.map((url) => `- ${url}`) : ["- None"]),
    "",
  );
  return lines.join("\n");
}

/** A file name for a copied media URL: its last path segment, made safe and unique. */
export function mediaFileName(url: string, taken: Set<string>): string {
  const path = url.split(/[?#]/)[0] ?? "";
  const last = decodeURIComponentSafe(path.split("/").pop() ?? "");
  const clean =
    last
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[.-]+/, "")
      .slice(-100) || "file";
  const dot = clean.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
  let name = clean;
  for (let n = 2; taken.has(name); n += 1) name = `${stem}-${n}${ext}`;
  taken.add(name);
  return name;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The export with copied media: each copy goes in `media/` and every page's HTML and CSS points
 * there instead of the old site. URLs without a copy stay as they were.
 */
export function withCopiedMedia(
  site: SiteExport,
  copies: ReadonlyMap<string, Uint8Array>,
): SiteExport {
  if (copies.size === 0) return site;
  const taken = new Set<string>();
  const names = new Map([...copies.keys()].map((url) => [url, mediaFileName(url, taken)]));
  // Longest first, so `/a.png` never rewrites part of `/a.png.webp`.
  const urls = [...names.keys()].toSorted((a, b) => b.length - a.length);
  const rewrite = (text: string) => {
    let out = text;
    for (const url of urls) {
      const local = `../media/${names.get(url)}`;
      out = out.split(escapeAttr(url)).join(local).split(url).join(local);
    }
    return out;
  };
  const files = site.files.map((file) =>
    typeof file.data === "string" &&
    /^[^/]+\/(?:index\.html|style\.css)$/.test(file.path) &&
    !file.path.startsWith("assets/")
      ? { ...file, data: rewrite(file.data) }
      : file,
  );
  for (const [url, data] of copies) files.push({ path: `media/${names.get(url)}`, data });
  return { files, report: site.report };
}
