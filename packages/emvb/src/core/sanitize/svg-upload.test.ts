import { describe, expect, test } from "bun:test";
import { ICON_SVG_MAX } from "../schema/layout.ts";
import { sanitizeSvgMarkup } from "./svg.ts";
import { prepareUploadedSvg, tidyUploadedSvg, UPLOAD_SVG_MAX_BYTES } from "./svg-upload.ts";

// W-239: an uploaded SVG is tidied, sanitized (W-073 / W-231), given a viewBox and capped.

const ok = (raw: string) => {
  const result = prepareUploadedSvg(raw);
  if (!result.ok) throw new Error(`refused: ${result.message}`);
  return result;
};
const refused = (raw: string) => {
  const result = prepareUploadedSvg(raw);
  if (result.ok) throw new Error(`kept: ${result.svg}`);
  return result.message;
};

describe("tidying a design tool's export (W-239)", () => {
  test("prolog, comments, doctype, metadata, title and editor namespaces go", () => {
    const raw = `\uFEFF<?xml version="1.0"?>
<!-- Generator: Adobe Illustrator -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY ns "x">]>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="s" xmlns:inkscape="i" viewBox="0 0 10 10" sodipodi:docname="a.svg">
<title>Logo</title><desc>made in Inkscape</desc>
<metadata><rdf:RDF><cc:Work/></rdf:RDF></metadata>
<sodipodi:namedview id="nv" pagecolor="#fff"/>
<inkscape:grid>x</inkscape:grid>
<g inkscape:label="Layer 1" inkscape:groupmode="layer"><path d="M0 0h10" fill="#f00"/></g>
</svg>`;
    expect(ok(raw).svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g><path d="M0 0h10" fill="#f00"></path></g></svg>',
    );
  });

  test("inline style paint becomes attributes; anything else in it is dropped", () => {
    const tidy = tidyUploadedSvg(
      '<svg viewBox="0 0 1 1"><path style="fill:#ff0000;stroke:none;stroke-width:2px;font-family:Arial;fill-opacity:0.5" d="M0 0"/><rect style="fill:url(#g)" width="1" height="1"/><rect fill="#00f" style="fill:#0f0;opacity:.5" width="1" height="1"/></svg>',
    );
    expect(tidy).toBe(
      '<svg viewBox="0 0 1 1"><path fill="#ff0000" stroke="none" stroke-width="2px" fill-opacity="0.5" d="M0 0"/><rect fill="url(#g)" width="1" height="1"/><rect fill="#00f" opacity=".5" width="1" height="1"/></svg>',
    );
  });

  test("a style can't smuggle a remote URL, script or expression in as an attribute", () => {
    for (const style of [
      "fill:url(https://evil.example/x.svg#a)",
      "fill:url(javascript:alert(1))",
      'fill:red" onload="alert(1)',
      "fill:expression(alert(1))",
    ]) {
      const raw = `<svg viewBox="0 0 1 1"><path style='${style}' d="M0 0"/></svg>`;
      const result = prepareUploadedSvg(raw);
      if (result.ok) {
        expect(result.svg).not.toMatch(/evil|javascript|onload|expression/i);
      } else {
        expect(result.message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("refusals say why (W-239)", () => {
  test("scripts, handlers, foreignObject and javascript: URLs", () => {
    const message =
      "This SVG contains scripts, event handlers or embedded HTML, so EmVB won't use it.";
    expect(refused('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>')).toBe(message);
    expect(refused('<svg viewBox="0 0 1 1" onload="alert(1)"><path d="M0 0"/></svg>')).toBe(
      message,
    );
    expect(
      refused(
        '<svg viewBox="0 0 1 1"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>',
      ),
    ).toBe(message);
    expect(
      refused('<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>'),
    ).toBe(message);
  });

  test("a <style> block, a file that isn't SVG, and broken markup", () => {
    expect(
      refused('<svg viewBox="0 0 1 1"><style>.a{fill:red}</style><path class="a" d="M0"/></svg>'),
    ).toContain("<style> block");
    expect(refused("<html><body>hi</body></html>")).toBe(
      "This file isn't an SVG. Choose an .svg file.",
    );
    expect(refused('<svg viewBox="0 0 1 1"><path d="M0 0"></svg>')).toContain("couldn't use");
  });

  test("an outside <image> is left out and counted; a media-library one stays", () => {
    const result = ok(
      '<svg viewBox="0 0 10 10"><image href="https://tracker.example/p.png" width="1" height="1"/><image href="/_emdash/api/media/file/a.png" width="1" height="1"/><path d="M0 0"/></svg>',
    );
    expect(result.imagesLeftOut).toBe(1);
    expect(result.svg).toContain("/_emdash/api/media/file/a.png");
    expect(result.svg).not.toContain("tracker");
  });
});

describe("viewBox and size (W-239)", () => {
  test("width and height become the viewBox, and the file's own size is dropped", () => {
    const result = ok('<svg width="48px" height="32" id="logo" class="x"><path d="M0 0"/></svg>');
    expect(result.svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32"><path d="M0 0"></path></svg>',
    );
    expect(ok('<svg width="5" height="5" viewBox="0 0 24 24"><path d="M0 0"/></svg>').svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0"></path></svg>',
    );
  });

  test("no viewBox and no px size can't scale", () => {
    expect(refused('<svg width="100%" height="2em"><path d="M0 0"/></svg>')).toContain(
      "no viewBox",
    );
    expect(refused('<svg><path d="M0 0"/></svg>')).toContain("no viewBox");
  });

  test("the file is capped at 256 KB and what's stored at ICON_SVG_MAX, with the sizes", () => {
    const padding = `<!--${"x".repeat(UPLOAD_SVG_MAX_BYTES)}-->`;
    expect(refused(`<svg viewBox="0 0 1 1">${padding}<path d="M0 0"/></svg>`)).toBe(
      "This file is 257 KB. Upload an SVG up to 256 KB.",
    );
    // Comments are tidied away, so a padded file under the cap is fine.
    const roomy = `<svg viewBox="0 0 1 1"><!--${"x".repeat(200_000)}--><path d="M0 0"/></svg>`;
    expect(ok(roomy).svg.length).toBeLessThan(100);
    const big = `<svg viewBox="0 0 1 1">${'<path d="M1 1h1"/>'.repeat(ICON_SVG_MAX / 16)}</svg>`;
    expect(refused(big)).toMatch(
      /^After cleaning, this SVG is \d+ KB; an icon can be up to 32 KB\./,
    );
  });

  test("an icon right at the cap still passes the render-time sanitizer", () => {
    const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">';
    const tail = "</svg>";
    const path = '<path d="M1 1h1"></path>';
    let body = path.repeat(Math.floor((ICON_SVG_MAX - head.length - tail.length) / path.length));
    body += " ".repeat(ICON_SVG_MAX - head.length - tail.length - body.length);
    const atCap = `${head}${body}${tail}`;
    expect(atCap.length).toBe(ICON_SVG_MAX);
    expect(ok(atCap).svg.length).toBeLessThanOrEqual(ICON_SVG_MAX);
    expect(sanitizeSvgMarkup(atCap)).toBeDefined();
  });
});
