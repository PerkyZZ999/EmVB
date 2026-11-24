import { expect, test } from "bun:test";
import { STOCK_SITES, astroConfig, createCommands, route, templateKey } from "./sites.ts";

// W-1096: the release's stock install smoke, in the repository: four sites as the install guide
// sets them up, on EmDash 1.4.0 and 1.5.0, Node and Cloudflare.

const site = (name: string) => {
  const found = STOCK_SITES.find((s) => s.name === name);
  if (!found) throw new Error(name);
  return found;
};

test("W-1096: the floor and the latest EmDash, each on Node and Cloudflare", () => {
  expect(STOCK_SITES.map((s) => `${s.emdash} ${s.platform}`).toSorted()).toEqual([
    "1.4.0 cloudflare",
    "1.4.0 node",
    "1.5.0 cloudflare",
    "1.5.0 node",
  ]);
  // Both visitorCookie modes are checked on both platforms.
  expect(new Set(STOCK_SITES.filter((s) => s.platform === "node").map((s) => s.cookie)).size).toBe(
    2,
  );
  expect(
    new Set(STOCK_SITES.filter((s) => s.platform === "cloudflare").map((s) => s.cookie)).size,
  ).toBe(2);
});

test("W-1096: each config adds EmVB with the hello extension, as the install guide says", () => {
  for (const s of STOCK_SITES) {
    const config = astroConfig(s);
    expect(config).toContain('import { emvb } from "@perkyzz/emvb";');
    expect(config).toContain('import hello from "emvb-ext-hello";');
    expect(config).toContain("emvb({ extensions: [hello]");
    expect(config.includes('visitorCookie: "never"')).toBe(s.cookie === "never");
    // The forms plugin only on Node (it pins Kumo, which the 1.4 Workers sites don't want).
    expect(config.includes("formsPlugin()")).toBe(s.platform === "node");
    expect(config).toContain(
      s.platform === "node" ? 'sqlite({ url: "file:./data.db" })' : 'd1({ binding: "DB"',
    );
    // The 1.5 templates keep light-dark() native; the 1.4 ones don't import lightningcss.
    expect(config.includes("Features.LightDark")).toBe(s.emdash === "1.5.0");
  }
});

test("W-1096: the page route renders the page with the runtimes it needs", () => {
  const node = route(site("stock-15"));
  expect(node).toContain("resolveEmVBPage(Astro)");
  expect(node).toContain('return Astro.rewrite("/404")');
  expect(node).toContain("<EmVBFormsRuntime />");
  expect(node).toContain("<EmVBMenuRuntime />");
  expect(route(site("stock-15-cf"))).not.toContain("EmVBFormsRuntime");
});

test("W-1096: the 1.4 sites use the template from before 1.5's and pin emdash 1.4.0", () => {
  const steps = createCommands(site("stock-14-cf")).map((s) => s.command.join(" "));
  expect(steps[0]).toContain("create-emdash@1.4.0 stock-14-cf --template cloudflare:blog");
  expect(steps.join("\n")).toContain("github:emdash-cms/templates/blog-cloudflare#a7bb43df40");
  expect(steps.join("\n")).toContain('j.dependencies.emdash="1.4.0"');
  expect(
    createCommands(site("stock-15"))
      .map((s) => s.command.join(" "))
      .join("\n"),
  ).toContain("@emdash-cms/plugin-forms@0.2.13");
});

test("W-1096: a cached template is named by how it is made", () => {
  const a = site("stock-14");
  expect(templateKey(a)).toBe(templateKey({ ...a }));
  expect(templateKey(a)).not.toBe(templateKey({ ...a, forms: "0.2.13" }));
  expect(templateKey(a).startsWith("stock-14-")).toBe(true);
});
