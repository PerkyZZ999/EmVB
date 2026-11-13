/**
 * W-1017: adds a release's pages to the compatibility corpus (packages/emvb/test/compat): the
 * playground's landing and Journal pages as that release saves them, and their public render by
 * that release's own code. The compat test then holds every later version to the same output.
 *
 *   bun scripts/compat-snapshot.ts <version> [--root <checkout of that release>]
 *
 * The release script runs it for each new version; for an older one, point --root at a worktree
 * of its release commit (its core and playground seed are read from there).
 */
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CORPUS = join(ROOT, "packages/emvb/test/compat");

/** The parts of a release's core this reads. Methods, so any release's own parameter types fit. */
type Core = {
  LAYOUT_SCHEMA_VERSION: number;
  validateLayout(raw: unknown): { ok: true; layout: unknown } | { ok: false; issues: unknown };
  validateDesign(raw: unknown): { ok: true; design: unknown } | { ok: false; issues: unknown };
  renderPage(
    layout: unknown,
    design: unknown,
    options: { scope: string; dynamic?: unknown },
  ): { html: string; css: string };
};
type Seed = {
  SEED_DESIGN: unknown;
  SEED_POSTS: readonly unknown[];
  landingLayout: () => unknown;
  journalLayout: () => unknown;
};

/** Corpus file name of one page saved by one release, e.g. "v18-1.1.0-playground-landing". */
export const caseName = (schema: number, version: string, page: string) =>
  `v${schema}-${version}-playground-${page}`;

/** The pages a release adds: its playground's landing and Journal pages, rendered by `core`. */
export function snapshot(core: Core, seed: Seed, version: string) {
  const design = core.validateDesign(seed.SEED_DESIGN);
  if (!design.ok) throw new Error(`playground design: ${JSON.stringify(design.issues)}`);
  const pages = [
    { page: "landing", layout: seed.landingLayout(), dynamic: undefined },
    { page: "journal", layout: seed.journalLayout(), dynamic: { posts: [...seed.SEED_POSTS] } },
  ];
  return pages.map(({ page, layout, dynamic }) => {
    const name = caseName(core.LAYOUT_SCHEMA_VERSION, version, page);
    const valid = core.validateLayout(layout);
    if (!valid.ok) throw new Error(`${name}: ${JSON.stringify(valid.issues)}`);
    const { html, css } = core.renderPage(valid.layout, design.design, {
      scope: name,
      ...(dynamic ? { dynamic } : {}),
    });
    const stored = {
      source: `The playground's ${page} page as EmVB ${version} saves it (W-1017); expected output rendered by ${version}.`,
      design: seed.SEED_DESIGN,
      layout,
      ...(dynamic ? { dynamic } : {}),
    };
    return { name, stored, expected: { html, css } };
  });
}

if (import.meta.main) {
  const version = process.argv[2];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("usage: bun scripts/compat-snapshot.ts <x.y.z> [--root <checkout>]");
  const i = process.argv.indexOf("--root");
  const root = i < 0 ? ROOT : (process.argv[i + 1] ?? ROOT);
  const core = (await import(join(root, "packages/emvb/src/core/index.ts"))) as Core;
  const seed = (await import(join(root, "site/src/playground/mock/seed.ts"))) as Seed;
  const written: string[] = [];
  for (const { name, stored, expected } of snapshot(core, seed, version)) {
    await Bun.write(join(CORPUS, "cases", `${name}.json`), `${JSON.stringify(stored, null, 2)}\n`);
    await Bun.write(
      join(CORPUS, "expected", `${name}.json`),
      `${JSON.stringify(expected, null, 2)}\n`,
    );
    written.push(name);
  }
  // oxlint-disable-next-line no-console -- a CLI
  console.log(`compat corpus: added ${written.join(", ")}`);
}
