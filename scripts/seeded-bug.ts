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
 *   [--e2e-lanes <n>] e2e lanes, each with its own worktree and demo ports (default: a quarter
 *                  of the cores, at most 4; more measured no faster on 16 cores)
 *   [--cold-e2e]   every e2e seed starts its own dev server, as before W-986; by default each
 *                  lane keeps one Node dev server up, with each mutation and restore proven on it
 *                  by a dev-only probe
 *   [--one-lane-e2e] e2e seeds one at a time in the repo itself (the old way)
 *   [--cache]      skip seeds already caught with the same seed, files and tests (dev loops only)
 *
 * W-985: e2e seeds run in parallel lanes, each with its own worktree and demo ports, and each
 * seed exactly as before (its own fresh server, its settings). Unit seeds run in parallel
 * worktrees, each seed still applied alone. Every run starts with a self-check: a known seed must
 * be caught and a no-op seed must escape.
 *
 * W-986: by default each e2e lane keeps one Node dev server up instead, signed in once. A seed's
 * command runs only once scripts/seed-probe.ts (copied into the lane's worktree, never into the
 * demo) shows the server evaluated its mutation, and the next seed waits until it shows the
 * restore. After each test file's seeds, the tests that caught them run again on the clean code on
 * the same server, all in one run: a catch counts only if its test passes there. Anything not
 * proven that way, and every e2e:prod seed, runs on a fresh server, as with --cold-e2e.
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

/** W-986: what runs between writing a seed's files and its command, and after the restore. */
export type SeedHooks = {
  applied?: () => Promise<void>;
  /** After the command, before the files are put back (never stops the restore). */
  beforeRestore?: () => Promise<void>;
  restored?: () => Promise<void>;
};

/** Commands running now, so an interrupted run can stop them (W-985). */
const running = new Set<{ kill: (signal?: number | NodeJS.Signals) => void }>();

export async function runSeed(
  root: string,
  seed: Seed,
  /**
   * W-985: wait this long after writing and before running, so a dev server's watcher sees it.
   * W-986: or hooks instead: `applied` runs after the seed's files are written and before its
   * command, `restored` after they are put back; either throws when the server didn't follow.
   */
  settle: number | SeedHooks = 0,
): Promise<SeedResult> {
  const hooks: SeedHooks =
    typeof settle === "number"
      ? settle > 0
        ? { applied: () => Bun.sleep(settle), restored: () => Bun.sleep(settle) }
        : {}
      : settle;
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
    await hooks.applied?.();
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
    await hooks.beforeRestore?.().catch(() => undefined);
    await Promise.all([...originals].map(([path, text]) => writeFile(path, text)));
    await Promise.all(created.map((path) => rm(path, { force: true })));
    await hooks.restored?.();
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
  // W-986: and the production servers of e2e:prod seeds, ten above the dev servers.
  EMVB_E2E_NODE_PROD_PORT: String(lanePort("node", lane) + 10),
  EMVB_E2E_CF_PROD_PORT: String(lanePort("cloudflare", lane) + 10),
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
 * W-986: the first Playwright test that failed in `output`, as `file:line`, unless it was the
 * sign-in setup. Undefined when no test failed.
 */
export function failedTest(output: string): string | undefined {
  const match = output.match(/✘\s+\d+\s+\[([^\]]+)\]\s+›\s+(\S+?\.ts:\d+)(?::\d+)?\s+›/);
  if (!match || match[1]?.endsWith("-setup")) return undefined;
  return match[2];
}

/**
 * W-986: what a warm dev server shows for some files: the probe's instance, each file's module
 * generation on the server (or its import error), and a hash of each file's browser module.
 */
export type ProbeState = {
  instance: string;
  files: Record<string, string>;
  client: Record<string, string>;
};

