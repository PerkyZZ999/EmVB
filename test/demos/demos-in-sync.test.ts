import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const demos = join(import.meta.dir, "../../demos");
const PLATFORM_ONLY = new Set(["src/worker.ts"]);

async function sharedFiles(demo: string): Promise<Map<string, string>> {
  const root = join(demos, demo);
  const paths = ["src/**/*", "seed/**/*"].flatMap((pattern) =>
    Array.from(new Bun.Glob(pattern).scanSync({ cwd: root })),
  );
  const shared = paths.filter((path) => !PLATFORM_ONLY.has(path));
  const texts = await Promise.all(shared.map((path) => Bun.file(join(root, path)).text()));
  return new Map(shared.map((path, i) => [path, texts[i] ?? ""]));
}

// The two demos are standalone starter sites (D-021) with the same pages and seed; only the
// platform wiring differs. This keeps a fix made in one from silently missing the other.
describe("demo sites stay in sync", () => {
  test("the Node and Cloudflare demos share identical pages, layouts and seed", async () => {
    const node = await sharedFiles("node");
    const cloudflare = await sharedFiles("cloudflare");
    expect([...cloudflare.keys()].toSorted()).toEqual([...node.keys()].toSorted());
    const differing = [...node].filter(([path, text]) => cloudflare.get(path) !== text);
    expect(differing.map(([path]) => path)).toEqual([]);
  });
});
