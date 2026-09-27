import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import EmVBPage from "../../src/astro/EmVBPage.astro";
import { renderPage, type DesignSystem } from "../../src/core/index.ts";
import { XSS_CORPUS } from "../fixtures/xss.ts";
import { heading, s1Page } from "../fixtures/layouts.ts";

const DESIGN: DesignSystem = {
  schemaVersion: 1,
  variables: { colors: [{ id: "brand", name: "Brand", value: "#123456" }] },
};

const pageOf = (layout: ReturnType<typeof s1Page>) => {
  const { html, css, needsFormsRuntime } = renderPage(layout, DESIGN);
  return { html, css, needsFormsRuntime };
};

test("EmVBPage emits exactly the core CSS and HTML (A-08, R-031)", async () => {
  const container = await AstroContainer.create();
  const page = pageOf(s1Page());
  const output = await container.renderToString(EmVBPage, { props: { page } });
  expect(output).toBe(`<style>${page.css}</style>${page.html}`);
  expect(output).not.toContain("<script");
});

test("hostile text reaches the page escaped once, exactly as the core wrote it", async () => {
  const container = await AstroContainer.create();
  const pages = XSS_CORPUS.map((text) => {
    const layout = s1Page();
    layout.root.children = [heading("head0001", text, 2)];
    return pageOf(layout);
  });
  const outputs = await Promise.all(
    pages.map((page) => container.renderToString(EmVBPage, { props: { page } })),
  );
  expect(outputs).toEqual(pages.map((page) => `<style>${page.css}</style>${page.html}`));
});

test("blank canvas mode renders a whole document with the page's title and no scripts", async () => {
  const container = await AstroContainer.create();
  const page = pageOf(s1Page());
  const output = await container.renderToString(EmVBPage, {
    props: { page, standalone: true, title: "Pricing & plans", description: "Our plans" },
  });
  expect(output.startsWith('<html lang="en">')).toBe(true);
  expect(output).toContain("<title>Pricing &amp; plans</title>");
  expect(output).toContain('<meta name="description" content="Our plans">');
  expect(output).toContain(`<style>${page.css}</style>`);
  expect(output).toContain(`<body>${page.html}</body>`);
  expect(output).not.toContain("<script");
});
