import { extensionStylesheets } from "../core/extensions/index.ts";

/** Extension stylesheets already in one response (theme parts, then pages), per request. */
const written = new WeakMap<object, Set<string>>();

function writtenFor(request: object | undefined): Set<string> {
  if (!request) return new Set();
  const done = written.get(request) ?? new Set<string>();
  written.set(request, done);
  return done;
}

/**
 * W-1086: the theme parts' sheet holds the stylesheets of `ids` (it always holds all of them, so
 * it stays whole however often a host resolves the parts); pages in the same response skip them.
 */
export function noteExtensionStyles(request: object | undefined, ids: readonly string[]): void {
  const done = writtenFor(request);
  for (const id of ids) done.add(id);
}

/**
 * W-1086: the stylesheets of `ids` this response hasn't written yet, each once: a page whose
 * header, footer and body all hold an extension's element ships its stylesheet once.
 */
export function extensionStylesToWrite(
  request: object | undefined,
  ids: readonly string[] | undefined,
): string {
  if (!ids || ids.length === 0) return "";
  const done = writtenFor(request);
  const fresh = ids.filter((id) => !done.has(id));
  for (const id of fresh) done.add(id);
  return extensionStylesheets(fresh);
}
