/**
 * W-1096: one command for every gate, run side by side within a memory budget.
 *
 *   bun run verify            day to day: everything `bun run check` runs, the whole e2e suite on
 *                             both demos, and the seeded bugs of files changed since main
 *   bun run verify:release    a release: the same, with the seeded bugs changed since the last
 *                             release, plus e2e:prod, pack:smoke and the release tarballs, the stock
 *                             EmDash install smoke and the box round
 *
 *   Options: --since <ref> (seeds changed since; default main's merge-base, or the last release)
 *            --all-seeds   (the whole manifest)        --logs <dir>  (default .verify/<time>)
 *            --budget <GB> (memory for all jobs, 24)   --cpu <n>     (cores to fill, all)
 *            --only a,b / --skip a,b (job names)       --dry-run     (print the plan)
 *            --e2e-shards 2,2 (e2e runs for the node and Cloudflare demos), --seed-jobs n,
 *            --seed-lanes n, --no-cap (no systemd memory caps)
 *
 * Each job runs in its own systemd scope with its memory cap (MemoryMax, no swap) and its own log
 * in the logs folder; a job starts only when its cap fits in the budget, and its cores in the
 * machine's, beside the running ones (scripts/verify-plan.ts). At the end it prints each job's
 * start, minutes, peak memory and cores, the peak of all jobs together and the machine's lowest
 * available memory, and exits non-zero if any job failed. Run it under the shared heavy-run lock
 * where there is one (`flock <lock> bun run verify:release`), without an outer memory cap.
 */
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import {
  planProblems,
  previousRelease,
  startable,
  summaryTable,
  type Budget,
  type Job,
  type Outcome,
} from "./verify-plan.ts";

const ROOT = join(import.meta.dir, "..");

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1) return process.argv[i + 1];
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const list = (name: string) => (option(name) ?? "").split(",").filter(Boolean);

async function git(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return out.trim();
}

const release = flag("release");
const version = (
  JSON.parse(readFileSync(join(ROOT, "packages/emvb/package.json"), "utf8")) as { version: string }
).version;
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const logs = resolve(option("logs") ?? join(ROOT, ".verify", stamp));
const budget: Budget = {
  memGB: Number(option("budget") ?? 24),
  // No more than the machine has: with half again as many, unit tests and unit seeds beside the
  // Cloudflare e2e slowed its editor loads past their timeouts (5 failures, 2026-11-21).
  cpu: Number(option("cpu") ?? availableParallelism()),
};
const capped = !flag("no-cap") && Bun.which("systemd-run") !== null;

async function seedBase(): Promise<string | undefined> {
  if (flag("all-seeds")) return undefined;
  const given = option("since");
  if (given) return given;
  if (release) {
    const base = previousRelease(await git("log", "--format=%H %s", "-n", "2000"), version);
    if (!base) throw new Error("no earlier release commit found: pass --since <ref>");
    return base;
  }
  return git("merge-base", "HEAD", "main").catch(() => "HEAD");
}

const since = await seedBase();
/**
 * e2e runs per demo (W-1096, measured on the 16-core machine): a node run (dev server, Chromium,
 * runner) holds about 4 GB (its dev server reaches 3–4 GB while Vite optimises dependencies), a
 * Cloudflare one (Vite, workerd) about 5.5 GB, and Cloudflare's suite is the longer one; two runs
 * each end about together. Each demo is its own job, so the node demo's memory goes to the next
 * jobs as soon as its runs end.
 */
const [nodeShards = 2, cfShards = nodeShards] = (option("e2e-shards") ?? "2,2")
  .split(",")
  .map(Number);
