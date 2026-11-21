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
import type * as Vm from "node:vm";
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

type NodeApis = { fs: typeof Fs; path: typeof Path; url: typeof Url; vm?: typeof Vm };

function nodeApis(): NodeApis | undefined {
  const getBuiltin = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } })
    .process?.getBuiltinModule;
  if (typeof getBuiltin !== "function") return undefined;
  const fs = getBuiltin("node:fs") as typeof Fs | undefined;
  const path = getBuiltin("node:path") as typeof Path | undefined;
  const url = getBuiltin("node:url") as typeof Url | undefined;
  const vm = getBuiltin("node:vm") as typeof Vm | undefined;
  return fs && path && url ? { fs, path, url, ...(vm ? { vm } : {}) } : undefined;
}

/** A relative file path inside the package: `./x.css`, `../styles/x.css`; no scheme, no `\`. */
const RELATIVE = /^\.{1,2}\/[^\\:?#]+$/;

function packageName(text: string): string | undefined {
  try {
    const name = (JSON.parse(text) as { name?: unknown } | null)?.name;
    return typeof name === "string" && name !== "" ? name : undefined;
  } catch {
    return undefined;
  }
}

/** The package an extension module belongs to: its folder and unscoped name. */
function packageOf(apis: NodeApis, file: string): { root: string; name: string } | undefined {
  const { fs, path } = apis;
  let dir = path.dirname(file);
  for (let i = 0; i < 32; i += 1) {
    const manifest = path.join(dir, "package.json");
    // A package.json without a name (dist/esm's `{"type":"module"}`) isn't the package root.
    const name = fs.existsSync(manifest)
      ? packageName(fs.readFileSync(manifest, "utf8"))
      : undefined;
    if (name !== undefined) return { root: dir, name: name.replace(/^@[^/]+\//, "") };
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

/**
 * What the Astro CLI is doing, read from its arguments: EmDash gives a plugin descriptor no
 * integration hook, so `emvb()` never sees Astro's own `command` or `config.root`. A run that isn't
 * the Astro CLI (a programmatic `build()`) counts as a build when NODE_ENV is production, which
 * Astro's build sets.
 */
export function astroCli(
  argv: readonly string[],
  cwd: string,
  nodeEnv: string | undefined,
): { command: "build" | "other"; root: string } {
  const bin = argv.findIndex((arg) => /(?:^|[\\/])astro(?:\.m?js)?$/.test(arg));
  const args = bin === -1 ? [] : argv.slice(bin + 1);
  let root = cwd;
  let command: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === "--root" && args[i + 1] !== undefined) {
      root = args[i + 1] as string;
      i += 1;
    } else if (arg.startsWith("--root=")) root = arg.slice("--root=".length);
    else if (!arg.startsWith("-") && command === undefined) command = arg;
  }
  const isBuild =
    command === undefined ? bin === -1 && nodeEnv === "production" : command === "build";
  return { command: isBuild ? "build" : "other", root: joinRoot(cwd, root) };
}

const joinRoot = (cwd: string, root: string) =>
  /^(?:[A-Za-z]:)?[\\/]/.test(root) ? root : `${cwd.replace(/[\\/]+$/, "")}/${root}`;

/**
 * A runtime runs as an inline `<script type="module">` on public pages and as a classic
 * `<script defer>` file in the HTML export (module scripts don't load from `file:` pages, so the
 * export can't use them). It must parse as both: a strict classic script, so no top-level `await`
 * (and no `with` or other sloppy-only syntax). Compiled here, never run.
 */
function classicScriptIssue(apis: NodeApis, code: string): string | undefined {
  if (!apis.vm) return undefined;
  try {
    const script = new apis.vm.Script(`"use strict";${code}`);
    return script instanceof apis.vm.Script ? undefined : "the runtime didn't compile";
  } catch (error) {
    const message = error instanceof Error ? error.message : "syntax error";
    return `the runtime must parse as a strict classic script (no top-level await): ${message}`;
  }
}

export type ExtensionBuild = {
  /** The generated server entry, when at least one extension named its module. */
  entrypoint?: string;
  /** Problems to show the site owner; the extension still registers without the refused part. */
  warnings: string[];
};

/**
 * Read assets and find modules for the extensions `rememberExtensions` accepted. `root` is the
 * site folder (the Astro root); `command: "build"` makes a server entry that can't be written an
 * error, because a production build without it shows placeholders for every extension element.
 */
export function prepareExtensionBuild(
  manifests: readonly ExtensionManifest[],
  where: { root?: string; command?: "build" | "other" } = {},
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
        const issue = extensionRuntimeIssue(code) ?? classicScriptIssue(apis, code);
        if (issue) say(`runtime refused: ${issue}`);
        else assets.runtime = code;
      }
    }
    rememberExtensionAssets(ext.id, assets);
  }
  if (modules.length === 0 || !apis) return { warnings };
  const written = writeServerEntry(apis, modules, where.root ?? process.cwd());
  if ("entrypoint" in written) return { entrypoint: written.entrypoint, warnings };
  if (where.command === "build") {
    throw new Error(
      `[emvb] could not write the extensions server entry ${written.file} (${written.reason}). ` +
        `Without it, extension elements render as placeholders in this build. Make the site's ` +
        `node_modules folder writable, or run the build from the site folder (or pass --root).`,
    );
  }
  warnings.push(
    `could not write ${written.file} (${written.reason}); extension elements render only in the dev server's own process`,
  );
  return { warnings };
}

