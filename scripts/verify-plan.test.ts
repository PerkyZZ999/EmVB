import { expect, test } from "bun:test";
import {
  planProblems,
  previousRelease,
  startable,
  summaryTable,
  type Job,
  type Progress,
} from "./verify-plan.ts";

// W-1096: verify runs every gate side by side, never past the run's memory budget.

const job = (name: string, memGB: number, extra: Partial<Job> = {}): Job => ({
  name,
  title: name,
  command: ["true"],
  memGB,
  cpu: 1,
  ...extra,
});
const idle = (running: Job[] = [], done: string[] = [], failed: string[] = []): Progress => ({
  done: new Set(done),
  failed: new Set(failed),
  running,
});
const names = (jobs: Job[]) => jobs.map((j) => j.name);

test("W-1096: jobs start in plan order while their caps fit in the budget", () => {
  const plan = [job("e2e", 15), job("seeds", 12), job("unit", 6), job("lint", 2)];
  // seeds doesn't fit beside e2e and keeps its share, so the later jobs wait for it too.
  expect(names(startable(plan, idle(), { memGB: 24, cpu: 16 }).start)).toEqual(["e2e"]);
  const roomy = startable(plan, idle(), { memGB: 40, cpu: 16 });
  expect(names(roomy.start)).toEqual(["e2e", "seeds", "unit", "lint"]);
});

test("W-1096: short jobs use what is free now, even if a waiting bigger job keeps it", () => {
  const plan = [
    job("e2e", 15),
    job("seeds", 12),
    job("unit", 6, { short: true }),
    job("lint", 2, { short: true }),
    job("types", 3, { short: true }),
  ];
  // 15 + 6 + 2 fit in 24; types (3) would go past it.
  expect(names(startable(plan, idle(), { memGB: 24, cpu: 16 }).start)).toEqual([
    "e2e",
    "unit",
    "lint",
  ]);
});

test("W-1096: the caps of running and starting jobs never add up past the budget", () => {
  const plan = [job("a", 10), job("b", 8), job("c", 5), job("d", 3), job("e", 1)];
  const budget = { memGB: 20, cpu: 16 };
  const running: Job[] = [];
  let pending = [...plan];
  const done: string[] = [];
  // Finish the oldest job each round until everything ran.
  for (let round = 0; round < 20 && (pending.length > 0 || running.length > 0); round++) {
    const { start } = startable(pending, idle(running, done), budget);
    running.push(...start);
    pending = pending.filter((j) => !start.includes(j));
    expect(running.reduce((sum, j) => sum + j.memGB, 0)).toBeLessThanOrEqual(budget.memGB);
    const finished = running.shift();
    if (finished) done.push(finished.name);
  }
  expect(done.toSorted()).toEqual(["a", "b", "c", "d", "e"]);
});

test("W-1096: a job alone always starts, under its own cap, even past the budget", () => {
  expect(names(startable([job("big", 30)], idle(), { memGB: 24, cpu: 16 }).start)).toEqual(["big"]);
});

test("W-1096: a job waits for its after jobs and is skipped when one failed", () => {
  const plan = [job("stock", 10, { after: ["pack"] }), job("lint", 1)];
  expect(names(startable(plan, idle(), { memGB: 24, cpu: 16 }).start)).toEqual(["lint"]);
  expect(names(startable(plan, idle([], ["pack"]), { memGB: 24, cpu: 16 }).start)).toEqual([
    "stock",
    "lint",
  ]);
  const failed = startable(plan, idle([], [], ["pack"]), { memGB: 24, cpu: 16 });
  expect(names(failed.skip)).toEqual(["stock"]);
  expect(names(failed.start)).toEqual(["lint"]);
});

test("W-1096: jobs that share folders never run side by side, whichever names the other", () => {
  const prod = job("e2e-prod", 10, { excludes: ["e2e", "box"] });
  const budget = { memGB: 64, cpu: 64 };
  expect(names(startable([prod], idle([job("e2e", 15)]), budget).start)).toEqual([]);
  expect(names(startable([job("box", 3)], idle([prod]), budget).start)).toEqual([]);
  expect(names(startable([prod, job("box", 3)], idle(), budget).start)).toEqual(["e2e-prod"]);
});

test("W-1096: CPU is shared like memory", () => {
  const plan = [job("a", 1, { cpu: 10 }), job("b", 1, { cpu: 10 }), job("c", 1, { cpu: 4 })];
  expect(names(startable(plan, idle(), { memGB: 64, cpu: 16 }).start)).toEqual(["a"]);
});

test("W-1096: the plan check names unknown jobs, cycles and caps over the budget", () => {
  const problems = planProblems(
    [
      job("a", 30, { after: ["b"] }),
      job("b", 1, { after: ["a"] }),
      job("c", 1, { excludes: ["nope"] }),
      job("c", 1),
    ],
    { memGB: 24, cpu: 16 },
  );
  expect(problems).toContain("a: its 30 GB cap is over the 24 GB budget");
  expect(problems).toContain("c: unknown job nope");
  expect(problems).toContain("c: duplicate name");
  expect(problems).toContain("a: circular after");
  expect(problems).toContain("b: circular after");
  expect(planProblems([job("x", 1), job("y", 1, { after: ["x"] })], { memGB: 2, cpu: 2 })).toEqual(
    [],
  );
});

test("W-1096: the release base is the newest release commit of another version", () => {
  // Made-up versions: release.test.ts refuses any tracked file that quotes the current one.
  const log = [
    "aaaa0004 chore(W-9003): release 7.8.9",
    "aaaa0003 test(W-9002): a fix after the bump",
    "aaaa0002 docs: 7.8.8 release checks (W-9001)",
    "aaaa0001 chore(W-9001): release 7.8.8",
    "aaaa0000 chore: release 7.7.0 (prepared; gate pending)",
  ].join("\n");
  expect(previousRelease(log, "7.8.9")).toBe("aaaa0001");
  // Before the bump, the current version is still the last release's.
  expect(previousRelease(log.split("\n").slice(1).join("\n"), "7.8.8")).toBe("aaaa0000");
  expect(previousRelease("abc docs: release notes", "7.0.0")).toBeUndefined();
});

test("W-1096: the summary lists every job with its times and memory, and what failed", () => {
  const text = summaryTable(
    [
      {
        job: job("e2e", 15),
        status: "passed",
        startedS: 0,
        seconds: 360,
        peakGB: 11.2,
        cpuS: 2880,
      },
      { job: job("stock", 10), status: "skipped", detail: "skipped: pack failed" },
      { job: job("pack", 2), status: "failed", startedS: 60, seconds: 30, detail: "exit 1: boom" },
    ],
    900,
    19.4,
  );
  expect(text).toContain("e2e");
  expect(text).toMatch(/ok\s+e2e\s+0\.0\s+6\.0\s+11\.2\s+15\s+8\.0/);
  expect(text).toContain("skipped: pack failed");
  expect(text).toContain("exit 1: boom");
  expect(text).toContain(
    "wall 15.0 min, peak of all jobs together 19.4 GB; 2 not passed: stock, pack",
  );
});