const seedJobs = Number(option("seed-jobs") ?? 4);
const seedLanes = Number(option("seed-lanes") ?? 2);
const unitWorkers = Math.max(2, Math.min(8, Math.floor(availableParallelism() / 2)));
const seedSince = since ? ["--changed-since", since] : [];
const seedCache = release && since ? ["--cache"] : [];
const seedsWhat = since ? `changed since ${since.slice(0, 12)}` : "all";
const e2eJob = (platform: "node" | "cloudflare", shards: number, perRunGB: number): Job => ({
  name: platform === "node" ? "e2e-node" : "e2e-cf",
  title: `e2e suite on the ${platform} demo, ${shards} runs`,
  // 4811 + 10k: clear of the seed lanes (4411 + 100n), e2e:prod (64xx), PostgreSQL's 5432.
  command: [
    "bun",
    "scripts/e2e-full.ts",
    "--platform",
    platform,
    "--shards",
    String(shards),
    "--port-base",
    "4811",
  ],
  memGB: Math.ceil(shards * perRunGB + 2),
  cpu: shards * 1.5,
});

// Caps from the 2026-11-21 runs: each job's resident peak plus 10–30 % (a dev server reaches
// 3.3 GB while Vite optimises dependencies). Longest jobs first.
const jobs: Job[] = [
  e2eJob("cloudflare", cfShards, 5),
  e2eJob("node", nodeShards, 4.5),
  {
    name: "seeds-e2e",
    title: `seeded bugs on the demos (${seedsWhat}), ${seedLanes} warm lanes`,
    // --jobs 2 keeps every lane in a worktree, away from this checkout's servers and builds.
    command: [
      "bun",
      "scripts/seeded-bug.ts",
      ...seedSince,
      ...seedCache,
      "--kind",
      "e2e",
      "--jobs",
      "2",
      "--e2e-lanes",
      String(seedLanes),
    ],
    memGB: seedLanes * 5 + 2,
    cpu: seedLanes * 2,
  },
  {
    // Unit seeds need little memory and none of the demos' ports; they go wherever they fit.
    name: "seeds-unit",
    title: `seeded bugs without the demos (${seedsWhat}), ${seedJobs} worktrees`,
    command: [
      "bun",
      "scripts/seeded-bug.ts",
      ...seedSince,
      ...seedCache,
      "--kind",
      "unit",
      "--jobs",
      String(seedJobs),
    ],
    memGB: Math.ceil(seedJobs * 0.5 + 2),
    // Its lanes, plus bun test --parallel=4 for a folder-wide seed.
    cpu: seedJobs + 4,
    short: true,
  },
  {
    name: "unit",
    title: `bun test, ${unitWorkers} processes`,
    // bun keeps each file's last duration there and starts the slowest files first.
    command: [
      "bun",
      "test",
      `--parallel=${unitWorkers}`,
      `--timings=${join(ROOT, ".verify", "bun-timings.json")}`,
      "--update-timings",
      "./packages",
      "./scripts",
      "./test",
    ],
    memGB: Math.ceil(unitWorkers * 0.5),
    cpu: unitWorkers,
    short: true,
  },
  {
    name: "astro",
    title: "Astro component tests",
    command: ["bun", "run", "test:astro"],
    memGB: 2,
    cpu: 1,
    short: true,
  },
  { name: "lint", title: "oxlint", command: ["bun", "run", "lint"], memGB: 2, cpu: 2, short: true },
  {
    name: "format",
    title: "oxfmt --check",
    command: ["bun", "run", "fmt:check"],
    memGB: 1,
    cpu: 1,
    short: true,
  },
  {
    name: "types",
    title: "type check",
    command: ["bun", "run", "typecheck"],
    memGB: 3,
    cpu: 2,
    short: true,
  },
  {
    name: "fallow",
    title: "dead code and boundaries",
    command: ["bun", "run", "fallow"],
    memGB: 2,
    cpu: 2,
    short: true,
  },
  {
    name: "runtime",
    title: "Node exceptions",
    command: ["bun", "run", "check:runtime"],
    memGB: 1,
    cpu: 1,
    short: true,
  },
  {
    name: "anchors",
    title: "every seed still applies",
    command: ["bun", "run", "check:seeds"],
    memGB: 1,
    cpu: 1,
    short: true,
  },
];

