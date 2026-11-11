import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runSeed,
  selectSeeds,
  failedTest,
  probeShows,
  servedFiles,
  withoutReloadStamps,
  selfCheck,
  verifySeeds,
  warmPlatform,
  type Seed,
} from "./seeded-bug.ts";

let root = "";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "emvb-seeds-"));
  await writeFile(join(root, "value.txt"), "value=good\n");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// The "check" under test: fails with a message when value.txt no longer says "good".
const check = ["sh", "-c", "grep -q 'value=good' value.txt || { echo 'bad value'; exit 1; }"];
const seed = (overrides: Partial<Seed>): Seed => ({
  id: "t",
  requirement: "N-001",
  description: "test seed",
  edits: [{ file: "value.txt", search: "value=good", replace: "value=bad" }],
  command: check,
  expect: "bad value",
  ...overrides,
});

test("a mutation that makes the check fail is reported as caught, and the file is restored", async () => {
  const result = await runSeed(root, seed({}));
  expect(result).toMatchObject({ status: "caught", exitCode: 1, detail: "bad value" });
  expect(await readFile(join(root, "value.txt"), "utf8")).toBe("value=good\n");
});

test("a mutation that the check does not notice is reported as not caught", async () => {
  const result = await runSeed(
    root,
    seed({ edits: [{ file: "value.txt", search: "\n", replace: "\n\n" }] }),
  );
  expect(result.status).toBe("not-caught");
  expect(await readFile(join(root, "value.txt"), "utf8")).toBe("value=good\n");
});

test("a failure with the wrong message does not count as caught", async () => {
  const result = await runSeed(root, seed({ expect: "some other error" }));
  expect(result.status).toBe("wrong-failure");
});

test("a seed whose search text no longer matches is reported as stale", async () => {
  const result = await runSeed(
    root,
    seed({ edits: [{ file: "value.txt", search: "missing", replace: "x" }] }),
  );
  expect(result.status).toBe("stale");
});

test("files created by a seed are removed afterwards", async () => {
  const result = await runSeed(
    root,
    seed({
      edits: [],
      creates: [{ file: "extra/marker.txt", content: "x" }],
      command: ["sh", "-c", "test -f extra/marker.txt && echo 'bad value' && exit 1"],
    }),
  );
  expect(result.status).toBe("caught");
  expect(await Bun.file(join(root, "extra/marker.txt")).exists()).toBe(false);
});

test("verify reports nothing for seeds that still apply, and leaves files alone", async () => {
  const chained = seed({
    id: "chained",
    edits: [
      { file: "value.txt", search: "value=good", replace: "value=bad" },
      { file: "value.txt", search: "value=bad", replace: "value=worse" },
    ],
  });
  expect(await verifySeeds(root, [seed({}), chained])).toEqual([]);
  expect(await readFile(join(root, "value.txt"), "utf8")).toBe("value=good\n");
});

test("verify names each seed that drifted, and why", async () => {
  await writeFile(join(root, "twice.txt"), "x x\n");
  const problems = await verifySeeds(root, [
    seed({ id: "gone", edits: [{ file: "value.txt", search: "missing", replace: "x" }] }),
    seed({ id: "twice", edits: [{ file: "twice.txt", search: "x", replace: "y" }] }),
    seed({ id: "nofile", edits: [{ file: "nope.txt", search: "a", replace: "b" }] }),
    seed({ id: "exists", edits: [], creates: [{ file: "value.txt", content: "" }] }),
    seed({ id: "regex", expect: "(" }),
    seed({ id: "twice" }),
  ]);
  expect(problems).toEqual([
    'gone: "missing" occurs 0 times in value.txt',
    'twice: "x" occurs 2 times in twice.txt',
    "nofile: nope.txt does not exist",
    "exists: value.txt already exists",
    "regex: expect is not a valid regex: (",
    "twice: duplicate id",
  ]);
});

