/**
 * The Docs section (W-964) renders the repository's public docs at build time, so the site and
 * the repo can't drift. On those pages only (not the changelog), work-item and decision ids come
 * out of the text, links between docs point at site pages and other repo files at GitHub.
 */
import { dirname, join, normalize, relative } from "node:path";

const GITHUB = "https://github.com/PerkyZZ999/EmVB/blob/main/";

/** Docs on the site: repo path → page slug. */
export const DOC_FILES: Readonly<Record<string, string>> = {
  "docs/SCHEMA.md": "schema",
  "docs/EXTENSIONS.md": "extensions-api",
};
const GUIDES = "docs/guides/";

/** The site slug for a repo path, or undefined when the file isn't published as a doc page. */
export function docSlug(repoPath: string): string | undefined {
  if (DOC_FILES[repoPath]) return DOC_FILES[repoPath];
  if (
    repoPath.startsWith(GUIDES) &&
    repoPath.endsWith(".md") &&
    !repoPath.slice(GUIDES.length).includes("/")
  )
    return repoPath.slice(GUIDES.length, -3);
  return undefined;
}

const ID = String.raw`(?:decision\s+)?[WDRN]-\d{3,4}[a-z]?`;
const ONLY_IDS = new RegExp(String.raw`\s*\(\s*${ID}(?:\s*[,;]\s*${ID})*\s*\)`, "g");
const LEADING_IDS = new RegExp(String.raw`\((?:${ID}(?:\s*[,;]\s*|\s+))+`, "g");

/** Text without internal ids: "(W-1, D-2)" goes, "(W-938, additive)" keeps "(additive)". */
export function withoutIds(text: string): string {
  return text.replace(ONLY_IDS, "").replace(LEADING_IDS, "(");
}

/** Where a relative link in `file` points: a doc page, a GitHub URL, or unchanged. */
export function rewriteLink(url: string, file: string): string {
  if (/^(?:[a-z]+:|#|\/)/i.test(url)) return url;
  const [path = "", hash] = url.split("#");
  // The repo root from the doc's own path: bundled, this module no longer sits in the repo.
  const repo = file.slice(0, file.replaceAll("\\", "/").lastIndexOf("/docs/"));
  const target = relative(repo, normalize(join(dirname(file), path))).replaceAll("\\", "/");
  const slug = docSlug(target);
  if (slug) return `/docs/${slug}/${hash ? `#${hash}` : ""}`;
  if (target.startsWith("..")) return url;
  return `${GITHUB}${target}${hash ? `#${hash}` : ""}`;
}

/**
 * A doc's rendered HTML for the site: ids out of the text, links rewritten, and code blocks and
 * tables (which scroll sideways on phones) reachable from the keyboard.
 */
export function siteHtml(html: string, file: string): string {
  return withoutIds(html)
    .replace(/<(pre|table)(?=[\s>])(?![^>]*tabindex)/g, '<$1 tabindex="0"')
    .replace(
      /(<a\s[^>]*?href=")([^"]*)(")/g,
      (_match, start: string, url: string, end: string) =>
        `${start}${rewriteLink(url.replaceAll("&amp;", "&"), file)}${end}`,
    );
}

/** Sections that describe what ships in 1.1; while the site shows 1.0, they get a note. */
const COMING_IN_1_1: Readonly<Record<string, readonly { id: string; text: string }[]>> = {
  "leaving-emvb": [
    {
      id: "as-html-and-css-files-any-host",
      text: "Export pages ships in EmVB 1.1. On 1.0, take your layouts as JSON (below).",
    },
    {
      id: "as-rich-text-in-emdash-keep-emdash-drop-emvb",
      text: "Copying pages as rich text and Convert to rich text ship in EmVB 1.1.",
    },
  ],
  "native-page-editing": [
    { id: "back-to-rich-text", text: "Convert to rich text ships in EmVB 1.1." },
  ],
};

/** Adds a "New in 1.1" note under sections for features the released version doesn't have yet. */
export function withComingSoon(html: string, slug: string, version: string): string {
  if (!version.startsWith("1.0")) return html;
  let out = html;
  for (const { id, text } of COMING_IN_1_1[slug] ?? []) {
    out = out.replace(
      new RegExp(`(<h([23])[^>]*\\sid="${id}"[^>]*>[\\s\\S]*?</h\\2>)`),
      `$1<p class="coming"><span class="coming-badge">New in 1.1</span> Coming soon. ${text}</p>`,
    );
  }
  return out;
}
