import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runSeed,
  selectSeeds,
  failedTestCommand,
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

test("W-985: the clean re-run runs only the test that failed, with the seed's projects", () => {
  const output =
    "  ✓  1 [node-setup] › e2e/auth.setup.ts:4:1 › sign in\n  ✘  2 [node] › e2e/editor.e2e.ts:47:1 › canvas width (2.1s)\n";
  expect(
    failedTestCommand(
      ["bun", "run", "e2e", "e2e/editor.e2e.ts", "--project=node", "-g", "x"],
      output,
    ),
  ).toEqual(["bun", "run", "e2e", "e2e/editor.e2e.ts:47", "--project=node"]);
  // A failed sign-in isn't a caught seed's test.
  expect(
    failedTestCommand(
      ["bun", "run", "e2e", "e2e/editor.e2e.ts"],
      "  ✘  1 [node-setup] › e2e/auth.setup.ts:4:1 › sign in\n",
    ),
  ).toBeUndefined();
});
