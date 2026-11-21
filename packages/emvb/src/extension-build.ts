/**
 * W-1086: build-time work for `emvb({ extensions })`, run in astro.config (Node or Bun), never at
 * request time.
 *
 * - `css` and `runtime` are files of the extension's own package, relative to its `module`. Their
 *   text is read here and travels in the plugin's serialized options, so a Cloudflare Worker or a
 *   production server (which have no package files) still has it.
 * - EmDash bundles a plugin through its `entrypoint` only. When extensions name their `module`,
 *   this writes a small entry next to the site (`node_modules/.emvb/`) that imports them and
 *   re-exports `createPlugin`, so their render functions reach the server build too.
 *
 * Node modules are reached through `process.getBuiltinModule`, so this file adds no `node:`
 * import to the server bundle that also holds `emvb()`.
 */

import type * as Fs from "node:fs";
import type * as Path from "node:path";
import type * as Url from "node:url";
import {
  extensionCssIssue,
  extensionRuntimeIssue,
  liveExtension,
  rememberExtensionAssets,
  type ExtensionAssets,
  type ExtensionManifest,
} from "./core/extensions/index.ts";
import { MAX_EXTENSION_CSS_BYTES, MAX_EXTENSION_RUNTIME_BYTES } from "./core/extensions/classes.ts";
import { PACKAGE_NAME } from "./constants.ts";

type NodeApis = { fs: typeof Fs; path: typeof Path; url: typeof Url };

function nodeApis(): NodeApis | undefined {
  const getBuiltin = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } })
    .process?.getBuiltinModule;
  if (typeof getBuiltin !== "function") return undefined;
  const fs = getBuiltin("node:fs") as typeof Fs | undefined;
  const path = getBuiltin("node:path") as typeof Path | undefined;
  const url = getBuiltin("node:url") as typeof Url | undefined;
  return fs && path && url ? { fs, path, url } : undefined;
}

