import { expect, test } from "bun:test";

// W-1015: Dependabot watches the Bun workspace (EmDash, Kumo and Astro grouped) and the CI
// actions, whose SHA pins (W-1001) would otherwise never move.
type Update = {
  "package-ecosystem": string;
  directory: string;
  ignore?: { "dependency-name": string; versions?: string[] }[];
  groups?: Record<string, { patterns: string[] }>;
};
const config = Bun.YAML.parse(
  await Bun.file(new URL("../.github/dependabot.yml", import.meta.url)).text(),
) as { version: number; updates: Update[] };
const bun = config.updates.find((u) => u["package-ecosystem"] === "bun");

test("W-1015: Dependabot watches the Bun workspace and the CI actions", () => {
  expect(config.version).toBe(2);
  expect(bun?.directory).toBe("/");
  expect(config.updates.some((u) => u["package-ecosystem"] === "github-actions")).toBe(true);
});

test("W-1015: EmDash with Kumo, and Astro, update as groups", () => {
  expect(bun?.groups?.["emdash"]?.patterns).toEqual(
    expect.arrayContaining(["emdash", "@emdash-cms/*", "@cloudflare/kumo"]),
  );
  expect(bun?.groups?.["astro"]?.patterns).toEqual(expect.arrayContaining(["astro", "@astrojs/*"]));
});

test("W-1032: Remix Icon stays on 4.8.0, the last Apache-2.0 release", async () => {
  const root = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
    devDependencies: Record<string, string>;
  };
  expect(root.devDependencies["remixicon"]).toBe("4.8.0");
  expect(bun?.ignore).toContainEqual({ "dependency-name": "remixicon", versions: [">=4.9.0"] });
});
