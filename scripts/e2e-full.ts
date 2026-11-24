/**
 * The whole e2e suite, fast (W-942, W-1096): both platforms at once, each split over several
 * Playwright runs (shards). Every run starts its own demo server on its own port, data folder
 * (W-1035), sign-in and Vite cache, so no two runs share a site: one worker per run, as the specs
 * expect, and many runs side by side. Spec files go to shards by their last measured duration.
 *
 *   bun run e2e:full [--shards n] [--platform node,cloudflare] [--port-base 4411]
 *                    [--only-shard k] [playwright args...]
 *     e.g. `bun run e2e:full e2e/devices.e2e.ts -g W-956`
 *
 *   --shards n      runs per platform (default EMVB_E2E_SHARDS, else from cores and memory; 1 is
 *                   the W-942 behaviour), or per platform: `--shards node=3,cloudflare=2`. A
 *                   file:line filter, `--shard` or a non-file filter
 *                   always runs one shard.
 *   --only-shard k  runs only shard k (1-based) of n on each platform (CI splits jobs this way).
 *   --port-base p   shard k's servers listen on p + 10k (node) and p + 10k + 1 (Cloudflare).
 *
 * Output goes to e2e/.results/<platform>.log (every shard's log, one after the other; also
 * <platform>-<k>.log per shard) and test-results/<platform>[-<k>]/; failures are listed at the end.
 * Measured file durations go to e2e/.results/timings.json (the next split uses them, over
 * e2e/timings.json). Traces are off unless you pass --trace. Exits non-zero when any run fails.
 */
import { existsSync, statSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { availableParallelism, totalmem } from "node:os";
import { join } from "node:path";
import {
  groupSeconds,
  mergeTimings,
  namedFiles,
  parseListTimings,
  partition,
  shardPorts,
  splitArgs,
  START_S,
  startGates,
  takeStartLock,
  type Timings,
} from "./e2e-shards.ts";

const root = join(import.meta.dir, "..");
const out = join(root, "e2e/.results");
await mkdir(out, { recursive: true });
const args = splitArgs(process.argv.slice(2));
const platforms = (args.platforms ?? ["node", "cloudflare"]) as ("node" | "cloudflare")[];
const portBase = args.portBase ?? 4411;

/**
 * Runs per platform when none is asked for: a quarter of the cores, at most 4, and one per 8 GB
 * of the machine's memory per platform (a node run holds about 4 GB, a Cloudflare one about
 * 5.5 GB, W-1096): 2 each on a 16-core, 39 GB machine, 1 on a CI runner.
 */
function defaultShards(): number {
  const env = Number(process.env["EMVB_E2E_SHARDS"]);
  if (env > 0) return env;
  const byCpu = Math.floor(availableParallelism() / 4);
  const byMemory = Math.floor(totalmem() / (8 * 2 ** 30) / platforms.length);
  return Math.max(1, Math.min(4, byCpu, byMemory));
}

const named = namedFiles(args.playwright);
const specs = (await Array.fromAsync(new Bun.Glob("e2e/*.e2e.ts").scan({ cwd: root }))).toSorted();
const filesNamed = named.files.length > 0;
const splittable = !named.lines && named.files.every((f) => existsSync(join(root, f)));
/** Runs for `platform`: as asked (`--shards 3` or `--shards node=3,cloudflare=2`), else the default. */
const shardsFor = (platform: string): number => {
  if (!splittable) return 1;
  const asked = typeof args.shards === "number" ? args.shards : args.shards?.[platform];
  return asked !== undefined && asked > 0 ? asked : defaultShards();
};
const split = platforms.some((p) => shardsFor(p) > 1);
const files = filesNamed ? named.files : specs;
// Positional arguments are the files; the rest (options, -g) go to every run.
const options = filesNamed
  ? args.playwright.filter((a) => !named.files.includes(a))
  : args.playwright;

const readTimings = async (path: string): Promise<Timings> =>
  existsSync(path) ? ((await Bun.file(path).json()) as Timings) : {};
const localTimings = join(out, "timings.json");
const timings = mergeTimings(
  await readTimings(join(root, "e2e/timings.json")),
  await readTimings(localTimings),
);

type Run = { platform: "node" | "cloudflare"; shard: number; files: string[] };
const runs: Run[] = platforms.flatMap((platform) => {
  const shards = shardsFor(platform);
  const groups =
    shards > 1
      ? partition(files, shards, timings[platform] ?? {}, START_S)
      : [filesNamed ? files : []];
  if (shards > 1) {
    const predicted = groupSeconds(groups, timings[platform] ?? {}).join(", ");
    process.stdout.write(`${platform}: ${groups.length} shards, predicted ${predicted} s\n`);
  }
  return groups
    .map((group, shard) => ({ platform, shard, files: group }))
    .filter((run) => args.only === undefined || run.shard === args.only - 1);
});

/**
 * Resolves once the run has signed in (its setup project wrote `auth` after `since`: the admin
 * loaded cleanly twice, so its server is past its first dependency optimisation), it has ended,
 * or `ms` have passed.
 */
async function warmedUp(auth: string, since: number, exited: Promise<number>, ms = 300_000) {
  const state = { ended: false };
  void exited.then(() => {
    state.ended = true;
  });
  const until = Date.now() + ms;
  while (Date.now() < until && !state.ended) {
    if (existsSync(auth) && statSync(auth).mtimeMs >= since) return;
    // oxlint-disable-next-line no-await-in-loop -- polls until the sign-in is saved
    await Bun.sleep(500);
  }
}

/** Whether nothing listens on `port` (a busy port would make Vite quietly pick the next one). */
const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const probe = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });

