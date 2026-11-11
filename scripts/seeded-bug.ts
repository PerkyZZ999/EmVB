/**
 * Seeded-bug runner (N-001): applies each mutation from a manifest, runs the check that should
 * catch it, restores the files, and fails if any mutation went unnoticed.
 *
 *   bun scripts/seeded-bug.ts [--manifest scripts/seeded-bugs.json] [--root .] [--only <text>]
 *   bun scripts/seeded-bug.ts --verify   (checks every seed still applies, without running any)
 *   bun scripts/seeded-bug.ts --changed-since <git ref> [--list]
 *     (only seeds that edit a file changed since the ref; --list prints them without running)
 *   [--jobs <n>]   unit seeds in n git worktrees at once (default: a quarter of the cores, at
 *                  most 4, so the machine stays usable; timing seeds always run alone at the end)
 *   [--e2e-lanes <n>] e2e lanes, each with its own worktree and demo ports (default 3)
 *   [--warm-e2e]   e2e lanes keep one dev server up between seeds (each catch then re-runs its
 *                  test on the clean code); by default every e2e seed starts its own server
 *   [--one-lane-e2e] e2e seeds one at a time in the repo itself (the old way)
 *   [--cache]      skip seeds already caught with the same seed, files and tests (dev loops only)
 *
 * W-985: e2e seeds run in parallel lanes, each with its own worktree and demo ports, and each
 * seed exactly as before (its own fresh server, its settings). --warm-e2e keeps a dev server up
 * per lane instead; a warm catch then counts only when the test that failed passes again on the
 * clean code right after, and otherwise the seed runs again on a fresh server. Unit seeds run in parallel worktrees, each seed still applied alone. Every run
 * starts with a self-check: a known seed must be caught and a no-op seed must escape.
 */
import { createLogger, initLogger } from "evlog";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type Seed = {
  id: string;
  requirement: string;
  description: string;
  edits?: { file: string; search: string; replace: string }[];
  creates?: { file: string; content: string }[];
  command: string[];
  env?: Record<string, string>;
  /** Regex that the failing command's output must match, so an unrelated failure doesn't count. */
  expect: string;
};

export type SeedResult = {
  id: string;
  status: "caught" | "not-caught" | "stale" | "wrong-failure";
  exitCode: number | null;
  detail: string;
  /** The command's output, for the warm e2e lane's clean re-run (W-985). */
  output?: string;
};

/** Commands running now, so an interrupted run can stop them (W-985). */
const running = new Set<{ kill: (signal?: number | NodeJS.Signals) => void }>();

export async function runSeed(
  root: string,
  seed: Seed,
  /** W-985: wait this long after writing and before running, so a dev server's watcher sees it. */
  settleMs = 0,
): Promise<SeedResult> {
  const originals = new Map<string, string>();
  const created: string[] = [];
  try {
    for (const edit of seed.edits ?? []) {
      const path = join(root, edit.file);
      const current = await readFile(path, "utf8");
      if (!originals.has(path)) originals.set(path, current);
      const count = current.split(edit.search).length - 1;
      if (count !== 1) {
        return {
          id: seed.id,
          status: "stale",
          exitCode: null,
          detail: `"${edit.search}" occurs ${count} times in ${edit.file}`,
        };
      }
      await writeFile(path, current.replace(edit.search, edit.replace));
    }
    for (const file of seed.creates ?? []) {
      const path = join(root, file.file);
      if (await Bun.file(path).exists()) {
        return {
          id: seed.id,
          status: "stale",
          exitCode: null,
          detail: `${file.file} already exists`,
        };
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.content);
      created.push(path);
    }
    if (settleMs > 0) await Bun.sleep(settleMs);
    const proc = Bun.spawn(seed.command, {
      cwd: root,
      env: { ...process.env, ...seed.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    running.add(proc);
    const [out, err, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]).finally(() => running.delete(proc));
    const output = `${out}\n${err}`;
    if (exitCode === 0)
      return { id: seed.id, status: "not-caught", exitCode, detail: "command passed" };
    const match = output.match(new RegExp(seed.expect, "m"));
    if (!match) {
      return {
        id: seed.id,
        status: "wrong-failure",
        exitCode,
        detail: output.trim().split("\n").slice(-5).join(" | "),
      };
    }
    return {
      id: seed.id,
      status: "caught",
      exitCode,
      detail: match[0].trim().slice(0, 200),
      output,
    };
  } finally {
    await Promise.all([...originals].map(([path, text]) => writeFile(path, text)));
    await Promise.all(created.map((path) => rm(path, { force: true })));
    if (settleMs > 0) await Bun.sleep(settleMs);
  }
}

function compiles(pattern: string): boolean {
  try {
    return Boolean(new RegExp(pattern, "m"));
  } catch {
    return false;
  }
}

/**
 * Why each seed could not be applied as written, without running it: a search text that no
 * longer occurs exactly once (checked in order, as runSeed applies them), a missing file, a
 * file a seed would create that already exists, a duplicate id, or an unusable command or regex.
 */
export async function verifySeeds(root: string, seeds: readonly Seed[]): Promise<string[]> {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const at = (message: string) => problems.push(`${seed.id}: ${message}`);
    if (seen.has(seed.id)) at("duplicate id");
    seen.add(seed.id);
    if (!seed.requirement) at("no requirement");
    if (seed.command.length === 0) at("empty command");
    if (!compiles(seed.expect)) at(`expect is not a valid regex: ${seed.expect}`);
    const texts = new Map<string, string>();
    for (const edit of seed.edits ?? []) {
      const file = Bun.file(join(root, edit.file));
      // oxlint-disable-next-line no-await-in-loop -- later edits see earlier ones, as in runSeed
      const text = texts.get(edit.file) ?? ((await file.exists()) ? await file.text() : undefined);
      if (text === undefined) {
        at(`${edit.file} does not exist`);
        continue;
      }
      const count = text.split(edit.search).length - 1;
      if (count !== 1) at(`"${edit.search}" occurs ${count} times in ${edit.file}`);
      texts.set(edit.file, text.replace(edit.search, edit.replace));
    }
    for (const file of seed.creates ?? []) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of files, checked in order
      if (await Bun.file(join(root, file.file)).exists()) at(`${file.file} already exists`);
    }
  }
  return problems;
}