/** A relative file path inside the package: `./x.css`, `../styles/x.css`; no scheme, no `\`. */
const RELATIVE = /^\.{1,2}\/[^\\:?#]+$/;

/** The package an extension module belongs to: its folder and unscoped name. */
function packageOf(apis: NodeApis, file: string): { root: string; name: string } | undefined {
  const { fs, path } = apis;
  let dir = path.dirname(file);
  for (let i = 0; i < 32; i += 1) {
    const manifest = path.join(dir, "package.json");
    if (fs.existsSync(manifest)) {
      try {
        const name = (JSON.parse(fs.readFileSync(manifest, "utf8")) as { name?: unknown }).name;
        if (typeof name !== "string") return undefined;
        return { root: dir, name: name.replace(/^@[^/]+\//, "") };
      } catch {
        return undefined;
      }
    }
    const up = path.dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
  return undefined;
}

/** The real path of a declared asset, or why it is refused. */
function assetPath(
  apis: NodeApis,
  pkg: { root: string },
  moduleFile: string,
  declared: string,
  extensions: readonly string[],
  maxBytes: number,
): { file: string } | { issue: string } {
  const { fs, path } = apis;
  if (!RELATIVE.test(declared)) {
    return { issue: `"${declared}" is not a relative path in the package (use "./file")` };
  }
  if (!extensions.includes(path.extname(declared).toLowerCase())) {
    return { issue: `"${declared}" must end in ${extensions.join(" or ")}` };
  }
  let file: string;
  try {
    file = fs.realpathSync(path.resolve(path.dirname(moduleFile), declared));
  } catch {
    return { issue: `"${declared}" was not found` };
  }
  const root = fs.realpathSync(pkg.root);
  if (!file.startsWith(root + path.sep)) {
    return { issue: `"${declared}" is outside the extension's package` };
  }
  const stat = fs.statSync(file);
  if (!stat.isFile()) return { issue: `"${declared}" is not a file` };
  if (stat.size > maxBytes) return { issue: `"${declared}" is larger than ${maxBytes / 1024} KB` };
  return { file };
}

export type ExtensionBuild = {
  /** The generated server entry, when at least one extension named its module. */
  entrypoint?: string;
  /** Problems to show the site owner; the extension still registers without the refused part. */
  warnings: string[];
};

/** Read assets and find modules for the extensions `rememberExtensions` accepted. */
export function prepareExtensionBuild(
  manifests: readonly ExtensionManifest[],
  cwd?: string,
): ExtensionBuild {
  const warnings: string[] = [];
  const modules: { id: string; file: string }[] = [];
  const wantsFiles = manifests.some((m) => liveExtension(m.id)?.module !== undefined);
  const apis = wantsFiles ? nodeApis() : undefined;
  for (const manifest of manifests) {
    const ext = liveExtension(manifest.id);
    if (!ext) continue;
    const say = (issue: string) => warnings.push(`${ext.id}: ${issue}`);
    if (ext.module === undefined) {
      if (ext.css !== undefined || ext.runtime !== undefined) {
        say("css and runtime need `module: import.meta.url`; they were ignored");
      }
      continue;
    }
    if (!apis) {
      say("css, runtime and module need Node or Bun at build time; they were ignored");
      continue;
    }
    let moduleFile: string;
    try {
      const url = new URL(ext.module);
      if (url.protocol !== "file:") throw new Error("not a file");
      moduleFile = apis.fs.realpathSync(apis.url.fileURLToPath(url));
    } catch {
      say("module must be the extension's own `import.meta.url` (a local file: URL)");
      continue;
    }
    const pkg = packageOf(apis, moduleFile);
    if (!pkg || pkg.name !== ext.id) {
      say(`module must belong to the package named "${ext.id}"`);
      continue;
    }
    modules.push({ id: ext.id, file: moduleFile });
    const assets: ExtensionAssets = {};
    if (ext.css !== undefined) {
      const found = assetPath(apis, pkg, moduleFile, ext.css, [".css"], MAX_EXTENSION_CSS_BYTES);
      if ("issue" in found) say(`css ${found.issue}`);
      else {
        const css = apis.fs.readFileSync(found.file, "utf8");
        const issue = extensionCssIssue(css);
        if (issue) say(`css refused: ${issue}`);
        else assets.css = css;
      }
    }
    if (ext.runtime !== undefined) {
      const found = assetPath(
        apis,
        pkg,
        moduleFile,
        ext.runtime,
        [".js", ".mjs"],
        MAX_EXTENSION_RUNTIME_BYTES,
      );
      if ("issue" in found) say(`runtime ${found.issue}`);
      else {
        const code = apis.fs.readFileSync(found.file, "utf8");
        const issue = extensionRuntimeIssue(code);
        if (issue) say(`runtime refused: ${issue}`);
        else assets.runtime = code;
      }
    }
    rememberExtensionAssets(ext.id, assets);
  }
  if (modules.length === 0 || !apis) return { warnings };
  const entrypoint = writeServerEntry(apis, modules, cwd ?? process.cwd(), warnings);
  return entrypoint ? { entrypoint, warnings } : { warnings };
}

const posix = (file: string) => file.replaceAll("\\", "/");

/** The generated server entry's source: import each extension module, register, re-export. */
export function serverEntrySource(modules: readonly { id: string; file: string }[]): string {
  return [
    "// Generated by @perkyzz/emvb (W-1086) from this site's emvb({ extensions }). Do not edit.",
    `import { registerBundledExtensions } from ${JSON.stringify(PACKAGE_NAME)};`,
    ...modules.map((m, i) => `import * as ext${i} from ${JSON.stringify(posix(m.file))};`),
    "registerBundledExtensions([",
    ...modules.map((m, i) => `  [ext${i}, ${JSON.stringify(m.id)}],`),
    "]);",
    `export { createPlugin } from ${JSON.stringify(PACKAGE_NAME)};`,
    "",
  ].join("\n");
}

function writeServerEntry(
  apis: NodeApis,
  modules: readonly { id: string; file: string }[],
  cwd: string,
  warnings: string[],
): string | undefined {
  const { fs, path } = apis;
  const source = serverEntrySource(modules);
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  const dir = path.join(cwd, "node_modules", ".emvb");
  // A .ts file, so Vite bundles it (and the TypeScript it imports) instead of handing it to Node.
  const file = path.join(dir, `server-entry-${hash.toString(36)}.ts`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== source) {
      fs.writeFileSync(file, source);
    }
    return file.replaceAll("\\", "/");
  } catch {
    warnings.push(
      `could not write ${file}; extension elements render only in the dev server's own process`,
    );
    return undefined;
  }
}