/**
 * A shard's own Vite cache starts as a copy of the first shard's (copy-on-write where the disk
 * can), taken again whenever that one is newer: by then the first shard has signed in, so its
 * cache holds every dependency the admin needs and the copy's own server optimises nothing
 * (a node dev server takes 3–4 GB while it does). Vite checks the copy's hash anyway.
 */
/** When a Vite cache last optimised its dependencies; -1 when it hasn't. */
const stamp = (dir: string) => {
  const meta = join(dir, "deps", "_metadata.json");
  return existsSync(meta) ? statSync(meta).mtimeMs : -1;
};
async function seedViteCache(platform: "node" | "cloudflare", shard: number) {
  const demo = join(root, "demos", platform === "node" ? "node" : "cloudflare", "node_modules");
  const from = join(demo, ".vite");
  const to = join(demo, `.vite-e2e-${shard + 1}`);
  if (shard === 0 || stamp(from) < 0 || stamp(to) >= stamp(from)) return;
  await rm(to, { recursive: true, force: true });
  await Bun.spawn(["cp", "-a", "--reflink=auto", from, to]).exited;
}

// W-1096: a platform's runs start one after another, each once the one before has signed in on
// its warm server: six dev servers optimising their dependencies at once ran a 15 GB cap out of
// memory.
const turn = startGates();
const started = Date.now();
const results = await Promise.all(
  runs.map(async ({ platform, shard, files: group }) => {
    const name = split ? `${platform}-${shard + 1}` : platform;
    const ports = shardPorts(portBase, shard);
    const done = await turn(platform);
    // One server starting at a time across every e2e:full on the machine (verify runs each demo
    // as its own); given back once this run has signed in, like the platform's turn.
    const unlock = await takeStartLock(join(out, ".start.lock"));
    const port = platform === "node" ? ports.node : ports.cloudflare;
    if (!(await portFree(port))) {
      done();
      unlock();
      const message = `port ${port} is in use: stop what listens there or pass another --port-base`;
      return {
        platform,
        name,
        code: 1,
        summary: message,
        failures: [],
        minutes: "0.0",
        stdout: message,
      };
    }
    await seedViteCache(platform, shard);
    const runStarted = Date.now();
    const authDir = shard > 0 ? `e2e/.auth/shard-${shard + 1}` : "e2e/.auth";
    const child = Bun.spawn(
      [
        "bunx",
        "playwright",
        "test",
        `--project=${platform}`,
        // Each run has its own results folder: one cleaning it must not break another.
        `--output=test-results/${name}`,
        // Recording a trace for every test costs about a third of the CPU; re-run one with --trace on.
        ...(options.some((arg) => arg.startsWith("--trace")) ? [] : ["--trace=off"]),
        ...options,
        ...group,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          EMVB_E2E_PLATFORM: platform,
          CI: process.env["CI"] ?? "1",
          EMVB_E2E_NODE_PORT: String(ports.node),
          EMVB_E2E_CF_PORT: String(ports.cloudflare),
          // Shard 0 keeps the usual sign-in file and Vite cache; the others get their own.
          ...(shard > 0
            ? { EMVB_E2E_AUTH_DIR: authDir, EMVB_VITE_CACHE: `node_modules/.vite-e2e-${shard + 1}` }
            : {}),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    void warmedUp(join(root, authDir, `${platform}.json`), runStarted, child.exited).then(() => {
      unlock();
      done();
    });
    const [stdout, stderr] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const code = await child.exited;
    await Bun.write(join(out, `${name}.log`), stdout + stderr);
    const summary = (stdout.match(/^\s+\d+ (passed|failed|flaky|skipped|did not run).*$/gm) ?? [])
      .map((line) => line.trim())
      .join(", ");
    const failures = stdout.match(/^\s+✘.*$/gm) ?? [];
    const minutes = ((Date.now() - runStarted) / 60_000).toFixed(1);
    return { platform, name, code, summary, failures, minutes, stdout: stdout + stderr };
  }),
);

const fresh: Timings = {};
for (const result of results) {
  fresh[result.platform] = { ...fresh[result.platform], ...parseListTimings(result.stdout) };
}
await Bun.write(
  localTimings,
  `${JSON.stringify(mergeTimings(await readTimings(localTimings), fresh), null, 2)}\n`,
);
if (split) {
  // The usual per-platform log, for anyone who reads e2e/.results/<platform>.log.
  for (const platform of platforms) {
    const logs = results.filter((r) => r.platform === platform).map((r) => r.stdout);
    if (logs.length > 0) await Bun.write(join(out, `${platform}.log`), logs.join("\n"));
  }
}

const minutes = ((Date.now() - started) / 60_000).toFixed(1);
const print = (line: string) => process.stdout.write(`${line}\n`);
for (const { name, code, summary, failures, minutes: took } of results) {
  print(
    `${name}: ${code === 0 ? "ok" : `exit ${code}`} — ${summary || "no summary"} [${took} min]`,
  );
  for (const line of failures) print(`  ${line.trim()}`);
}
print(`e2e:full finished in ${minutes} min; logs in e2e/.results/`);
process.exit(results.every((r) => r.code === 0) ? 0 : 1);