test("W-917: --changed-since keeps only seeds that edit or create a changed file", () => {
  const fake = (id: string, file: string, creates = false): Seed => ({
    id,
    requirement: "W-917",
    description: id,
    ...(creates
      ? { creates: [{ file, content: "" }] }
      : { edits: [{ file, search: "a", replace: "b" }] }),
    command: ["true"],
    expect: "x",
  });
  const seeds = [
    fake("W-1/a", "src/a.ts"),
    fake("W-2/b", "src/b.ts"),
    fake("W-3/c", "src/c.ts", true),
  ];
  const files = new Set(["src/b.ts", "src/c.ts"]);
  expect(selectSeeds(seeds, { files }).map((s) => s.id)).toEqual(["W-2/b", "W-3/c"]);
  expect(selectSeeds(seeds, { only: "W-2", files }).map((s) => s.id)).toEqual(["W-2/b"]);
  expect(selectSeeds(seeds, {}).length).toBe(3);
  expect(selectSeeds(seeds, { files: new Set() })).toEqual([]);
});

test("W-985: the self-check needs a caught seed and an escaping no-op", async () => {
  expect(await selfCheck(root, seed({}))).toBeNull();
  // A runner that couldn't tell them apart (every run fails) is refused.
  const alwaysFails = seed({ command: ["sh", "-c", "echo 'bad value'; exit 1"] });
  expect(await selfCheck(root, alwaysFails)).toContain("no-op seed should escape");
  // A seed its check doesn't notice is refused too.
  const blind = seed({ edits: [{ file: "value.txt", search: "\n", replace: "\n\n" }] });
  expect(await selfCheck(root, blind)).toContain("should be caught");
});

test("W-985: only dev-server e2e seeds share a warm server, by platform", () => {
  const e2e = (command: string) => seed({ command: command.split(" ") });
  expect(warmPlatform(e2e("bun run e2e e2e/a.e2e.ts --project=node -g x"))).toBe("node");
  expect(warmPlatform(e2e("bun run e2e e2e/a.e2e.ts --project=cloudflare"))).toBe("cloudflare");
  expect(warmPlatform(e2e("bun run e2e e2e/a.e2e.ts"))).toBe("both");
  expect(warmPlatform(e2e("bun run e2e:prod e2e/a.prod.ts"))).toBeNull();
  expect(warmPlatform(e2e("bun test packages/x.test.ts"))).toBeNull();
});

const state = (
  instance: string,
  files: Record<string, string>,
  client: Record<string, string>,
) => ({ instance, files, client });

test("W-986: a mutation counts as applied only once every signal of the file moved", () => {
  const f = ["/w/a.ts"];
  const base = state("i", { "/w/a.ts": "0" }, { "/w/a.ts": "h0" });
  // Neither moved yet; only the browser module; only the server module; both.
  expect(probeShows("applied", base, base, base, f)).toBe(false);
  expect(
    probeShows("applied", base, base, state("i", { "/w/a.ts": "0" }, { "/w/a.ts": "h1" }), f),
  ).toBe(false);
  expect(
    probeShows("applied", base, base, state("i", { "/w/a.ts": "1" }, { "/w/a.ts": "h0" }), f),
  ).toBe(false);
  expect(
    probeShows("applied", base, base, state("i", { "/w/a.ts": "1" }, { "/w/a.ts": "h1" }), f),
  ).toBe(true);
  // A mutation that breaks the module's import counts; so does a restarted server.
  expect(
    probeShows(
      "applied",
      base,
      base,
      state("i", { "/w/a.ts": "error: x" }, { "/w/a.ts": "h1" }),
      f,
    ),
  ).toBe(true);
  expect(
    probeShows("applied", base, base, state("j", { "/w/a.ts": "0" }, { "/w/a.ts": "h1" }), f),
  ).toBe(true);
});

