/**
 * W-1075: the compat corpus compared by look. Each case's stored expected HTML and CSS and the
 * current renderer's output are opened as static pages in one browser, screenshotted at desktop,
 * tablet and phone widths, and compared pixel by pixel. Both sides render in the same browser in
 * the same run, so no screenshot is stored and the result doesn't depend on the machine's fonts
 * or GPU.
 *
 *   bun run compat:look [--base <git ref>] [--case <name>]... [--all] [--out <dir>]
 *
 * `--base` reads the expected files as they were at that commit (CI passes the pull request's
 * base), so a change that rewrites expected files together with the renderer is still compared
 * with the look before it. A case whose output is byte-identical to its reference looks the same
 * and isn't rendered unless `--all` is given. A visible change that is a deliberate bug fix
 * (D-065) is listed in packages/emvb/test/compat/look-changes.json with the hash of the new output.
 */
import type { Browser } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { baseConfig } from "../playwright.shared.ts";
import { caseNames, EXPECTED_DIR, renderCase } from "../packages/emvb/test/compat/render-case.ts";
import { compareImages, decodePng, encodePng } from "./compat-look/image.ts";

const ROOT = join(import.meta.dirname, "..");
const LOOK_CHANGES = join(ROOT, "packages/emvb/test/compat/look-changes.json");

export const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
] as const;

/** Largest per-channel difference still counted as the same pixel (anti-aliasing noise). */
const TOLERANCE = 24;

type Output = { html: string; css: string };

/**
 * A case's output as a standalone page: no network (the policy allows inline styles and data:
 * URLs only, and the browser aborts every request) and no script.
 */
export function staticPage({ html, css }: Output): string {
  const policy =
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>${css.replaceAll("</style", "<\\/style")}</style></head><body style="margin:0">${html}</body></html>`;
}

export const outputHash = ({ html, css }: Output) =>
  new Bun.CryptoHasher("sha256").update(`${html}\n${css}`).digest("hex");

type LookChange = { case: string; output: string; why: string };

export function readLookChanges(file = LOOK_CHANGES): LookChange[] {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { changes?: unknown };
  if (!Array.isArray(parsed.changes)) throw new Error(`${file}: "changes" must be an array`);
  return parsed.changes as LookChange[];
}

/** A visible change is accepted only for the exact output an entry names. */
export const isApproved = (changes: readonly LookChange[], name: string, output: Output) => {
  const hash = outputHash(output);
  return changes.some((change) => change.case === name && change.output === hash);
};

/**
 * The output a case is held to: its expected file at `base` (a git ref), or in the working tree
 * when there is no base or the case is newer than it.
 */
export function referenceOutput(name: string, base?: string): Output {
  const path = `packages/emvb/test/compat/expected/${name}.json`;
  if (base) {
    const shown = Bun.spawnSync(["git", "show", `${base}:${path}`], { cwd: ROOT, stderr: "pipe" });
    if (shown.exitCode === 0) return JSON.parse(shown.stdout.toString()) as Output;
  }
  return JSON.parse(readFileSync(join(EXPECTED_DIR, `${name}.json`), "utf8")) as Output;
}

/** Whether `ref` names a commit here; CI's "before" of a new branch is all zeros. */
function knownCommit(ref: string): boolean {
  if (/^0+$/.test(ref)) return false;
  return (
    Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: ROOT })
      .exitCode === 0
  );
}

async function screenshot(browser: Browser, page: string, viewport: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    javaScriptEnabled: false,
  });
  try {
    await context.route("**/*", (route) => route.abort());
    const tab = await context.newPage();
    await tab.setContent(page, { waitUntil: "load" });
    return decodePng(
      await tab.screenshot({ fullPage: true, animations: "disabled", caret: "hide" }),
    );
  } finally {
    await context.close();
  }
}

type Result = { name: string; status: "same-output" | "same-look" | "approved" | "changed" };

async function main() {
  const { values } = parseArgs({
    options: {
      base: { type: "string" },
      case: { type: "string", multiple: true },
      all: { type: "boolean", default: false },
      out: { type: "string", default: join(ROOT, "test-results/compat-look") },
    },
  });
  let base = values.base || process.env["EMVB_COMPAT_BASE"] || undefined;
  if (base && !knownCommit(base)) {
    // oxlint-disable-next-line no-console -- CLI output
    console.log(`Base ${base} isn't a known commit; comparing with the working tree's files.`);
    base = undefined;
  }
  const names = values.case?.length ? values.case : caseNames();
  const changes = readLookChanges();
  const started = performance.now();
  const results: Result[] = [];
  let browser: Browser | undefined;
  try {
    for (const name of names) {
      const reference = referenceOutput(name, base);
      const actual = renderCase(name);
      if (!values.all && outputHash(reference) === outputHash(actual)) {
        results.push({ name, status: "same-output" });
        continue;
      }
      // Loaded here so the unit tests can import this file without Playwright.
      const { chromium } = await import("@playwright/test");
      browser ??= await chromium.launch({
        executablePath: baseConfig.use.launchOptions.executablePath,
      });
      const changed: string[] = [];
      for (const viewport of VIEWPORTS) {
        const before = await screenshot(browser, staticPage(reference), viewport);
        const after = await screenshot(browser, staticPage(actual), viewport);
        const { differentPixels, sameSize, diff } = compareImages(before, after, TOLERANCE);
        if (differentPixels === 0) continue;
        changed.push(
          `${viewport.name}: ${differentPixels} px differ` +
            (sameSize
              ? ""
              : ` (${before.width}x${before.height} -> ${after.width}x${after.height})`),
        );
        mkdirSync(values.out, { recursive: true });
        const file = (kind: string) => join(values.out, `${name}-${viewport.name}-${kind}.png`);
        writeFileSync(file("expected"), encodePng(before));
        writeFileSync(file("actual"), encodePng(after));
        writeFileSync(file("diff"), encodePng(diff));
      }
      const status =
        changed.length === 0
          ? "same-look"
          : isApproved(changes, name, actual)
            ? "approved"
            : "changed";
      results.push({ name, status });
      // oxlint-disable-next-line no-console -- CLI output
      console.log(
        `${status === "changed" ? "look changed" : status}: ${name}${changed.length ? ` (${changed.join("; ")})` : ""}`,
      );
      if (status === "changed") {
        // oxlint-disable-next-line no-console -- CLI output
        console.log(
          `  If this is a deliberate fix (D-065), add to look-changes.json: ${JSON.stringify({ case: name, output: outputHash(actual), why: "W-…: …" })}`,
        );
      }
    }
  } finally {
    await browser?.close();
  }
  const count = (status: Result["status"]) => results.filter((r) => r.status === status).length;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  // oxlint-disable-next-line no-console -- CLI output
  console.log(
    `${results.length} cases against ${base ?? "the working tree"}: ${count("same-output")} same output, ` +
      `${count("same-look")} same look, ${count("approved")} approved changes, ${count("changed")} look changed (${seconds} s)`,
  );
  if (count("changed") > 0) {
    // oxlint-disable-next-line no-console -- CLI output
    console.log(`Screenshots of the differences: ${values.out}`);
    process.exit(1);
  }
}

if (import.meta.main) await main();
