import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { clearExtensions, extensionAssets, rememberExtensions } from "./core/extensions/index.ts";
import { astroCli, prepareExtensionBuild, serverEntrySource } from "./extension-build.ts";
import { emvb } from "./index.ts";

// W-1086: css and runtime are files of the extension's own package, read at build time; the
// extension module is bundled through a generated server entry.

const root = mkdtempSync(join(tmpdir(), "emvb-ext-build-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
/** A fake extension package on disk; returns its module URL and site folder. */
function pkg(name: string, files: Record<string, string>) {
  n += 1;
  const dir = join(root, `p${n}`, "node_modules", name);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
  writeFileSync(join(dir, "src", "index.ts"), "export default {};\n");
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  writeFileSync(join(root, `p${n}`, "outside.css"), ".x{}");
  return { module: pathToFileURL(join(dir, "src", "index.ts")).href, site: join(root, `p${n}`) };
}

const ext = (id: string, extra: Record<string, unknown>) => ({
  extensionApi: 1 as const,
  id,
  elements: [],
  ...extra,
});

beforeEach(() => clearExtensions());

describe("prepareExtensionBuild (W-1086)", () => {
  test("reads the package's css and runtime and writes the server entry", () => {
    const { module, site } = pkg("emvb-ext-kit", {
      "src/kit.css": ".kit-btn{color:red}",
      "src/kit.js": "(() => {})();",
    });
    const manifests = rememberExtensions([
      ext("emvb-ext-kit", { module, css: "./kit.css", runtime: "./kit.js" }),
    ]);
    const build = prepareExtensionBuild(manifests, { root: site });
    expect(build.warnings).toEqual([]);
    expect(extensionAssets("emvb-ext-kit")).toEqual({
      css: ".kit-btn{color:red}",
      runtime: "(() => {})();",
    });
    expect(build.entrypoint).toStartWith(join(site, "node_modules", ".emvb", "server-entry-"));
    const source = readFileSync(build.entrypoint ?? "", "utf8");
    // EmVB by absolute path: the entry doesn't depend on resolving the package from its folder.
    const self = realpathSync(join(import.meta.dir, "index.ts"));
    expect(source).toContain(`import { registerBundledExtensions } from ${JSON.stringify(self)};`);
    expect(source).toContain(`export { createPlugin } from ${JSON.stringify(self)};`);
    expect(source).toContain('"emvb-ext-kit"');
  });

  test("refuses URLs, absolute paths, files outside the package and wrong file types", () => {
    for (const [css, why] of [
      ["https://cdn.example/kit.css", "is not a relative path"],
      ["//cdn.example/kit.css", "is not a relative path"],
      ["data:text/css,.a{}", "is not a relative path"],
      ["/etc/passwd.css", "is not a relative path"],
      [".\\kit.css", "is not a relative path"],
      ["../../../outside.css", "is outside the extension's package"],
      ["./kit.txt", "must end in .css"],
      ["./missing.css", "was not found"],
    ]) {
      clearExtensions();
      const { module, site } = pkg("emvb-ext-kit", { "src/kit.txt": "x", "src/kit.css": ".a{}" });
      const build = prepareExtensionBuild(
        rememberExtensions([ext("emvb-ext-kit", { module, css })]),
        { root: site },
      );
      expect(build.warnings.join("\n")).toContain(`emvb-ext-kit: css "${css}" ${why}`);
      expect(extensionAssets("emvb-ext-kit")).toBeUndefined();
    }
  });

  test("refuses a module of another package, or no file: URL", () => {
    const { module, site } = pkg("someone-else", { "src/kit.css": ".a{}" });
    let build = prepareExtensionBuild(
      rememberExtensions([ext("emvb-ext-kit", { module, css: "./kit.css" })]),
      { root: site },
    );
    expect(build.warnings.join()).toContain('belong to the package named "emvb-ext-kit"');
    expect(build.entrypoint).toBeUndefined();
    clearExtensions();
    build = prepareExtensionBuild(
      rememberExtensions([ext("emvb-ext-kit", { module: "https://x.example/i.js" })]),
      { root: site },
    );
    expect(build.warnings.join()).toContain("local file: URL");
  });

  test("refuses text that could leave its element", () => {
    const { module, site } = pkg("emvb-ext-kit", {
      "src/kit.css": ".a{}</style><script>alert(1)</script>",
      "src/kit.js": 'import x from "y";',
    });
    const build = prepareExtensionBuild(
      rememberExtensions([ext("emvb-ext-kit", { module, css: "./kit.css", runtime: "./kit.js" })]),
      { root: site },
    );
    expect(build.warnings).toHaveLength(2);
    expect(extensionAssets("emvb-ext-kit")).toBeUndefined();
  });

  test("warns about a class in the stylesheet that does not start with the prefix", () => {
    const { module, site } = pkg("emvb-ext-kit", {
      "src/kit.css":
        ":root{--kit-gap:1;--color-primary:red}.kit-card{x:1}.page-heading{x:2}@media (x){.kit-a .sidebar{x:3}}",
    });
    const build = prepareExtensionBuild(
      rememberExtensions([
        ext("emvb-ext-kit", {
          module,
          css: "./kit.css",
          classes: { prefix: "kit-", allow: ["kit-card"] },
        }),
      ]),
      { root: site },
    );
    const text = build.warnings.join("\n");
    expect(text).toContain("names the class .page-heading, which does not start with kit-");
    expect(text).toContain("names the class .sidebar, which does not start with kit-");
    expect(text).not.toContain(".kit-card");
    // Root variables are scoped to the wrapper now, so they need no warning.
    expect(text).not.toContain("declares");
    // A warning only: the stylesheet is still kept.
    expect(extensionAssets("emvb-ext-kit")?.css).toContain(".page-heading");
  });
  test("an extension that names only its own classes gets no class warning", () => {
    const { module, site } = pkg("emvb-ext-kit", {
      "src/kit.css": ".kit-card{x:1}.kit-card:hover .kit-title{y:2}@media (x){.kit-a{z:3}}",
    });
    const build = prepareExtensionBuild(
      rememberExtensions([
        ext("emvb-ext-kit", {
          module,
          css: "./kit.css",
          classes: { prefix: "kit-", allow: ["kit-card"] },
        }),
      ]),
      { root: site },
    );
    expect(build.warnings.join()).not.toContain("names the class");
  });
  test("an extension without module keeps the old entry and gets a warning for its files", () => {
    const build = prepareExtensionBuild(
      rememberExtensions([ext("emvb-ext-kit", { css: "./kit.css" })]),
      { root },
    );
    expect(build.entrypoint).toBeUndefined();
    expect(build.warnings.join()).toContain("need `module: import.meta.url`");
    expect(emvb({ extensions: [ext("emvb-ext-plain", {}) as never] }).entrypoint).toBe(
      "@perkyzz/emvb",
    );
  });

  test("the entry source imports each module by path", () => {
    expect(serverEntrySource([{ id: "a-b", file: "C:\\x\\a.ts" }])).toContain(
      'import * as ext0 from "C:/x/a.ts";',
    );
  });

  test("a production build fails when the server entry can't be written; dev only warns", () => {
    const { module, site } = pkg("emvb-ext-kit", {});
    // A file where the site folder should be: node_modules/.emvb can't be made under it.
    const blocked = join(site, "not-a-folder");
    writeFileSync(blocked, "");
    const manifests = rememberExtensions([ext("emvb-ext-kit", { module })]);
    expect(() => prepareExtensionBuild(manifests, { root: blocked, command: "build" })).toThrow(
      /could not write the extensions server entry .*placeholders/,
    );
    const dev = prepareExtensionBuild(manifests, { root: blocked, command: "other" });
    expect(dev.entrypoint).toBeUndefined();
    expect(dev.warnings.join()).toContain("could not write");
  });

  test("the Astro command and root come from the CLI's arguments", () => {
    const cwd = "/work";
    expect(astroCli(["bun", "/s/node_modules/.bin/astro", "build"], cwd, "production")).toEqual({
      command: "build",
      root: "/work",
    });
    expect(
      astroCli(["node", "/s/node_modules/astro/astro.js", "build", "--root", "site"], cwd, "x"),
    ).toEqual({ command: "build", root: "/work/site" });
    expect(astroCli(["node", "/a/astro.js", "dev", "--root=/abs/site"], cwd, undefined)).toEqual({
      command: "other",
      root: "/abs/site",
    });
    expect(astroCli(["node", "/a/astro", "preview"], cwd, "production").command).toBe("other");
    // A programmatic build(): no Astro CLI, NODE_ENV says production.
    expect(astroCli(["node", "build.mjs"], cwd, "production").command).toBe("build");
    expect(astroCli(["bun", "test"], cwd, "test").command).toBe("other");
  });

  test('a package.json without a name (dist/esm\'s {"type":"module"}) isn\'t the package', () => {
    const { module, site } = pkg("emvb-ext-kit", {
      "src/package.json": JSON.stringify({ type: "module" }),
      "src/kit.css": ".kit-btn{}",
    });
    const build = prepareExtensionBuild(
      rememberExtensions([ext("emvb-ext-kit", { module, css: "./kit.css" })]),
      { root: site },
    );
    expect(build.warnings).toEqual([]);
    expect(extensionAssets("emvb-ext-kit")).toEqual({ css: ".kit-btn{}" });
  });

  test("refuses an entry path EmDash would write unescaped into its import", () => {
    const { module, site } = pkg("emvb-ext-kit", {});
    const manifests = rememberExtensions([ext("emvb-ext-kit", { module })]);
    for (const name of ['a"b', "a\nb"]) {
      const odd = join(site, name);
      mkdirSync(odd, { recursive: true });
      expect(() => prepareExtensionBuild(manifests, { root: odd, command: "build" })).toThrow(
        /a quote, backslash or control character/,
      );
      const dev = prepareExtensionBuild(manifests, { root: odd });
      expect(dev.entrypoint).toBeUndefined();
      expect(dev.warnings.join()).toContain("a quote, backslash or control character");
    }
  });

  test("replaces the entry in one step and removes stale entries", () => {
    const { module, site } = pkg("emvb-ext-kit", {});
    const dir = join(site, "node_modules", ".emvb");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "server-entry-old1.ts"), "// an earlier extension list");
    writeFileSync(join(dir, "server-entry-old1.ts.1-x.tmp"), "// a crashed write");
    writeFileSync(join(dir, "keep.txt"), "not ours");
    const build = prepareExtensionBuild(rememberExtensions([ext("emvb-ext-kit", { module })]), {
      root: site,
    });
    const entry = build.entrypoint?.split("/").pop() ?? "";
    expect(entry).toMatch(/^server-entry-[0-9a-z]+\.ts$/);
    expect(readdirSync(dir).toSorted()).toEqual(["keep.txt", entry]);
  });

  test("refuses a runtime the export's classic script can't run (top-level await)", () => {
    for (const code of ["await fetch('/x');", "with (document) { title = 'x'; }"]) {
      clearExtensions();
      const { module, site } = pkg("emvb-ext-kit", { "src/kit.js": code });
      const build = prepareExtensionBuild(
        rememberExtensions([ext("emvb-ext-kit", { module, runtime: "./kit.js" })]),
        { root: site },
      );
      expect(build.warnings.join()).toContain("must parse as a strict classic script");
      expect(extensionAssets("emvb-ext-kit")).toBeUndefined();
    }
  });
});