/** The files of a seed the dev server serves: e2e specs and the like are read by Playwright. */
export const servedFiles = (laneRoot: string, seed: Seed): string[] =>
  [...(seed.edits ?? []).map((e) => e.file), ...(seed.creates ?? []).map((c) => c.file)]
    .filter((file) => !/^(e2e|scripts)\//.test(file))
    .map((file) => join(laneRoot, file))
    .filter((path, i, all) => all.indexOf(path) === i);

/** W-986: the probe's view of `paths` on the dev server at `port`; undefined while it's down. */
async function readProbe(port: number, paths: readonly string[]): Promise<ProbeState | undefined> {
  const base = `http://127.0.0.1:${port}`;
  try {
    const query = paths.map((p) => `path=${encodeURIComponent(p)}`).join("&");
    const response = await fetch(`${base}/seed-probe?${query}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as Omit<ProbeState, "client">;
    const client: Record<string, string> = {};
    await Promise.all(
      paths.map(async (path) => {
        const res = await fetch(`${base}/@fs${path}`, { signal: AbortSignal.timeout(10_000) });
        // Imports of modules the server has reloaded carry a ?t= stamp: not the file's own code.
        const text = withoutReloadStamps(await res.text());
        client[path] = res.ok
          ? createHash("sha256").update(text).digest("hex")
          : `status ${res.status}`;
      }),
    );
    return { ...body, client };
  } catch {
    return undefined;
  }
}

/**
 * W-986: a browser module without the `t=<time>` query Vite adds to imports of modules it has
 * reloaded (React Refresh imports the module itself that way), so a restored file's module
 * matches its clean one again.
 */
export const withoutReloadStamps = (code: string) =>
  code.replaceAll(/([?&])t=\d+&?/g, "$1").replaceAll(/[?&](?=["'])/g, "");

const generation = (state: string | undefined) =>
  state === undefined || state.startsWith("error") ? Number.NaN : Number(state);

/**
 * W-986: does `now` prove the server picked up the change made after `from`? `base` is the clean
 * state. "applied": every signal the clean file gives (its server module, its browser module)
 * moved. "restored": the server module was evaluated again and loads, and the browser module is
 * the clean one again. A file with neither signal proves nothing, so the seed can't run warm.
 */
export function probeShows(
  want: "applied" | "restored",
  base: ProbeState,
  from: ProbeState,
  now: ProbeState,
  paths: readonly string[],
): boolean {
  const restarted = now.instance !== from.instance;
  return paths.every((path) => {
    const server = !Number.isNaN(generation(base.files[path]));
    const browser = base.client[path]?.startsWith("status") === false;
    if (!server && !browser) return false;
    const nowGen = generation(now.files[path]);
    const before = Math.max(generation(base.files[path]), generation(from.files[path]) || 0);
    if (want === "applied") {
      const serverMoved = restarted || Number.isNaN(nowGen) || nowGen > before;
      const browserMoved = now.client[path] !== from.client[path];
      return (!server || serverMoved) && (!browser || browserMoved);
    }
    const serverBack = !Number.isNaN(nowGen) && (restarted || nowGen > before);
    const browserBack = now.client[path] === base.client[path];
    return (!server || serverBack) && (!browser || browserBack);
  });
}

/** W-986: polls the probe until `test` holds twice in a row, or throws after `ms`. */
async function waitForProbe(
  port: number,
  paths: readonly string[],
  test: (now: ProbeState) => boolean,
  what: string,
  ms = 20_000,
): Promise<ProbeState> {
  const until = Date.now() + ms;
  let streak = 0;
  while (Date.now() < until) {
    // oxlint-disable-next-line no-await-in-loop -- polls until the server follows
    const now = await readProbe(port, paths);
    streak = now && test(now) ? streak + 1 : 0;
    if (now && streak >= 2) return now;
    // oxlint-disable-next-line no-await-in-loop -- same
    await Bun.sleep(100);
  }
  throw new Error(`the warm server didn't show the ${what} within ${ms / 1000} s`);
}

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
  // W-986: warm e2e lanes by default; --cold-e2e gives every e2e seed its own fresh server.
  const warmMode = !process.argv.includes("--cold-e2e");
  const useCache = process.argv.includes("--cache");
  const jobs = Math.max(
    1,
    Number(arg("jobs") ?? Math.min(4, Math.floor(availableParallelism() / 4))) || 1,
  );
  const cachePath = join(root, ".seeded-bug-cache.json");
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
  // W-986: e2e:prod seeds run in the e2e lanes too (cold, on the lane's ports), not one by one
  // after everything else.
  const isProd = (s: Seed) => /\be2e:prod\b|playwright\.prod/.test(s.command.join(" "));
  const warm = cold
    ? []
    : todo.filter((s) => (warmPlatform(s) !== null || isProd(s)) && !timing.includes(s));
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
    // Production seeds each build the demo again anyway: one group each, spread over the lanes.
    const file = isProd(seed) ? seed.id : (seed.command.find((part) => part.endsWith(".ts")) ?? "");
    byFile.set(file, [...(byFile.get(file) ?? []), seed]);
  }
  const groups = [...byFile.values()].toSorted((a, b) => b.length - a.length);
  const e2eQueue = [...groups];
  const e2eLanes = Math.max(
    1,
    Math.min(
      Number(arg("e2e-lanes") ?? Math.min(4, Math.floor(availableParallelism() / 4))) || 1,
      groups.length,
    ),
  );
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
    // W-986: a warm lane keeps one Node demo server up for all its seeds. Each seed runs only
    // once the probe shows the server has its mutation, and the next one starts only once the
    // probe shows the restore. After a test file's seeds, the tests that caught them run again on
    // the clean code (the no-op after the seeds): a catch counts only if its test passes there.
    // Anything not proven that way (not caught warm, a probe timeout, a failed clean re-run, a
    // production or non-Node seed) runs again cold, exactly as with --cold-e2e.
    const ports = laneEnv(lane);
    const port = lanePort("node", lane);
    const probe = join(laneRoot, "demos/node/src/pages/seed-probe.ts");
    await copyFile(join(root, "scripts/seed-probe.ts"), probe);
    const servers: Servers = {};
    liveServers.push(servers);
    // The lane signs in once (Playwright's setup project) on its warm server, which keeps that
    // session: every later run skips the setup with --no-deps.
    const onWarm = (seed: Seed): Seed => ({
      ...seed,
      env: { ...seed.env, ...ports, EMVB_REUSE_SERVER: "1" },
      command: [...seed.command, "--no-deps"],
    });
    const startServer = async () => {
      servers.node ??= await startDemo(laneRoot, "node", lane);
    };
    const stopServer = async () => {
      await stopDemo(servers.node);
      delete servers.node;
    };
    /** Runs `command` on the clean code on the warm server: true when it passes. */
    const passesClean = async (command: string[], noDeps = true): Promise<boolean> => {
      await startServer();
      const run = await runSeed(laneRoot, {
        id: "warm/clean",
        requirement: "",
        description: "",
        command: noDeps ? [...command, "--no-deps"] : command,
        env: { ...ports, EMVB_REUSE_SERVER: "1" },
        expect: "$^",
      });
      return run.status === "not-caught";
    };
    const signedIn =
      (await passesClean(["bun", "run", "e2e", "--project=node-setup"], false)) ||
      (await passesClean(["bun", "run", "e2e", "--project=node-setup"], false));
    try {
      for (let group = e2eQueue.shift(); group; group = e2eQueue.shift()) {
        const warmable = signedIn ? group.filter((s) => warmPlatform(s) === "node") : [];
        const redo: [Seed, string][] = group
          .filter((s) => !warmable.includes(s))
          .map((s) => [
            s,
            isProd(s)
              ? "production build"
              : signedIn
                ? "needs another platform"
                : "the warm lane couldn't sign in",
          ]);
        const caught: (Done & { test: string })[] = [];
        {
          for (const seed of warmable) {
            const paths = servedFiles(laneRoot, seed);
            const t = performance.now();
            try {
              // oxlint-disable-next-line no-await-in-loop -- one seed at a time per lane
              await startServer();
              // oxlint-disable-next-line no-await-in-loop -- same
              const base = await waitForProbe(port, paths, () => true, "clean code");
              let before: ProbeState | undefined;
              // oxlint-disable-next-line no-await-in-loop -- same
              const result = await runSeed(
                laneRoot,
                onWarm({ ...seed, command: [...seed.command, "--max-failures=1"] }),
                {
                  applied: async () => {
                    await waitForProbe(
                      port,
                      paths,
                      (now) => probeShows("applied", base, base, now, paths),
                      "mutation",
                    );
                  },
                  beforeRestore: async () => {
                    before = await readProbe(port, paths);
                  },
                  restored: async () => {
                    const from = before ?? base;
                    await waitForProbe(
                      port,
                      paths,
                      (now) => probeShows("restored", base, from, now, paths),
                      "restore",
                    );
                  },
                },
              );
              const ms = performance.now() - t;
              const test = result.status === "caught" ? failedTest(result.output ?? "") : undefined;
              if (test) caught.push({ seed, result, ms, lane: `e2e-warm-${lane}`, test });
              else if (result.status === "caught") redo.push([seed, "no failed test to re-run"]);
              else redo.push([seed, `warm ${result.status}`]);
            } catch (error) {
              // The server may still serve the mutation: never reuse it.
              redo.push([
                seed,
                String(error)
                  .replace(/^Error: /, "")
                  .slice(0, 120),
              ]);
              // oxlint-disable-next-line no-await-in-loop -- rare
              await stopServer();
            }
          }
          // A catch counts only if the very test that failed passes on the clean code, on the
          // same server, right after the group's seeds (all of them in one run).
          const tests = [...new Set(caught.map((d) => d.test))];
          if (
            caught.length > 0 &&
            // oxlint-disable-next-line no-await-in-loop -- once per group
            !(await passesClean(["bun", "run", "e2e", ...tests, "--project=node"]))
          ) {
            redo.push(...caught.map((d): [Seed, string] => [d.seed, "clean re-run failed"]));
            caught.length = 0;
          }
        }
        for (const { test: _, ...done } of caught) report(done);
        if (redo.length > 0) {
          // oxlint-disable-next-line no-await-in-loop -- a cold run starts its own server
          await stopServer();
          for (const [seed, why] of redo) {
            // oxlint-disable-next-line no-await-in-loop -- one seed at a time per lane
            const done = await timed(`e2e-cold-${lane}`, laneRoot, {
              ...seed,
              env: { ...seed.env, ...ports },
            });
            report({ ...done, seed, lane: `e2e-cold-${lane} (${why})` });
          }
        }
      }
    } finally {
      await stopServer();
      // The probe is the lane's own; with --jobs 1 lane 0 is this checkout, so it must not stay.
      await rm(probe, { force: true });
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
    // --one-lane-e2e with several jobs: e2e seeds one at a time after the parallel unit seeds.
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
    `seeded bugs: ${results.length - failed.length}/${results.length} caught in ${seconds} s (${jobs} jobs, ${warm.length} e2e in ${e2eLanes} ${warmMode ? "warm" : "cold"} lanes${skipped ? `, ${skipped} unchanged and skipped` : ""})${failed.length ? `; ESCAPED: ${failed.map((r) => r.seed.id).join(", ")}` : ""}\n`,
  );
  process.exit(failed.length === 0 && (results.length > 0 || skipped > 0) ? 0 : 1);
}
