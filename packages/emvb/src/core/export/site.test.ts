import { describe, expect, test } from "bun:test";
import { defaultElement } from "../elements/index.ts";
import { emptyDesign } from "../schema/design.ts";
import { LAYOUT_SCHEMA_VERSION, type Layout, type LayoutNode } from "../schema/layout.ts";
import { EXPORT_RUNTIMES } from "./runtimes.generated.ts";
import { buildSiteExport, mediaFileName, mediaUrls, pageFolder, withCopiedMedia } from "./site.ts";

const layout = (children: LayoutNode[]): Layout => ({
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  root: { id: "root0001", type: "container", props: {}, children },
});
const heading = (id: string, text: string, level = 1): LayoutNode => ({
  id,
  type: "heading",
  props: { text, level },
});
const tabs = (): LayoutNode =>
  ({
    ...defaultElement("tabs", "tabs0001"),
    children: [
      { id: "tabp0001", type: "tab-panel", props: { label: "One" }, children: [] },
      { id: "tabp0002", type: "tab-panel", props: { label: "Two" }, children: [] },
    ],
  }) as LayoutNode;
const entireSite = {
  schemaVersion: 1,
  rules: [{ id: "all", op: "include", group: "general", name: "entire_site", args: {} }],
};

const files = (out: ReturnType<typeof buildSiteExport>) =>
  new Map(out.files.map((f) => [f.path, typeof f.data === "string" ? f.data : ""]));

describe("buildSiteExport (W-963)", () => {
  const out = buildSiteExport({
    design: emptyDesign(),
    pages: [
      {
        id: "p1",
        title: "About us",
        slug: "about",
        layout: layout([
          heading("head0001", "About <us>"),
          {
            id: "imag0001",
            type: "image",
            props: { src: "/_emdash/api/media/file/a.jpg", alt: "A" },
          },
        ]),
        description: "Who we are",
      },
      { id: "p2", title: "Tabs", slug: "tabs", layout: JSON.stringify(layout([tabs()])) },
      { id: "p3", title: "Broken", slug: "broken", layout: { nope: true } },
    ],
    parts: [
      {
        id: "hdr",
        title: "Header",
        partType: "header",
        layout: layout([heading("hhead001", "Site header", 2)]),
        conditions: entireSite,
      },
      {
        id: "pop",
        title: "Promo",
        partType: "popup",
        layout: layout([heading("phead001", "Promo popup", 2)]),
        conditions: entireSite,
      },
    ],
    date: "2026-11-10",
  });
  const byPath = files(out);

  test("each page is a folder with index.html and style.css", () => {
    expect(byPath.has("about/index.html")).toBe(true);
    expect(byPath.has("about/style.css")).toBe(true);
    expect(byPath.has("tabs/index.html")).toBe(true);
    const about = byPath.get("about/index.html") ?? "";
    expect(about).toStartWith("<!doctype html>");
    expect(about).toContain("<title>About us</title>");
    expect(about).toContain('<meta name="description" content="Who we are">');
    expect(about).toContain("About &lt;us&gt;");
    expect(about).toContain('<link rel="stylesheet" href="style.css">');
  });

  test("the header and popup that match render with the page, and their scripts are linked", () => {
    const about = byPath.get("about/index.html") ?? "";
    expect(about).toContain('<header class="emvb-theme-header"');
    expect(about.indexOf("Site header")).toBeLessThan(about.indexOf("About &lt;us&gt;"));
    expect(about).toContain("Promo popup");
    expect(about).toContain('<script src="../assets/emvb-popups.js" defer></script>');
    expect(about.includes("emvb-tabs.js")).toBe(false);
    expect(byPath.get("about/style.css")).toContain(":where(.emvb-s-p1)");
  });

  test("runtime scripts are written once, only when a page uses them", () => {
    expect(byPath.get("tabs/index.html")).toContain("../assets/emvb-tabs.js");
    expect(byPath.get("assets/emvb-tabs.js")).toBe(EXPORT_RUNTIMES.tabs);
    expect(byPath.get("assets/emvb-popups.js")).toBe(EXPORT_RUNTIMES.popups);
    expect(byPath.has("assets/emvb-menu.js")).toBe(false);
    expect(byPath.has("assets/emvb-floats.js")).toBe(false);
  });

  test("no editor markup or scripts", () => {
    for (const [path, text] of byPath)
      if (path.endsWith(".html")) {
        expect(text.includes("data-emvb-node")).toBe(false);
        expect(text.includes("/_emdash/admin")).toBe(false);
      }
  });

  test("unreadable pages are reported, not exported", () => {
    expect(byPath.has("broken/index.html")).toBe(false);
    expect(out.report.skipped).toEqual([
      { title: "Broken", reason: "its layout couldn't be read" },
    ]);
    expect(out.report.pages.map((p) => p.path)).toEqual(["about/", "tabs/"]);
  });

  test("the index lists pages and the report lists media", () => {
    expect(byPath.get("index.html")).toContain('<a href="about/index.html">About us</a>');
    expect(out.report.media).toEqual(["/_emdash/api/media/file/a.jpg"]);
    const report = byPath.get("EXPORT-REPORT.md") ?? "";
    expect(report).toContain("Exported 2026-11-10.");
    expect(report).toContain("- /_emdash/api/media/file/a.jpg");
  });
});