if (release) {
  const tarballs = join(logs, "tarballs");
  jobs.push(
    ...(["node", "cloudflare"] as const).map((platform): Job => ({
      name: `e2e-prod-${platform === "node" ? "node" : "cf"}`,
      title: `public pages on the ${platform} demo's production build`,
      command: [
        "bun",
        "run",
        "e2e:prod",
        `--project=${platform}-public`,
        `--output=test-results/prod-${platform}`,
      ],
      // It builds its demo in this checkout: never beside that demo's other dev servers (e2e on
      // it, and the box round on the node demo). Cloudflare's dev and production workerd share one
      // local D1 file, and beside the e2e seed lanes a read hit SQLITE_BUSY (2 of 3 runs): alone.
      excludes: platform === "node" ? ["e2e-node", "box"] : ["e2e-cf", "seeds-e2e"],
      env: {
        CI: "1",
        EMVB_E2E_NODE_PORT: "6411",
        EMVB_E2E_CF_PORT: "6412",
        EMVB_E2E_NODE_PROD_PORT: "6421",
        EMVB_E2E_CF_PROD_PORT: "6422",
        // Its dev server uses the demo's usual Vite cache, warm from the e2e runs (never beside
        // them): a cold one took a Cloudflare dev server to 4.4 GB.
      },
      // A build, a production server, a dev server and Chromium: 2.6–5.4 GB measured (node),
      // up to 6.8 (Cloudflare, cold cache).
      memGB: platform === "node" ? 7 : 9,
      cpu: 3,
    })),
    {
      name: "pack",
      title: `pack:smoke and the ${version} tarballs`,
      command: ["bun", "scripts/release.ts", "pack", version, "--out", tarballs],
      memGB: 2,
      cpu: 1,
      short: true,
    },
    {
      name: "stock",
      title: "stock EmDash 1.4.0/1.5.0 installs, Node and Cloudflare, dev and production",
      command: [
        "bun",
        "scripts/stock-smoke.ts",
        "--tarballs",
        tarballs,
        "--logs",
        join(logs, "stock"),
        // Two sites at a time: each runs a dev server, a build and Chromium.
        "--parallel",
        "2",
      ],
      after: ["pack"],
      // 9.4–11.6 GB measured for two sites at a time.
      memGB: 13,
      cpu: 4,
    },
    {
      name: "box",
      title: "box round: axe, overflow and console on the node demo",
      command: ["bun", "scripts/box-round.ts", "--logs", join(logs, "box"), "--port", "6511"],
      // Its node demo dev server must not run beside a node demo build.
      excludes: ["e2e-prod-node"],
      env: { EMVB_VITE_CACHE: "node_modules/.vite-box" },
      memGB: 7,
      cpu: 2,
    },
  );
}

const only = list("only");
const skipped = list("skip");
const plan = jobs.filter(
  (j) => (only.length === 0 || only.includes(j.name)) && !skipped.includes(j.name),
);
// Keep `after` and `excludes` to jobs in this run.
for (const job of plan) {
  const names = new Set(plan.map((j) => j.name));
  job.after = job.after?.filter((n) => names.has(n));
  job.excludes = job.excludes?.filter((n) => names.has(n));
}
const problems = planProblems(plan, budget);
if (problems.length > 0) throw new Error(problems.join("\n"));

const print = (line: string) => process.stdout.write(`${line}\n`);
print(
  `verify${release ? ":release" : ""} ${version}: ${plan.length} jobs, budget ${budget.memGB} GB / ${budget.cpu} cores${capped ? "" : " (no memory caps: systemd-run missing or --no-cap)"}; logs in ${logs}`,
);
if (flag("dry-run")) {
  for (const job of plan)
    print(`  ${job.name.padEnd(14)} ${String(job.memGB).padStart(3)} GB  ${job.command.join(" ")}`);
  process.exit(0);
}
await mkdir(logs, { recursive: true });
await mkdir(join(ROOT, ".verify"), { recursive: true });

