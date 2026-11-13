import { expect, test } from "bun:test";
import { join } from "node:path";
import {
  LAYOUT_SCHEMA_VERSION,
  renderPage,
  validateDesign,
  validateLayout,
} from "../packages/emvb/src/core/index.ts";
import {
  journalLayout,
  landingLayout,
  SEED_DESIGN,
  SEED_POSTS,
} from "../site/src/playground/mock/seed.ts";
import { caseName, snapshot } from "./compat-snapshot.ts";

// W-1017: a release's pages for the compatibility corpus. The 1.1.0 pages were made from the
// 1.1.0 release commit; made again now, they must come out the same, file for file.

// The script reads any release's core, so it types it loosely.
const core = {
  LAYOUT_SCHEMA_VERSION,
  renderPage,
  validateDesign,
  validateLayout,
} as unknown as Parameters<typeof snapshot>[0];
const seed = { SEED_DESIGN, SEED_POSTS, landingLayout, journalLayout };
const CORPUS = join(import.meta.dirname, "../packages/emvb/test/compat");
const read = async (dir: string, name: string) =>
  (await Bun.file(join(CORPUS, dir, `${name}.json`)).json()) as unknown;

test("W-1017: a corpus name carries the layout schema, the version and the page", () => {
  expect(caseName(18, "1.2.0", "landing")).toBe("v18-1.2.0-playground-landing");
});

test("W-1017: the landing and Journal pages, with the Journal's posts", () => {
  const pages = snapshot(core, seed, "9.9.0");
  expect(pages.map((p) => p.name)).toEqual([
    `v${LAYOUT_SCHEMA_VERSION}-9.9.0-playground-landing`,
    `v${LAYOUT_SCHEMA_VERSION}-9.9.0-playground-journal`,
  ]);
  expect(pages[1]?.stored).toHaveProperty("dynamic.posts", [...seed.SEED_POSTS]);
  expect(pages[1]?.expected.html).toContain(seed.SEED_POSTS[0]?.title ?? "missing");
});

test("W-1017: the stored 1.1.0 pages, snapshotted again, give the same files", async () => {
  type Stored = { design: unknown; layout: unknown; dynamic?: { posts: unknown[] } };
  const landing = (await read("cases", "v18-1.1.0-playground-landing")) as Stored;
  const journal = (await read("cases", "v18-1.1.0-playground-journal")) as Stored;
  const stored = {
    SEED_DESIGN: landing.design,
    SEED_POSTS: journal.dynamic?.posts ?? [],
    landingLayout: () => landing.layout,
    journalLayout: () => journal.layout,
  };
  for (const page of snapshot(core, stored, "1.1.0")) {
    expect(JSON.parse(JSON.stringify(page.stored))).toEqual(await read("cases", page.name));
    expect(page.expected).toEqual((await read("expected", page.name)) as never);
  }
});
