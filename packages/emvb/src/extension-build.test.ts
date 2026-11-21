import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { clearExtensions, extensionAssets, rememberExtensions } from "./core/extensions/index.ts";
import { prepareExtensionBuild, serverEntrySource } from "./extension-build.ts";
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
    const build = prepareExtensionBuild(manifests, site);
    expect(build.warnings).toEqual([]);
    expect(extensionAssets("emvb-ext-kit")).toEqual({
      css: ".kit-btn{color:red}",
      runtime: "(() => {})();",
    });
    expect(build.entrypoint).toStartWith(join(site, "node_modules", ".emvb", "server-entry-"));
    const source = readFileSync(build.entrypoint ?? "", "utf8");
    expect(source).toContain('import { registerBundledExtensions } from "@perkyzz/emvb";');
    expect(source).toContain('export { createPlugin } from "@perkyzz/emvb";');
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
        site,
      );
      expect(build.warnings.join("\n")).toContain(`emvb-ext-kit: css "${css}" ${why}`);
      expect(extensionAssets("emvb-ext-kit")).toBeUndefined();
    }
  });

  test("refuses a module of another package, or no file: URL", () => {
    const { module, site } = pkg("someone-else", { "src/kit.css": ".a{}" });
    let build = prepareExtensionBuild(
      rememberExtensions([ext("emvb-ext-kit", { module, css: "./kit.css" })]),
      site,
    );
    expect(build.warnings.join()).toContain('belong to the package named "emvb-ext-kit"');
    expect(build.entrypoint).toBeUndefined();
    clearExtensions();
    build = prepareExtensionBuild(
      rememberExtensions([ext("emvb-ext-kit", { module: "https://x.example/i.js" })]),
      site,
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
      site,
    );
    expect(build.warnings).toHaveLength(2);
    expect(extensionAssets("emvb-ext-kit")).toBeUndefined();
  });

  test("an extension without module keeps the old entry and gets a warning for its files", () => {
    const build = prepareExtensionBuild(
      rememberExtensions([ext("emvb-ext-kit", { css: "./kit.css" })]),
      root,
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
});
