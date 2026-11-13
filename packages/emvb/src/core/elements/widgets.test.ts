import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, validateLayout, type LayoutNode } from "../index.ts";

const page = (...children: unknown[]) =>
  validateLayout({
    schemaVersion: 18,
    root: { id: "root0001", type: "container", props: {}, children },
  });

function render(...children: unknown[]) {
  const result = page(...children);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return renderPage(result.layout, emptyDesign()).html;
}

const rating = (props: Record<string, unknown>, extra: Partial<LayoutNode> = {}) => ({
  id: "rate0001",
  type: "rating",
  props,
  ...extra,
});

describe("Star rating (W-1023)", () => {
  test("names the rating for screen readers and hides the stars", () => {
    const html = render(rating({ value: 4.5 }));
    expect(html).toContain('role="img" aria-label="Rated 4.5 out of 5"');
    expect(html.match(/class="emvb-rating-star"/g)).toHaveLength(5);
    expect(html.match(/<svg [^>]*aria-hidden="true"/g)?.length).toBe(10);
  });

  test("full stars are whole, the half star is cut by its viewBox, empty ones have no fill", () => {
    const html = render(rating({ value: 2.5, max: 4, size: 20 }));
    const fills = [
      ...html.matchAll(
        /class="emvb-rating-fill" width="([\d.]+)" height="20" viewBox="0 0 ([\d.]+) 24"/g,
      ),
    ];
    expect(fills.map((m) => [m[1], m[2]])).toEqual([
      ["20", "24"],
      ["20", "24"],
      ["10", "12"],
    ]);
    expect(html.match(/class="emvb-rating-empty"/g)).toHaveLength(4);
  });

  test("the label template fills in the value and the number of stars", () => {
    expect(render(rating({ value: 3, max: 10, label: "{value}/{max} stars" }))).toContain(
      'aria-label="3/10 stars"',
    );
    expect(render(rating({ value: 4.25 }))).toContain('aria-label="Rated 4.3 out of 5"');
  });

  test("a value above the number of stars shows as full stars; bad numbers are refused", () => {
    expect(render(rating({ value: 6 }))).toContain('aria-label="Rated 5 out of 5"');
    expect(page(rating({ value: 1, max: 2.5 })).ok).toBe(false);
    expect(page(rating({ value: -1 })).ok).toBe(false);
    expect(page(rating({ value: 4, max: 11 })).ok).toBe(false);
    expect(page(rating({ value: 11 })).ok).toBe(false);
  });

  test("right to left, the part-filled star fills from the right", () => {
    const result = page(rating({ value: 1.5, max: 2 }, { dir: "rtl" } as Partial<LayoutNode>));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { html, css } = renderPage(result.layout, emptyDesign());
    expect(html).toContain('dir="rtl"');
    expect(css).toContain(
      ".emvb-rating[dir=rtl] .emvb-rating-fill{left:auto;right:0;transform:scaleX(-1)}",
    );
  });
});

const alertNode = (props: Record<string, unknown>) => ({
  id: "alrt0001",
  type: "alert",
  props: { variant: "info", text: "Backups run nightly.", ...props },
});

