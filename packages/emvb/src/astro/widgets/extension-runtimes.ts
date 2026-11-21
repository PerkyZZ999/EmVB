import { extensionAssets } from "../../core/extensions/index.ts";

/** Extension runtimes already written in one response (page plus theme parts), per request. */
const written = new WeakMap<object, Set<string>>();

/**
 * W-1086: the runtimes of the `ext:<package>` names a page or theme part asked for, each once per
 * request. The text was read from the extension's package at build time and checked so it can't
 * close its `<script>` (classes.ts).
 */
export function extensionRuntimeScripts(
  request: object,
  names: readonly string[],
): { id: string; code: string }[] {
  const done = written.get(request) ?? new Set<string>();
  written.set(request, done);
  const out: { id: string; code: string }[] = [];
  for (const name of names) {
    if (!name.startsWith("ext:")) continue;
    const id = name.slice(4);
    const code = extensionAssets(id)?.runtime;
    if (!code || done.has(id)) continue;
    done.add(id);
    out.push({ id, code });
  }
  return out;
}