/** Seeds matching `only` (a substring of the id) and, when `files` is given, editing one of them. */
export function selectSeeds(
  seeds: readonly Seed[],
  { only, files }: { only?: string; files?: ReadonlySet<string> },
): Seed[] {
  return seeds.filter(
    (s) =>
      (!only || s.id.includes(only)) &&
      (!files || [...(s.edits ?? []), ...(s.creates ?? [])].some((edit) => files.has(edit.file))),
  );
}

async function changedSince(root: string, ref: string): Promise<Set<string>> {
  const proc = Bun.spawn(["git", "diff", "--name-only", ref, "--"], { cwd: root, stdout: "pipe" });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error(`git diff --name-only ${ref} failed`);
  return new Set(out.split("\n").filter(Boolean));
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** W-985: an e2e seed that can share a warm dev server (not the production suite). */
export function warmPlatform(seed: Seed): "node" | "cloudflare" | "both" | null {
  const cmd = seed.command.join(" ");
  const e2e = /\bbun run e2e\b(?!:)/.test(cmd) || /\bplaywright test\b/.test(cmd);
  if (!e2e || /e2e:prod|playwright\.prod/.test(cmd)) return null;
  if (cmd.includes("--project=node")) return "node";
  if (cmd.includes("--project=cloudflare")) return "cloudflare";
  return "both";
}

const DEMOS = {
  node: { dir: "demos/node", port: 4411 },
  cloudflare: { dir: "demos/cloudflare", port: 4412 },
} as const;

/** W-985: e2e lane n uses ports 4411/4412 plus 100 × n, so lanes never share a server. */
const lanePort = (platform: "node" | "cloudflare", lane: number) =>
  DEMOS[platform].port + 100 * lane;
const laneEnv = (lane: number): Record<string, string> => ({
  EMVB_E2E_NODE_PORT: String(lanePort("node", lane)),
  EMVB_E2E_CF_PORT: String(lanePort("cloudflare", lane)),
});

async function sh(cmd: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd.join(" ")} failed: ${err.trim().slice(0, 300)}`);
  return out;
}

const portInUse = async (port: number) => {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch (error) {
    return !String(error).includes("ECONNREFUSED") && !String(error).includes("Unable to connect");
  }
};

/** A demo dev server in `root`, in its own process group so all of it stops together. */
async function startDemo(root: string, platform: "node" | "cloudflare", lane: number) {
  const port = lanePort(platform, lane);
  if (await portInUse(port))
    throw new Error(
      `port ${port} is in use: stop that demo server first (seeds must use their own)`,
    );
  const proc = Bun.spawn(
    ["setsid", "bun", "x", "astro", "dev", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: join(root, DEMOS[platform].dir),
      env: { ...process.env, ASTRO_DEV_BACKGROUND: "1" },
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const until = Date.now() + 240_000;
  while (Date.now() < until) {
    // oxlint-disable-next-line no-await-in-loop -- polls until the server answers
    if (await portInUse(port)) return proc;
    // oxlint-disable-next-line no-await-in-loop -- same
    await Bun.sleep(1000);
  }
  throw new Error(`the ${platform} demo didn't answer on ${port}`);
}

