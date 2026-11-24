import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FILE_OVERHEAD_S,
  groupSeconds,
  mergeTimings,
  namedFiles,
  parseListTimings,
  partition,
  shardPorts,
  splitArgs,
  startGates,
  takeStartLock,
} from "./e2e-shards.ts";

// W-1096: e2e:full splits each platform's spec files over parallel runs, each on its own site.

const LIST = `
Running 6 tests using 1 worker

  ✓    1 [node-setup] › e2e/auth.setup.ts:4:1 › sign in as the dev admin and warm up the admin (5.7s)
  ✓    2 [node] › e2e/a11y.e2e.ts:14:1 › published EmVB page has no serious axe violations (W-041) (1.1s)
  ✓    3 [node] › e2e/access.e2e.ts:49:3 › subscriber (10): no Visual pages link (6.3s)
  ✘    4 [node] › e2e/access.e2e.ts:90:3 › editor (40): sees the link (1.0m)
  -    5 [node] › e2e/bombadil.e2e.ts:50:1 › skipped one (0ms)
  ✓    6 [node] › e2e/bombadil.e2e.ts:67:1 › a carousel in a hidden tab (355ms)
`;

test("W-1096: file timings sum each file's tests from the list reporter, without the sign-in", () => {
  const timings = parseListTimings(LIST);
  expect(Object.keys(timings).toSorted()).toEqual([
    "e2e/a11y.e2e.ts",
    "e2e/access.e2e.ts",
    "e2e/bombadil.e2e.ts",
  ]);
  expect(timings["e2e/a11y.e2e.ts"]).toBeCloseTo(1.1 + FILE_OVERHEAD_S, 5);
  expect(timings["e2e/access.e2e.ts"]).toBeCloseTo(6.3 + 60 + FILE_OVERHEAD_S, 5);
  expect(timings["e2e/bombadil.e2e.ts"]).toBeCloseTo(0.4 + FILE_OVERHEAD_S, 5);
});

test("W-1096: newer timings replace older ones per file and keep the rest", () => {
  const merged = mergeTimings(
    { node: { a: 1, b: 2 }, cloudflare: { a: 5 } },
    { node: { b: 3, c: 4 } },
  );
  expect(merged).toEqual({ node: { a: 1, b: 3, c: 4 }, cloudflare: { a: 5 } });
});

test("W-1096: the split puts every file in exactly one shard and evens out the time", () => {
  const timings = { a: 50, b: 40, c: 30, d: 20, e: 10, f: 10, g: 5, h: 5 };
  const files = Object.keys(timings);
  const groups = partition(files, 3, timings);
  expect(groups).toHaveLength(3);
  expect(groups.flat().toSorted()).toEqual(files.toSorted());
  expect(new Set(groups.flat()).size).toBe(files.length);
  const totals = groupSeconds(groups, timings);
  // 170 s over three: the longest shard is within the longest single file of the ideal.
  expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(10);
  // Each shard keeps the files' own (alphabetical) order.
  for (const group of groups) expect(group).toEqual(group.toSorted());
});

test("W-1096: a file with no timing counts as the median, and more shards than files leaves none empty", () => {
  const groups = partition(["x", "y", "new"], 5, { x: 10, y: 30 });
  expect(groups).toHaveLength(3);
  expect(groups.every((g) => g.length === 1)).toBe(true);
  const two = partition(["x", "y", "new"], 2, { x: 10, y: 30 });
  // The unknown file costs 30 (the upper median of 10 and 30), so x joins one of the two 30s.
  expect(two.map((g) => g.join(",")).toSorted()).toEqual(["x,new", "y"]);
});

test("W-1096: the split is the same every time for the same input", () => {
  const timings = { a: 3, b: 3, c: 3, d: 3 };
  const files = Object.keys(timings);
  expect(partition(files, 2, timings)).toEqual(partition(files, 2, timings));
  expect(partition(files, 1, timings)).toEqual([files]);
});

test("W-1096: shard ports keep 4411/4412 for the first shard and stay clear of each other", () => {
  expect(shardPorts(4411, 0)).toEqual({ node: 4411, cloudflare: 4412 });
  expect(shardPorts(4411, 3)).toEqual({ node: 4441, cloudflare: 4442 });
  const all = [0, 1, 2, 3, 4, 5].flatMap((k) => Object.values(shardPorts(5411, k)));
  expect(new Set(all).size).toBe(all.length);
});

test("W-1096: e2e:full's own flags are taken out, the rest goes to Playwright", () => {
  expect(
    splitArgs([
      "--shards",
      "3",
      "--platform=node",
      "e2e/a.e2e.ts",
      "-g",
      "W-1",
      "--port-base=5411",
    ]),
  ).toEqual({
    shards: 3,
    platforms: ["node"],
    portBase: 5411,
    playwright: ["e2e/a.e2e.ts", "-g", "W-1"],
  });
  expect(splitArgs(["--only-shard=2", "--shards=4"])).toEqual({
    only: 2,
    shards: 4,
    playwright: [],
  });
  expect(splitArgs(["--shards", "node=3,cloudflare=2"]).shards).toEqual({ node: 3, cloudflare: 2 });
});

test("W-1096: named files are split; a file:line or --shard filter keeps one run", () => {
  expect(namedFiles(["e2e/a.e2e.ts", "-g", "e2e/not-a-file", "e2e/b.e2e.ts"])).toEqual({
    files: ["e2e/a.e2e.ts", "e2e/b.e2e.ts"],
    lines: false,
  });
  expect(namedFiles(["e2e/a.e2e.ts:12"])).toEqual({ files: ["e2e/a.e2e.ts"], lines: true });
  expect(namedFiles(["--shard=1/2"]).lines).toBe(true);
  expect(namedFiles(["--trace", "on", "--workers=1"])).toEqual({ files: [], lines: false });
});

test("W-1096: a platform's runs start one after another; the other platform doesn't wait", async () => {
  const turn = startGates();
  const order: string[] = [];
  const first = await turn("node");
  order.push("node-1");
  const second = turn("node").then((done) => {
    order.push("node-2");
    return done;
  });
  const cloudflare = turn("cloudflare").then((done) => {
    order.push("cloudflare-1");
    return done;
  });
  await (
    await cloudflare
  )();
  await Bun.sleep(10);
  // node-2 waits for node-1's server; Cloudflare's first run doesn't.
  expect(order).toEqual(["node-1", "cloudflare-1"]);
  first();
  (await second)();
  expect(order).toEqual(["node-1", "cloudflare-1", "node-2"]);
});

test("W-1096: runs that start later get less, so all of a platform's runs end together", () => {
  const timings = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}`, 10]));
  const files = Object.keys(timings);
  const [first = [], , last = []] = partition(files, 3, timings, 30);
  // 300 s over three runs that start 0, 30 and 60 s in: 13, 10 and 7 files of 10 s each.
  expect(first.length - last.length).toBe(6);
  expect(partition(files, 3, timings).map((g) => g.length)).toEqual([10, 10, 10]);
});

test("W-1096: only one e2e:full run at a time starts its server", async () => {
  const dir = mkdtempSync(join(tmpdir(), "emvb-start-lock-"));
  const lock = join(dir, ".start.lock");
  const first = await takeStartLock(lock);
  const probe = Bun.spawnSync(["flock", "--shared", "--nonblock", lock, "true"]);
  const second = takeStartLock(lock);
  first();
  (await second)();
  rmSync(dir, { recursive: true, force: true });
  expect(probe.exitCode).toBe(1);
});