test("snapshot-only parts are named in the report (W-963)", () => {
  const out = buildSiteExport({
    design: emptyDesign(),
    pages: [
      {
        id: "p1",
        title: "Blog",
        slug: "blog",
        layout: layout([
          { ...defaultElement("loop", "loop0001"), children: [] } as LayoutNode,
          {
            id: "form0001",
            type: "form",
            props: { formId: "contact" },
            children: [],
          } as LayoutNode,
        ]),
      },
    ],
    parts: [],
  });
  const whats = out.report.snapshots.map((s) => s.what).join("\n");
  expect(whats).toContain("Loops and post fields");
  expect(whats).toContain("Forms");
  expect(whats.includes("Audience")).toBe(false);
});

test("page folders are safe and unique", () => {
  const taken = new Set<string>();
  expect(pageFolder("About Us!", "1", taken)).toBe("about-us");
  expect(pageFolder("about-us", "2", taken)).toBe("about-us-2");
  expect(pageFolder("../..", "x/3", taken)).toBe("page-x3");
  expect(pageFolder("assets", "4", taken)).toBe("page-4");
});

test("media URLs come from src, srcset, poster and CSS url()", () => {
  expect(
    mediaUrls(
      '<img src="/a.png" srcset="/b.webp 1x, /c.webp 2x"><video poster="/p.jpg"></video><a href="/page">x</a><a href="/doc.pdf">d</a>',
      '.x{background-image:url("/bg.avif")}.y{background:url(data:image/png;base64,AA)}',
    ).toSorted(),
  ).toEqual(["/a.png", "/b.webp", "/bg.avif", "/c.webp", "/p.jpg"]);
});

test("S-06 (W-996): links and API URLs dressed as media aren't media", () => {
  expect(
    mediaUrls(
      '<a href="/doc.pdf">d</a><img src="/_emdash/api/admin/users?x=.png"><img src="/report.json#a.png"><img data-src="/z.png">',
      ".x{background:url(/_emdash/api/settings?.webp)}",
    ),
  ).toEqual([]);
  expect(mediaUrls('<img src="/_emdash/api/media/file/abc?w=200">', "")).toEqual([
    "/_emdash/api/media/file/abc?w=200",
  ]);
});

test("copied media go in media/ and pages point there (W-963)", () => {
  const out = buildSiteExport({
    design: emptyDesign(),
    pages: [
      {
        id: "p1",
        title: "Home",
        slug: "home",
        layout: layout([
          {
            id: "imag0001",
            type: "image",
            props: { src: "/_emdash/api/media/file/a b.jpg?v=1&w=2", alt: "A" },
          },
          { id: "imag0002", type: "image", props: { src: "https://cdn.example/x.png", alt: "X" } },
        ]),
      },
    ],
    parts: [],
  });
  const copied = withCopiedMedia(
    out,
    new Map([["/_emdash/api/media/file/a b.jpg?v=1&w=2", new Uint8Array([1, 2])]]),
  );
  const byPath = files(copied);
  const html = byPath.get("home/index.html") ?? "";
  expect(html).toContain('src="../media/a-b.jpg"');
  expect(html).toContain('src="https://cdn.example/x.png"');
  expect(copied.files.find((f) => f.path === "media/a-b.jpg")?.data).toEqual(
    new Uint8Array([1, 2]),
  );
});

test("media file names are safe and unique", () => {
  const taken = new Set<string>();
  expect(mediaFileName("/m/photo.jpg", taken)).toBe("photo.jpg");
  expect(mediaFileName("/n/photo.jpg?x", taken)).toBe("photo-2.jpg");
  expect(mediaFileName("/m/..%2F..%2Fetc", taken)).toBe("etc");
  expect(mediaFileName("/", taken)).toBe("file");
});

test("page titles and descriptions are escaped in the document head", () => {
  const out = buildSiteExport({
    design: emptyDesign(),
    pages: [
      {
        id: "p1",
        title: "</title><script>x</script>",
        slug: "x",
        layout: layout([]),
        description: '"><b>',
      },
    ],
    parts: [],
  });
  const html = files(out).get("x/index.html") ?? "";
  expect(html).toContain("<title>&lt;/title&gt;&lt;script&gt;x&lt;/script&gt;</title>");
  expect(html).toContain('content="&quot;&gt;&lt;b&gt;"');
  expect(html.includes("<script>x")).toBe(false);
});

describe("buildSiteExport writes widget runtimes (W-1025)", () => {
  const alert = (dismissible: boolean): LayoutNode =>
    ({
      id: "alrt0001",
      type: "alert",
      props: { variant: "info", text: "Saved.", ...(dismissible ? { dismissible } : {}) },
    }) as LayoutNode;
  const out = buildSiteExport({
    design: emptyDesign(),
    pages: [
      { id: "p1", title: "Closable", slug: "closable", layout: layout([alert(true)]) },
      { id: "p2", title: "Fixed", slug: "fixed", layout: layout([alert(false)]) },
    ],
    parts: [],
    date: "2026-11-12",
  });
  const byPath = files(out);

  test("a page with a dismissible Alert links the alerts script; one without doesn't", () => {
    expect(byPath.get("closable/index.html")).toContain(
      '<script src="../assets/emvb-alerts.js" defer></script>',
    );
    expect(byPath.get("fixed/index.html")?.includes("emvb-alerts.js")).toBe(false);
    expect(byPath.get("assets/emvb-alerts.js")).toBe(EXPORT_RUNTIMES.alerts);
    expect(EXPORT_RUNTIMES.alerts).toContain("data-emvb-alert-dismiss");
  });
});
