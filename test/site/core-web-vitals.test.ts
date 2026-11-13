import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import config, { INLINE_CSS_LIMIT } from "../../site/astro.config.ts";

const SITE = join(import.meta.dir, "../../site");
const read = (path: string) => readFileSync(join(SITE, path), "utf8");

test("W-1031: page stylesheets are inlined, the playground's large one stays a file", () => {
  const limit = config.vite?.build?.assetsInlineLimit;
  expect(typeof limit).toBe("function");
  const inline = limit as (file: string, content: Buffer) => boolean | undefined;
  expect(inline("_astro/Base.css", Buffer.alloc(16 * 1024))).toBe(true);
  expect(inline("_astro/index.css", Buffer.alloc(INLINE_CSS_LIMIT + 1))).toBe(false);
  expect(INLINE_CSS_LIMIT).toBeLessThan(322 * 1024);
  // Images, fonts and scripts keep Vite's own rule.
  expect(inline("_astro/font.woff2", Buffer.alloc(100))).toBeUndefined();
});

test("W-1031: hashed build files are cached for a year", () => {
  const block = read("public/_headers")
    .split(/\n(?=\S)/)
    .find((part) => part.startsWith("/_astro/*"));
  expect(block).toContain("Cache-Control: public, max-age=31536000, immutable");
});

test("W-1031: the hero's words are visible from the first frame (no fade from zero)", () => {
  const hero = read("src/components/Hero.astro");
  const rule = /\.intro > \* \{\s*animation:\s*([\w-]+)/.exec(hero);
  expect(rule?.[1]).toBeDefined();
  const frames = new RegExp(String.raw`@keyframes ${rule?.[1]} \{([\s\S]*?)\n  \}`).exec(hero)?.[1];
  expect(frames).toBeDefined();
  expect(frames).not.toContain("opacity");
});

test("W-1031: the playground loads the editor only when it opens", () => {
  const source = read("src/playground/Playground.tsx");
  expect(source).not.toMatch(/^import[^;]*admin\/editor\/Editor\.tsx/m);
  expect(source).toMatch(/React\.lazy\(\(\) =>\s*import\("[^"]*admin\/editor\/Editor\.tsx"\)/);
});

test("W-1031: on a small screen the playground's notice is in the page's HTML, worded as the island's", () => {
  const page = read("src/pages/playground/index.astro");
  const fallback =
    /<div slot="fallback">([\s\S]*?)\n {6}<\/div>\n {4}<\/Playground>/.exec(page)?.[1] ?? "";
  expect(fallback).toContain('class="pg-gate pg-gate--static"');
  expect(fallback).toContain("{SMALL_SCREEN_TITLE}");
  expect(fallback).toContain("{SMALL_SCREEN_TEXT}");
  const css = read("src/playground/playground.css");
  expect(css).toMatch(/@media \(max-width: 1023px\) \{\s*\.pg-gate--static \{\s*display: grid;/);
  const island = read("src/playground/Playground.tsx");
  expect(island).toContain("<h1>{SMALL_SCREEN_TITLE}</h1>");
  expect(island).toContain("<p>{SMALL_SCREEN_TEXT}</p>");
});
