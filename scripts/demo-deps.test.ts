import { expect, test } from "bun:test";

// W-1010: @astrojs/react 7.1.8 moved its client renderer into @astrojs/react-renderer. On the
// node demo's Astro 7.3 dev server the admin then fails to hydrate ("react-dom/client.js does not
// provide an export named 'createRoot'"), so that demo keeps 7.1.2, pinned exactly, until it
// moves to Astro 7.4.
const demo = (await Bun.file(new URL("../demos/node/package.json", import.meta.url)).json()) as {
  dependencies: Record<string, string>;
};

test("W-1010: the node demo pins @astrojs/react 7.1.2 while it runs Astro 7.3", () => {
  const astro = demo.dependencies.astro ?? "";
  if (Bun.semver.satisfies(astro.replace(/^[\^~]/, ""), ">=7.4.0")) return;
  expect(demo.dependencies["@astrojs/react"]).toBe("7.1.2");
});
