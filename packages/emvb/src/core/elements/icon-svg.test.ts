import { describe, expect, test } from "bun:test";
import { droppedNotice, prepareElement } from "../clipboard.ts";
import { renderPage } from "../render/index.ts";
import { emptyDesign } from "../schema/design.ts";
import { ICON_SVG_MAX, type Layout, type LayoutNode } from "../schema/layout.ts";
import { validateLayout } from "../validate.ts";

const ROCKET =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M128 320L24.5 320z"/></svg>';
const icon = (props: Record<string, unknown>): LayoutNode =>
  ({ id: "icon0001", type: "icon", props: { size: 32, ...props } }) as LayoutNode;
const page = (node: LayoutNode): Layout =>
  ({
    schemaVersion: 12,
    root: { id: "root0001", type: "container", props: {}, children: [node] },
  }) as unknown as Layout;
const html = (props: Record<string, unknown>) => renderPage(page(icon(props)), emptyDesign()).html;
const svgOf = (markup: string) => markup.match(/<svg[^>]*>[\s\S]*?<\/svg>/)?.[0] ?? "";

describe("library icons render their stored SVG (W-234)", () => {
  test("the stored SVG keeps its viewBox and fill; the element sets size and name", () => {
    const svg = svgOf(html({ iconId: "fa-solid:rocket", iconSvg: ROCKET, title: "Rocket" }));
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain('fill="currentColor"');
    expect(svg).toContain('width="32" height="32"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Rocket"');
    expect(svg).toContain('<path d="M128 320L24.5 320z"></path>');
    expect(svg).not.toContain('stroke="currentColor"');
  });

  test("size, name and id attributes in the stored SVG are replaced, not doubled", () => {
    const stored =
      '<svg viewBox="0 0 24 24" width="999" height="999" id="x" role="presentation" aria-label="Spoof" aria-hidden="false" focusable="true"><path d="M1 1h2"/></svg>';
    const svg = svgOf(html({ iconId: "tabler:x", iconSvg: stored, decorative: true }));
    expect(svg).toContain('width="32" height="32"');
    expect(svg).not.toContain("999");
    expect(svg).not.toContain('id="x"');
    expect(svg).not.toContain("Spoof");
    expect(svg).not.toContain("presentation");
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  test("an SVG without a viewBox gets the 24-unit grid", () => {
    expect(
      svgOf(
        html({
          iconId: "lucide:dot",
          iconSvg: '<svg><circle cx="12" cy="12" r="1"/></svg>',
          decorative: true,
        }),
      ),
    ).toContain('viewBox="0 0 24 24"');
  });

  test("a linked library icon hides its svg and names the link", () => {
    const out = html({ iconId: "fa-solid:rocket", iconSvg: ROCKET, title: "Launch", href: "/go" });
    expect(out).toContain('aria-label="Launch"');
    expect(svgOf(out)).toContain('aria-hidden="true"');
    expect(svgOf(out)).toContain('viewBox="0 0 512 512"');
  });

  test("an unsafe stored SVG is never rendered: a bundled id falls back, anything else is a placeholder", () => {
    const evil = "<svg><script>alert(1)</script></svg>";
    const fallback = html({ iconId: "star", iconSvg: evil, title: "Star" });
    expect(fallback).not.toContain("script");
    expect(svgOf(fallback)).toContain('stroke="currentColor"');
    const missing = html({ iconId: "fa-solid:rocket", iconSvg: evil, title: "Rocket" });
    expect(missing).toContain("emvb-icon-missing");
    expect(missing).not.toContain("<svg");
  });

  test("an external image inside the stored SVG is left out (W-231)", () => {
    const out = html({
      iconId: "lucide:x",
      iconSvg:
        '<svg viewBox="0 0 24 24"><image href="https://track.example/p.gif"/><path d="M1 1h2"/></svg>',
      decorative: true,
    });
    expect(out).not.toContain("track.example");
    expect(out).toContain('<path d="M1 1h2">');
  });

  test("bundled ids without SVG render as before", () => {
    const svg = svgOf(html({ iconId: "star", title: "Star" }));
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="currentColor"');
    expect(html({ iconId: "lucide:rocket", title: "Rocket" })).toContain("emvb-icon-missing");
  });

  test("iconSvg is optional and capped", () => {
    expect(validateLayout(page(icon({ iconId: "star", title: "Star" }))).ok).toBe(true);
    expect(
      validateLayout(page(icon({ iconId: "fa-solid:rocket", iconSvg: ROCKET, title: "R" }))).ok,
    ).toBe(true);
    const big = `<svg>${'<path d="M1 1"/>'.repeat(ICON_SVG_MAX / 10)}</svg>`;
    expect(validateLayout(page(icon({ iconId: "x:y", iconSvg: big, title: "R" }))).ok).toBe(false);
  });

  test("paste keeps a safe icon SVG and drops an unsafe one, saying so", () => {
    const safe = prepareElement(
      icon({ iconId: "fa-solid:rocket", iconSvg: ROCKET, title: "R" }),
      page(icon({ iconId: "star", title: "S" })),
      emptyDesign(),
    );
    expect((safe.node.props as { iconSvg?: string }).iconSvg).toBe(ROCKET);
    expect(droppedNotice(safe.dropped)).toBeNull();
    const bad = prepareElement(
      icon({ iconId: "fa-solid:rocket", iconSvg: '<svg onload="x()"></svg>', title: "R" }),
      page(icon({ iconId: "star", title: "S" })),
      emptyDesign(),
    );
    expect((bad.node.props as { iconSvg?: string }).iconSvg).toBeUndefined();
    expect((bad.node.props as { iconId?: string }).iconId).toBe("fa-solid:rocket");
    expect(bad.dropped.unsafe).toBe(1);
    const pixel = prepareElement(
      icon({
        iconId: "lucide:x",
        iconSvg: '<svg><image href="https://t.example/p.gif"/><path d="M1 1"/></svg>',
        title: "R",
      }),
      page(icon({ iconId: "star", title: "S" })),
      emptyDesign(),
    );
    expect((pixel.node.props as { iconSvg?: string }).iconSvg).not.toContain("t.example");
    expect(droppedNotice(pixel.dropped)).toBe("Left out 1 external image.");
  });
});