/** The scope's cgroup and, at the end, its memory.peak and CPU time, written by the job's shell. */
const WRAP = [
  'stats="$1"; shift',
  'cg="/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup)"',
  'echo "$cg" > "$stats.cgroup"',
  '"$@"; rc=$?',
  '{ cat "$cg/memory.peak" 2>/dev/null || echo 0; sed -n "s/^usage_usec //p" "$cg/cpu.stat" 2>/dev/null; } > "$stats"',
  "exit $rc",
].join("\n");

type Live = { job: Job; proc: ReturnType<typeof Bun.spawn>; started: number; stats: string };
const live = new Map<string, Live>();
const outcomes = new Map<string, Outcome>();
const done = new Set<string>();
const failed = new Set<string>();
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;

function launch(job: Job): Live {
  const stats = join(logs, `${job.name}.stats`);
  // One descriptor for both streams, so their lines interleave instead of overwriting each other.
  const log = openSync(join(logs, `${job.name}.log`), "w");
  const command = capped
    ? [
        "systemd-run",
        "--user",
        "--scope",
        "-q",
        "-p",
        `MemoryMax=${job.memGB}G`,
        "-p",
        "MemorySwapMax=0",
        "--",
        "sh",
        "-c",
        WRAP,
        "sh",
        stats,
        ...job.command,
      ]
    : job.command;
  const proc = Bun.spawn(command, {
    cwd: job.cwd ?? ROOT,
    env: { ...process.env, ...job.env },
    stdout: log,
    stderr: log,
  });
  closeSync(log);
  print(`[${(elapsed() / 60).toFixed(1)} min] start ${job.name}: ${job.command.join(" ")}`);
  return { job, proc, started: elapsed(), stats };
}

async function finish({ job, proc, started, stats }: Live) {
  const code = await proc.exited;
  const seconds = elapsed() - started;
  const numbers = existsSync(stats) ? (await readFile(stats, "utf8")).trim().split("\n") : [];
  const peakGB = numbers[0] ? Number(numbers[0]) / 2 ** 30 : undefined;
  const cpuS = numbers[1] ? Number(numbers[1]) / 1e6 : undefined;
  const tail = (await readFile(join(logs, `${job.name}.log`), "utf8").catch(() => ""))
    .trim()
    .split("\n")
    .slice(-1)[0];
  const status = code === 0 ? "passed" : "failed";
  (code === 0 ? done : failed).add(job.name);
  outcomes.set(job.name, {
    job,
    status,
    startedS: started,
    seconds,
    peakGB: residentPeak.get(job.name) ?? peakGB,
    cgroupPeakGB: peakGB,
    cpuS,
    detail: code === 0 ? undefined : `exit ${code}: ${tail?.slice(0, 160) ?? ""}`,
  });
  print(
    `[${(elapsed() / 60).toFixed(1)} min] ${status === "passed" ? "ok" : "FAILED"} ${job.name} in ${(seconds / 60).toFixed(1)} min${residentPeak.has(job.name) ? `, peak ${(residentPeak.get(job.name) ?? 0).toFixed(1)} GB` : ""}${status === "passed" ? "" : ` (log: ${join(logs, `${job.name}.log`)})`}`,
  );
}

/**
 * A job's memory now, without the file cache the kernel drops before it runs out (memory.stat:
 * anon + shmem + kernel). memory.peak counts that cache too, so it overstates what a job needs.
 */
async function residentGB(stats: string): Promise<number> {
  const cg = (await readFile(`${stats}.cgroup`, "utf8").catch(() => "")).trim();
  if (!cg) return 0;
  const text = await readFile(join(cg, "memory.stat"), "utf8").catch(() => "");
  const field = (name: string) => Number(text.match(new RegExp(`^${name} (\\d+)$`, "m"))?.[1] ?? 0);
  return (field("anon") + field("shmem") + field("kernel")) / 2 ** 30;
}
const residentPeak = new Map<string, number>();