const posix = (file: string) => file.replaceAll("\\", "/");

/**
 * EmVB's own entry by absolute path, so the generated entry doesn't depend on where it sits (the
 * bare package name only resolves from inside the site's node_modules). The same real file the
 * site's `@perkyzz/emvb` imports resolve to, so the bundle keeps one copy.
 */
function emvbEntry(apis: NodeApis | undefined): string {
  try {
    const self = new URL(import.meta.url);
    if (!apis || self.protocol !== "file:") return PACKAGE_NAME;
    // index.ts sits next to this file (a path, not an import: index.ts imports this file).
    const dir = apis.path.dirname(apis.url.fileURLToPath(self));
    return posix(apis.fs.realpathSync(apis.path.join(dir, "index.ts")));
  } catch {
    return PACKAGE_NAME;
  }
}

/** The generated server entry's source: import each extension module, register, re-export. */
export function serverEntrySource(
  modules: readonly { id: string; file: string }[],
  emvb: string = PACKAGE_NAME,
): string {
  return [
    "// Generated by @perkyzz/emvb (W-1086) from this site's emvb({ extensions }). Do not edit.",
    `import { registerBundledExtensions } from ${JSON.stringify(emvb)};`,
    ...modules.map((m, i) => `import * as ext${i} from ${JSON.stringify(posix(m.file))};`),
    "registerBundledExtensions([",
    ...modules.map((m, i) => `  [ext${i}, ${JSON.stringify(m.id)}],`),
    "]);",
    `export { createPlugin } from ${JSON.stringify(emvb)};`,
    "",
  ].join("\n");
}

/** Earlier entries (another extension list) and temp files a crashed build left behind. */
function removeStaleEntries(apis: NodeApis, dir: string, keep: string): void {
  for (const name of apis.fs.readdirSync(dir)) {
    if (name === keep || !name.startsWith("server-entry-")) continue;
    try {
      apis.fs.rmSync(apis.path.join(dir, name), { force: true });
    } catch {
      // Another build may hold it; the next one tries again.
    }
  }
}

// oxlint-disable-next-line no-control-regex -- control characters are what this refuses
const UNSAFE_ENTRY_PATH = /["\\\u0000-\u001f\u007f\u2028\u2029]/;

function writeServerEntry(
  apis: NodeApis,
  modules: readonly { id: string; file: string }[],
  root: string,
): { entrypoint: string } | { file: string; reason: string } {
  const { fs, path } = apis;
  const source = serverEntrySource(modules, emvbEntry(apis));
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  const dir = path.join(path.resolve(root), "node_modules", ".emvb");
  // A .ts file, so Vite bundles it (and the TypeScript it imports) instead of handing it to Node.
  const file = path.join(dir, `server-entry-${hash.toString(36)}.ts`);
  // EmDash writes the entrypoint into `import … from "<entrypoint>"` without escaping it.
  if (UNSAFE_ENTRY_PATH.test(file.replaceAll("\\", "/"))) {
    return { file, reason: "its path has a quote, backslash or control character" };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== source) {
      // Written beside and renamed into place, so a dev server watching the folder never reads
      // half a file.
      const temp = `${file}.${process.pid}-${Date.now().toString(36)}.tmp`;
      fs.writeFileSync(temp, source);
      fs.renameSync(temp, file);
    }
    removeStaleEntries(apis, dir, path.basename(file));
    return { entrypoint: file.replaceAll("\\", "/") };
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return { file, reason: typeof code === "string" ? code : "write failed" };
  }
}
