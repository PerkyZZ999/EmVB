import { expect, test } from "bun:test";

// W-1008: development runs on EmDash 1.5 + Astro 7.4 (CI keeps an EmDash 1.4 job). Both demos
// and the plugin's own dev dependencies use the same EmDash, Astro, React integration and forms
// plugin, so a demo can't quietly test something else. (W-1010's @astrojs/react 7.1.2 pin was for
// Astro 7.3 and went with it.)
type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const read = async (path: string) =>
  (await Bun.file(new URL(`../${path}`, import.meta.url)).json()) as Manifest;
const node = (await read("demos/node/package.json")).dependencies ?? {};
const cloudflare = (await read("demos/cloudflare/package.json")).dependencies ?? {};
const plugin = (await read("packages/emvb/package.json")).devDependencies ?? {};

test("W-1008: both demos run the same EmDash, Astro, React integration and forms plugin", () => {
  for (const name of ["emdash", "astro", "@astrojs/react", "@emdash-cms/plugin-forms"])
    expect({ name, cloudflare: cloudflare[name] }).toEqual({ name, cloudflare: node[name] });
});

test("W-1008: the plugin is developed against the demos' EmDash and Astro, on EmDash 1.5", () => {
  for (const name of ["emdash", "astro", "@emdash-cms/plugin-forms"])
    expect({ name, plugin: plugin[name] }).toEqual({ name, plugin: node[name] });
  expect(Bun.semver.satisfies(plugin["emdash"] ?? "", ">=1.5.0")).toBe(true);
  expect(Bun.semver.satisfies(plugin["astro"] ?? "", ">=7.4.0")).toBe(true);
});