describe("Alert (W-1025)", () => {
  test("a note with its icon, title and text, in the variant's colours", () => {
    const result = page(alertNode({ variant: "warning", title: "Heads up" }));
    if (!result.ok) throw new Error("invalid");
    const { html, css, runtimes } = renderPage(result.layout, emptyDesign());
    expect(html).toContain('class="emvb-alert emvb-alert-warning" role="note"');
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" class="emvb-alert-icon"');
    expect(html).toContain(
      '<div class="emvb-alert-body"><p class="emvb-alert-title">Heads up</p><p class="emvb-alert-text">Backups run nightly.</p></div>',
    );
    expect(css).toContain(
      ".emvb-alert-warning{color:#5c3b00;background-color:#fff7e0;border-color:#f5d48a}",
    );
    expect(html.includes("<button")).toBe(false);
    expect(runtimes).toEqual([]);
  });

  test("hideIcon drops the icon; an empty title is left out; text is escaped", () => {
    const html = render(alertNode({ hideIcon: true, title: "  ", text: "<script>x</script>" }));
    expect(html.includes("emvb-alert-icon")).toBe(false);
    expect(html.includes("emvb-alert-title")).toBe(false);
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  test("dismissible adds a named close button and asks for the alerts runtime", () => {
    const result = page(alertNode({ dismissible: true, dismissLabel: "Close notice" }));
    if (!result.ok) throw new Error("invalid");
    const { html, css, runtimes } = renderPage(result.layout, emptyDesign());
    expect(html).toContain(
      '<button type="button" class="emvb-alert-dismiss" data-emvb-alert-dismiss="" aria-label="Close notice">',
    );
    // Without the script, the button stays out of sight.
    expect(css).toContain(".emvb-alert-dismiss:not([data-emvb-ready]){display:none}");
    // The runtime hides a dismissed Alert with the hidden attribute, which display:flex would beat.
    expect(css).toContain(".emvb-alert[hidden]{display:none}");
    expect(runtimes).toEqual(["alerts"]);
    expect(render(alertNode({ dismissible: true }))).toContain('aria-label="Dismiss"');
  });

  test("only the four kinds are accepted", () => {
    expect(page(alertNode({ variant: "error" })).ok).toBe(false);
    for (const variant of ["info", "success", "warning", "danger"])
      expect(page(alertNode({ variant })).ok).toBe(true);
  });
});

const iconBoxNode = (props: Record<string, unknown>) => ({
  id: "ibox0001",
  type: "icon-box",
  props: { iconId: "star", title: "Fast", text: "Pages load quickly.", ...props },
});

describe("Icon box (W-1020)", () => {
  test("the icon above an h3 title and the text; the icon is hidden from screen readers", () => {
    const html = render(iconBoxNode({}));
    expect(html).toContain('class="emvb-icon-box emvb-media-box emvb-media-box-top"');
    expect(html).toMatch(
      /<div class="emvb-media-box-media"><svg [^>]*width="48" height="48"[^>]*aria-hidden="true"/,
    );
    expect(html).toContain(
      '<div class="emvb-media-box-content"><h3 class="emvb-media-box-title">Fast</h3><p class="emvb-media-box-text">Pages load quickly.</p></div>',
    );
  });

  test("position, title level and icon size are used; empty words are left out", () => {
    const html = render(iconBoxNode({ position: "left", titleLevel: 4, iconSize: 32, text: " " }));
    expect(html).toContain("emvb-media-box-left");
    expect(html).toContain('<h4 class="emvb-media-box-title">Fast</h4>');
    expect(html).toMatch(/width="32" height="32"/);
    expect(html.includes("emvb-media-box-text")).toBe(false);
  });

  test("a link makes the title the one link, stretched over the whole box", () => {
    const result = page(iconBoxNode({ href: "/features", newTab: true }));
    if (!result.ok) throw new Error("invalid");
    const { html, css } = renderPage(result.layout, emptyDesign());
    expect(html).toContain("emvb-media-box-linked");
    expect(html).toContain(
      '<h3 class="emvb-media-box-title"><a class="emvb-media-box-link" href="/features" target="_blank" rel="noopener noreferrer">Fast</a></h3>',
    );
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(css).toContain('.emvb-media-box-link::after{content:"";position:absolute;inset:0}');
    expect(css).toContain(".emvb-media-box-linked{position:relative}");
  });

  test("an unsafe link is dropped; an unknown icon leaves no media box", () => {
    const html = render(iconBoxNode({ href: "javascript:alert(1)", iconId: "no-such-icon" }));
    expect(html.includes("<a ")).toBe(false);
    expect(html.includes("emvb-media-box-linked")).toBe(false);
    expect(html.includes("emvb-media-box-media")).toBe(false);
  });

  test("an icon box needs an icon id; level 1 titles are refused", () => {
    expect(page(iconBoxNode({ iconId: "" })).ok).toBe(false);
    expect(page(iconBoxNode({ titleLevel: 1 })).ok).toBe(false);
  });
});

const imageBoxNode = (props: Record<string, unknown>) => ({
  id: "imbx0001",
  type: "image-box",
  props: {
    src: "/_emdash/api/media/file/team.jpg",
    alt: "Our team at the office",
    width: 1200,
    height: 800,
    title: "People",
    text: "Who we are.",
    ...props,
  },
});

describe("Image box (W-1021)", () => {
  test("the picture with its alt and size, lazy, above the title and text", () => {
    const html = render(imageBoxNode({}));
    expect(html).toContain('class="emvb-image-box emvb-media-box emvb-media-box-top"');
    expect(html).toContain(
      '<div class="emvb-media-box-media"><img src="/_emdash/api/media/file/team.jpg" alt="Our team at the office" width="1200" height="800" loading="lazy" decoding="async"></div>',
    );
    expect(html).toContain('<h3 class="emvb-media-box-title">People</h3>');
  });

  test("decorative pictures have empty alt; image width beside the words is a class", () => {
    const html = render(imageBoxNode({ decorative: true, position: "right", imageSize: "small" }));
    expect(html).toContain('alt=""');
    expect(html).toContain("emvb-media-box-right emvb-image-box-small");
    expect(render(imageBoxNode({ imageSize: "medium" })).includes("emvb-image-box-medium")).toBe(
      false,
    );
  });

  test("no picture or an unsafe address leaves no media part; alt is required", () => {
    expect(render(imageBoxNode({ src: "" })).includes("emvb-media-box-media")).toBe(false);
    expect(render(imageBoxNode({ src: "javascript:alert(1)" })).includes("<img")).toBe(false);
    expect(page(imageBoxNode({ alt: "" })).ok).toBe(false);
    expect(page(imageBoxNode({ alt: "", decorative: true })).ok).toBe(true);
  });

  test("a link stretches over the box, picture included", () => {
    const html = render(imageBoxNode({ href: "https://example.com/team" }));
    expect(html).toContain("emvb-media-box-linked");
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});