/** The running jobs' memory now, each job's highest so far, and their sum. */
async function currentTotalGB(): Promise<number> {
  const now = await Promise.all(
    [...live.values()].map(async ({ job, stats }) => {
      const gb = await residentGB(stats);
      residentPeak.set(job.name, Math.max(residentPeak.get(job.name) ?? 0, gb));
      return gb;
    }),
  );
  return now.reduce((sum, gb) => sum + gb, 0);
}

// Stop every job's whole scope on Ctrl+C, not just its first process.
async function stopAll() {
  for (const { stats, proc } of live.values()) {
    const cg = await readFile(`${stats}.cgroup`, "utf8").catch(() => "");
    const unit = cg.trim().split("/").at(-1);
    if (unit?.endsWith(".scope"))
      Bun.spawnSync(["systemctl", "--user", "stop", unit], { stdout: "ignore", stderr: "ignore" });
    else proc.kill("SIGTERM");
  }
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stopAll().finally(() => process.exit(130));
  });
}

/** MemAvailable from /proc/meminfo, in GB: how much the whole machine still has. */
const available = () =>
  Number(readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+)/m)?.[1] ?? 0) /
  2 ** 20;
const availableAtStart = existsSync("/proc/meminfo") ? available() : 0;
let lowestAvailable = availableAtStart;
let pending = [...plan];
let peakTotal = 0;
const sampler = setInterval(() => {
  void currentTotalGB().then((gb) => {
    peakTotal = Math.max(peakTotal, gb);
  });
  if (availableAtStart > 0) lowestAvailable = Math.min(lowestAvailable, available());
}, 2000);
const finishing = new Set<Promise<void>>();
while (pending.length > 0 || live.size > 0) {
  const { start, skip } = startable(
    pending,
    { done, failed, running: [...live.values()].map((l) => l.job) },
    budget,
  );
  for (const job of skip) {
    failed.add(job.name);
    outcomes.set(job.name, {
      job,
      status: "skipped",
      detail: `skipped: ${job.after?.join(", ")} failed`,
    });
  }
  pending = pending.filter((j) => !start.includes(j) && !skip.includes(j));
  for (const job of start) {
    const run = launch(job);
    live.set(job.name, run);
    const settled: Promise<void> = finish(run).finally(() => {
      live.delete(job.name);
      finishing.delete(settled);
    });
    finishing.add(settled);
  }
  if (live.size === 0 && start.length === 0) {
    // Nothing can start and nothing runs: whatever is left waits on a job that never ran.
    for (const job of pending)
      outcomes.set(job.name, { job, status: "skipped", detail: "skipped: never startable" });
    break;
  }
  if (finishing.size > 0) await Promise.race(finishing);
}
clearInterval(sampler);

const ordered = plan.map(
  (job) => outcomes.get(job.name) ?? ({ job, status: "skipped" } satisfies Outcome),
);
const machine =
  availableAtStart > 0
    ? `machine: ${availableAtStart.toFixed(1)} GB available at the start, ${lowestAvailable.toFixed(1)} GB at the lowest (${(availableAtStart - lowestAvailable).toFixed(1)} GB taken)`
    : "";
const summary = `${summaryTable(ordered, elapsed(), capped ? peakTotal : undefined)}\n${machine}`;
print(`\n${summary}`);
await writeFile(join(logs, "summary.txt"), `${summary}\n`);
await writeFile(
  join(logs, "summary.json"),
  `${JSON.stringify({ release, version, since, budget, wallS: Math.round(elapsed()), peakTotalGB: peakTotal, availableAtStart, lowestAvailable, jobs: ordered.map((o) => ({ ...o, job: o.job.name })) }, null, 2)}\n`,
);
process.exit(ordered.every((o) => o.status === "passed") ? 0 : 1);