test("W-986: a restore counts only when the server re-evaluated it and the browser module is clean", () => {
  const f = ["/w/a.ts"];
  const base = state("i", { "/w/a.ts": "0" }, { "/w/a.ts": "h0" });
  const mutated = state("i", { "/w/a.ts": "1" }, { "/w/a.ts": "h1" });
  // The server still has the mutated module, or the browser module isn't the clean one yet.
  expect(probeShows("restored", base, mutated, mutated, f)).toBe(false);
  expect(
    probeShows("restored", base, mutated, state("i", { "/w/a.ts": "1" }, { "/w/a.ts": "h0" }), f),
  ).toBe(false);
  expect(
    probeShows("restored", base, mutated, state("i", { "/w/a.ts": "2" }, { "/w/a.ts": "h1" }), f),
  ).toBe(false);
  expect(
    probeShows(
      "restored",
      base,
      mutated,
      state("i", { "/w/a.ts": "error: x" }, { "/w/a.ts": "h0" }),
      f,
    ),
  ).toBe(false);
  expect(
    probeShows("restored", base, mutated, state("i", { "/w/a.ts": "2" }, { "/w/a.ts": "h0" }), f),
  ).toBe(true);
  // After a mutation that broke the import, any newer evaluation than the clean one.
  const broken = state("i", { "/w/a.ts": "error: x" }, { "/w/a.ts": "h1" });
  expect(
    probeShows("restored", base, broken, state("i", { "/w/a.ts": "1" }, { "/w/a.ts": "h0" }), f),
  ).toBe(true);
});

test("W-986: a file the probe can't see proves nothing, and specs need no proof", () => {
  const f = ["/w/a.ts"];
  const blind = state(
    "i",
    { "/w/a.ts": "error: window is not defined" },
    { "/w/a.ts": "status 404" },
  );
  const moved = state("j", { "/w/a.ts": "error: other" }, { "/w/a.ts": "status 404" });
  expect(probeShows("applied", blind, blind, moved, f)).toBe(false);
  expect(probeShows("restored", blind, moved, moved, f)).toBe(false);
  // Only the server module can be imported: that signal alone decides.
  const server = state("i", { "/w/a.ts": "0" }, { "/w/a.ts": "status 500" });
  expect(
    probeShows(
      "applied",
      server,
      server,
      state("i", { "/w/a.ts": "1" }, { "/w/a.ts": "status 500" }),
      f,
    ),
  ).toBe(true);
  expect(
    servedFiles(
      "/w",
      seed({
        edits: [
          { file: "e2e/a.e2e.ts", search: "a", replace: "b" },
          { file: "packages/x.ts", search: "a", replace: "b" },
        ],
      }),
    ),
  ).toEqual(["/w/packages/x.ts"]);
});

test("W-986: the clean re-run takes the test that failed, never the sign-in setup", () => {
  expect(
    failedTest(
      "  ✓  1 [node-setup] › e2e/auth.setup.ts:4:1 › sign in\n  ✘  2 [node] › e2e/editor.e2e.ts:47:1 › canvas width (2.1s)\n",
    ),
  ).toBe("e2e/editor.e2e.ts:47");
  expect(failedTest("  ✘  1 [node-setup] › e2e/auth.setup.ts:4:1 › sign in\n")).toBeUndefined();
  expect(failedTest("  ✓  1 [node] › e2e/a.e2e.ts:3:1 › fine\n")).toBeUndefined();
});

test("W-986: a restored browser module matches its clean one despite Vite's reload stamps", () => {
  const clean = 'import * as m from "/@fs/w/LengthRow.tsx";\nimport x from "/@fs/w/x.ts?v=ab";';
  const restored =
    'import * as m from "/@fs/w/LengthRow.tsx?t=1794419931752";\nimport x from "/@fs/w/x.ts?t=12&v=ab";';
  expect(withoutReloadStamps(restored)).toBe(clean);
  expect(withoutReloadStamps('const t = "/a.ts?v=ab&t=4";')).toBe('const t = "/a.ts?v=ab";');
});
