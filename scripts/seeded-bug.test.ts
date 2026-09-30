import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSeed, verifySeeds, type Seed } from "./seeded-bug.ts";

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