async function stopDemo(proc: { pid: number; exited: Promise<number> } | undefined) {
  if (!proc) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  await Promise.race([proc.exited, Bun.sleep(5000)]);
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}

/**
 * A detached git worktree of HEAD with the working tree's uncommitted changes copied in, and its
 * own `bun install`, under the system temp dir. Reused (reset) by later runs.
 */
async function prepareWorktree(root: string, name: string): Promise<string> {
  const dir = join(tmpdir(), `emvb-seed-worktrees`, name);
  const head = (await sh(["git", "rev-parse", "HEAD"], root)).trim();
  if (existsSync(join(dir, ".git"))) {
    await sh(["git", "checkout", "-q", "--detach", "-f", head], dir);
    await sh(["git", "clean", "-fdq"], dir);
  } else {
    await mkdir(dirname(dir), { recursive: true });
    await sh(["git", "worktree", "add", "-q", "--detach", "-f", dir, head], root);
  }
  const changed = (await sh(["git", "diff", "--name-only", "HEAD"], root)).split("\n");
  const untracked = (await sh(["git", "ls-files", "--others", "--exclude-standard"], root)).split(
    "\n",
  );
  for (const file of [...changed, ...untracked].filter(Boolean)) {
    const from = join(root, file);
    const to = join(dir, file);
    if (existsSync(from)) {
      // oxlint-disable-next-line no-await-in-loop -- a handful of files
      await mkdir(dirname(to), { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- same
      await copyFile(from, to);
    } else {
      // oxlint-disable-next-line no-await-in-loop -- same
      await rm(to, { force: true });
    }
  }
  await sh(["bun", "install", "--frozen-lockfile"], dir);
  return dir;
}

/** W-985: the cache key of a seed: the seed itself, the files it edits and the files it runs. */
async function cacheKey(root: string, seed: Seed): Promise<string> {
  const hash = createHash("sha256").update(JSON.stringify(seed));
  const files = new Set([
    ...(seed.edits ?? []).map((e) => e.file),
    ...seed.command
      .filter((part) => /\.(ts|tsx|js|mjs|json)$/.test(part))
      .map((p) => p.replace(/^\.\//, "")),
  ]);
  for (const file of [...files].toSorted()) {
    const path = join(root, file);
    // oxlint-disable-next-line no-await-in-loop -- a few files per seed
    hash.update(file).update(existsSync(path) ? await readFile(path) : "missing");
  }
  return hash.digest("hex");
}

/**
 * W-985: before trusting a run, the runner must still tell a caught seed from an escaped one:
 * `known` must be caught, and the same command with no mutation must be reported as escaped.
 */
export async function selfCheck(root: string, known: Seed): Promise<string | null> {
  const caught = await runSeed(root, known);
  if (caught.status !== "caught") return `${known.id} should be caught but was ${caught.status}`;
  const noop = await runSeed(root, { ...known, id: "self-check/no-op", edits: [], creates: [] });
  if (noop.status !== "not-caught") return `a no-op seed should escape but was ${noop.status}`;
  return null;
}

/**
 * W-985: the first failed Playwright test in `output`, as `file:line`, and the command that runs
 * only it with the seed's projects. Undefined when no test failed (a setup failure, say).
 */
export function failedTestCommand(
  command: readonly string[],
  output: string,
): string[] | undefined {
  const match = output.match(/✘\s+\d+\s+\[([^\]]+)\]\s+›\s+(\S+?\.ts:\d+)(?::\d+)?\s+›/);
  if (!match || match[1]?.endsWith("-setup")) return undefined;
  const at = command.findIndex((part) => part === "e2e" || part === "test");
  if (at < 0) return undefined;
  const projects = command.filter((part) => part.startsWith("--project"));
  return [...command.slice(0, at + 1), match[2] as string, ...projects];
}

/** The demo servers an e2e seed needs. */
const need = (p: "node" | "cloudflare" | "both") =>
  p === "both" ? (["node", "cloudflare"] as const) : ([p] as const);

type Done = { seed: Seed; result: SeedResult; ms: number; lane: string };

type Servers = Partial<Record<"node" | "cloudflare", Awaited<ReturnType<typeof startDemo>>>>;

/** Warm demo servers now up, per e2e lane, so an interrupted run can stop them (W-985). */
const liveServers: Servers[] = [];

const stopAll = async () => {
  for (const proc of running) proc.kill("SIGTERM");
  await Promise.all(
    liveServers.flatMap((servers) => Object.values(servers)).map((proc) => stopDemo(proc)),
  );
};

if (import.meta.main) {
  initLogger({ env: { service: "seeded-bugs" } });
  const root = arg("root") ?? process.cwd();
  const manifestPath = arg("manifest") ?? join(root, "scripts/seeded-bugs.json");
  const only = arg("only");
  const { seeds } = JSON.parse(await readFile(manifestPath, "utf8")) as { seeds: Seed[] };
  if (process.argv.includes("--verify")) {
    const problems = await verifySeeds(root, seeds);
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    process.stdout.write(
      `seeded bugs: ${seeds.length} seeds checked to still apply, none run; ${problems.length} problems\n`,
    );
    process.exit(problems.length === 0 ? 0 : 1);
  }
  const since = arg("changed-since");
  const files = since === undefined ? undefined : await changedSince(root, since);
  const selected = selectSeeds(seeds, { only, files });
  if (process.argv.includes("--list")) {
    for (const seed of selected) process.stdout.write(`${seed.id}\n`);
    process.stdout.write(`seeded bugs: ${selected.length} selected, none run\n`);
    process.exit(0);
  }
  const started = performance.now();
  // An interrupted run stops its demo servers and the commands it started.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void stopAll().finally(() => process.exit(130));
    });
  }
  const cold = process.argv.includes("--one-lane-e2e");
  const warmMode = process.argv.includes("--warm-e2e");
  const useCache = process.argv.includes("--cache");
  const jobs = Math.max(
    1,
    Number(arg("jobs") ?? Math.min(4, Math.floor(availableParallelism() / 4))) || 1,
  );
  const cachePath = join(root, ".seeded-bug-cache.json");
  // W-985: which test caught each e2e seed last time (it runs first next time). A hint only
  // picks the order; a seed still has to be caught and pass its clean re-run.
  const hintsPath = join(root, ".seeded-bug-hints.json");
  const hints: Record<string, string[]> = existsSync(hintsPath)
    ? JSON.parse(await readFile(hintsPath, "utf8"))
    : {};
  const cache: Record<string, true> =
    useCache && existsSync(cachePath) ? JSON.parse(await readFile(cachePath, "utf8")) : {};

  // Self-check first, on a unit seed (seconds): the runner must still see a difference.
  const known =
    selected.find((s) => /^bun test\b/.test(s.command.join(" "))) ??
    seeds.find((s) => s.id === "W-984/no-wrap");
  if (known) {
    const problem = await selfCheck(root, known);
    if (problem) {
      process.stderr.write(`seeded bugs: self-check failed: ${problem}\n`);
      process.exit(1);
    }
    process.stdout.write(`seeded bugs: self-check ok (${known.id} caught, no-op escaped)\n`);
  }

  const todo: Seed[] = [];
  let skipped = 0;
  const keys = new Map<string, string>();
  for (const seed of selected) {
    if (useCache) {
      // oxlint-disable-next-line no-await-in-loop -- hashing a few files per seed
      const key = await cacheKey(root, seed);
      keys.set(seed.id, key);
      if (cache[key]) {
        skipped += 1;
        continue;
      }
    }
    todo.push(seed);
  }
  // Timing seeds (benchmarks) need the machine to themselves: they run alone, last.
  const timing = todo.filter((s) => /\bbench/.test(s.command.join(" ")));
  const warm = cold ? [] : todo.filter((s) => warmPlatform(s) !== null && !timing.includes(s));
  const rest = todo.filter((s) => !warm.includes(s) && !timing.includes(s));
  const results: Done[] = [];
  const total = todo.length;
  const report = (done: Done) => {
    results.push(done);
    const mark = done.result.status === "caught" ? "ok " : "!! ";
    process.stdout.write(
      `${mark}${String(results.length).padStart(4)}/${total} ${done.seed.id} ${done.result.status} ${Math.round(done.ms)} ms [${done.lane}]${done.result.status === "caught" ? "" : ` — ${done.result.detail}`}\n`,
    );
    if (useCache && done.result.status === "caught") {
      const key = keys.get(done.seed.id);
      if (key) cache[key] = true;
    }
  };
  const timed = async (lane: string, laneRoot: string, seed: Seed, settle = 0) => {
    const t = performance.now();
    const result = await runSeed(laneRoot, seed, settle);
    return { seed, result, ms: performance.now() - t, lane };
  };

  // Unit (and cold e2e) seeds: one queue, `jobs` worktrees (or the repo itself for one job).
  const queue = [...rest];
  const unitLanes = Array.from({ length: Math.min(jobs, Math.max(1, queue.length)) }, (_, i) => i);
  const unit = async (lane: number) => {
    if (queue.length === 0) return;
    const laneRoot = jobs === 1 ? root : await prepareWorktree(root, `unit-${lane}`);
    for (let seed = queue.shift(); seed; seed = queue.shift()) {
      // Cold e2e seeds start their own demo server; never two at once on the same port.
      // oxlint-disable-next-line no-await-in-loop -- one seed at a time per worktree
      report(await timed(`unit-${lane}`, laneRoot, seed));
    }
  };

  // Warm e2e seeds: `e2eLanes` worktrees, each with its own dev servers on its own ports, kept
  // up between seeds. Seeds that run the same test file stay in one lane (shared warm-up).
  const byFile = new Map<string, Seed[]>();
  for (const seed of warm) {
    const file = seed.command.find((part) => part.endsWith(".ts")) ?? "";
    byFile.set(file, [...(byFile.get(file) ?? []), seed]);
  }
  const groups = [...byFile.values()].toSorted((a, b) => b.length - a.length);
  const e2eQueue = [...groups];
  const e2eLanes = Math.max(1, Math.min(Number(arg("e2e-lanes") ?? 3) || 1, groups.length));
  const e2e = async (lane: number) => {
    if (e2eQueue.length === 0) return;
    const laneRoot = jobs === 1 && lane === 0 ? root : await prepareWorktree(root, `e2e-${lane}`);
    if (!warmMode) {
      // Each seed exactly as it always ran (CI=1: its own fresh demo server), on this lane's
      // ports so lanes never meet.
      const ports = laneEnv(lane);
      for (let group = e2eQueue.shift(); group; group = e2eQueue.shift()) {
        for (const seed of group) {
          // oxlint-disable-next-line no-await-in-loop -- one seed at a time per lane
          const done = await timed(`e2e-${lane}`, laneRoot, {
            ...seed,
            env: { ...seed.env, ...ports },
          });
          report({ ...done, seed });
        }
      }
      return;
    }
    const servers: Servers = {};
    liveServers.push(servers);
    const ports = laneEnv(lane);
    // W-985: once a lane has signed in (Playwright's setup project), its later runs skip it
    // with --no-deps: the warm server keeps the session. A run it breaks still has the clean
    // re-run and the cold retry behind it.
    const signedIn = new Set<string>();
    const warmCommand = (command: string[], platform: string) =>
      signedIn.has(platform) ? [...command, "--no-deps"] : command;
    try {
      for (let group = e2eQueue.shift(); group; group = e2eQueue.shift()) {
        for (const seed of group) {
          const platform = warmPlatform(seed) ?? "node";
          for (const p of need(platform)) {
            // oxlint-disable-next-line no-await-in-loop -- started once, then kept
            servers[p] ??= await startDemo(laneRoot, p, lane);
          }
          // Same settings as a cold run (CI=1 stays); only the running server is reused, on
          // this lane's ports.
          const onWarm = { ...seed, env: { ...seed.env, ...ports, EMVB_REUSE_SERVER: "1" } };
          // The test that caught it last time goes first: if it still catches, the rest of the
          // file needn't run. Otherwise the whole command runs.
          const hint = hints[seed.id];
          let done: Done | undefined;
          if (hint) {
            // oxlint-disable-next-line no-await-in-loop -- one seed at a time per lane
            const quick = await timed(
              `e2e-warm-${lane}, hinted`,
              laneRoot,
              { ...onWarm, command: warmCommand(hint, platform) },
              1500,
            );
            if (quick.result.status === "caught") done = { ...quick, seed };
          }
          // oxlint-disable-next-line no-await-in-loop -- same
          done ??= await timed(
            `e2e-warm-${lane}`,
            laneRoot,
            { ...onWarm, command: warmCommand([...seed.command, "--max-failures=1"], platform) },
            1500,
          );
          done = { ...done, seed };
          // A catch counts only if the test that failed passes again on the clean code right
          // after: that proves the failure was the mutation's, and that the server isn't
          // serving it still (a stale hot reload would fail the next seed's test wrongly).
          let fresh = done.result.status !== "caught";
          if (!fresh) {
            const single = failedTestCommand(seed.command, done.result.output ?? "");
            // oxlint-disable-next-line no-await-in-loop -- one check per seed
            const clean = single
              ? await runSeed(
                  laneRoot,
                  { ...onWarm, command: warmCommand(single, platform), edits: [], creates: [] },
                  500,
                )
              : undefined;
            fresh = clean?.status !== "not-caught";
            if (!fresh) signedIn.add(platform);
            if (fresh) done = { ...done, lane: `${done.lane}, clean re-run failed` };
            else if (single) hints[seed.id] = single;
          }
          if (fresh) {
            // Not caught on the warm server, or its clean re-run failed: settle it on a fresh
            // server, with the seed's own command and settings.
            for (const p of need(platform)) {
              // oxlint-disable-next-line no-await-in-loop -- rare
              await stopDemo(servers[p]);
              delete servers[p];
            }
            const why = done.lane.includes("clean re-run failed")
              ? "clean re-run failed"
              : `warm ${done.result.status}`;
            // oxlint-disable-next-line no-await-in-loop -- rare
            const coldRun = await timed("e2e-cold", laneRoot, {
              ...seed,
              env: { ...seed.env, ...ports },
            });
            done = { ...coldRun, seed, lane: `e2e-cold-retry (${why})` };
          }
          report(done);
        }
      }
    } finally {
      await Promise.all(Object.values(servers).map((proc) => stopDemo(proc)));
    }
  };

  // Cold e2e seeds in the unit queue would fight the warm server for the demo ports.
  if (
    warm.length > 0 &&
    rest.some((s) => warmPlatform({ ...s }) !== null || /\be2e\b/.test(s.command.join(" ")))
  ) {
    const coldE2e = rest.filter((s) => /\be2e\b/.test(s.command.join(" ")));
    for (const s of coldE2e) queue.splice(queue.indexOf(s), 1);
    await Promise.all([
      ...unitLanes.map(unit),
      ...Array.from({ length: e2eLanes }, (_, lane) => e2e(lane)),
    ]);
    for (const seed of coldE2e) report(await timed("e2e-cold", root, seed));
  } else if (jobs > 1 && rest.some((s) => /\be2e\b/.test(s.command.join(" ")))) {
    // --cold-e2e with several jobs: e2e seeds one at a time after the parallel unit seeds.
    const coldE2e = rest.filter((s) => /\be2e\b/.test(s.command.join(" ")));
    for (const s of coldE2e) queue.splice(queue.indexOf(s), 1);
    await Promise.all(unitLanes.map(unit));
    for (const seed of coldE2e) report(await timed("e2e-cold", root, seed));
  } else {
    await Promise.all([
      ...unitLanes.map(unit),
      ...Array.from({ length: e2eLanes }, (_, lane) => e2e(lane)),
    ]);
  }

  for (const seed of timing) report(await timed("timing", root, seed));
  if (useCache) await writeFile(cachePath, `${JSON.stringify(cache)}\n`);
  await writeFile(hintsPath, `${JSON.stringify(hints, null, 1)}\n`);
  const failed = results.filter((r) => r.result.status !== "caught");
  const seconds = Math.round((performance.now() - started) / 1000);
  const summary = createLogger({ run: "seeded-bugs", manifest: manifestPath });
  summary.set({
    total: results.length,
    caught: results.length - failed.length,
    skippedFromCache: skipped,
    jobs,
    warmE2e: warm.length,
    seconds,
    failed: failed.map((r) => `${r.seed.id} (${r.result.status})`),
  });
  summary.emit();
  process.stdout.write(
    `seeded bugs: ${results.length - failed.length}/${results.length} caught in ${seconds} s (${jobs} jobs, ${warm.length} e2e on a warm server${skipped ? `, ${skipped} unchanged and skipped` : ""})${failed.length ? `; ESCAPED: ${failed.map((r) => r.seed.id).join(", ")}` : ""}\n`,
  );
  process.exit(failed.length === 0 && (results.length > 0 || skipped > 0) ? 0 : 1);
}
