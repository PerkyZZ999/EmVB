/**
 * W-1096: how `bun run e2e:full` splits each platform's spec files over several Playwright runs
 * (shards), each with its own demo server, data, sign-in and Vite cache, so no two runs share a
 * site. Files go to shards by their last known duration, longest first (LPT), so the shards end
 * together.
 */

/** Seconds per spec file, per platform (`e2e/editing.e2e.ts` → 47). */
export type Timings = Record<string, Record<string, number>>;

/** The cost of a file beyond its tests' own durations: its worker, `beforeAll`, first page loads. */
export const FILE_OVERHEAD_S = 2;

const seconds = (text: string) => {
  const match = text.match(/^([\d.]+)(ms|s|m)$/);
  if (!match) return 0;
  const value = Number(match[1]);
  return match[2] === "ms" ? value / 1000 : match[2] === "m" ? value * 60 : value;
};

/**
 * Each spec file's total test time in one platform's list-reporter output (the sign-in setup
 * left out), plus FILE_OVERHEAD_S, keyed by its path from the repository root.
 */
export function parseListTimings(output: string): Record<string, number> {
  const line =
    /^\s+[✓✘-]\s+\d+\s+\[([^\]]+)\]\s+›\s+(\S+?\.ts):\d+:\d+\s+›.*\(([\d.]+(?:ms|s|m))\)\s*$/gm;
  const totals: Record<string, number> = {};
  for (const match of output.matchAll(line)) {
    const [, project = "", file = "", duration = ""] = match;
    if (project.endsWith("-setup")) continue;
    totals[file] = (totals[file] ?? FILE_OVERHEAD_S) + seconds(duration);
  }
  return Object.fromEntries(
    Object.entries(totals).map(([file, total]) => [file, Math.round(total * 10) / 10]),
  );
}

/** Newer measurements replace older ones file by file; files not run this time keep theirs. */
export function mergeTimings(older: Timings, newer: Timings): Timings {
  const merged: Timings = { ...older };
  for (const [platform, files] of Object.entries(newer)) {
    merged[platform] = { ...older[platform], ...files };
  }
  return merged;
}

/**
 * Splits `files` into at most `shards` groups that end at about the same time: longest first,
 * each to the group with the least time so far. Group k starts `stagger × k` seconds late (runs
 * start one after another), so later groups get a little less. A file with no timing counts as
 * the median known one. Groups keep the files' original order (Playwright runs them
 * alphabetically anyway), and empty groups are dropped.
 */
export function partition(
  files: readonly string[],
  shards: number,
  timings: Readonly<Record<string, number>> = {},
  stagger = 0,
): string[][] {
  const known = files
    .map((f) => timings[f])
    .filter((t): t is number => t !== undefined)
    .toSorted((a, b) => a - b);
  const fallback = known.length > 0 ? (known[Math.floor(known.length / 2)] ?? 1) : 1;
  const cost = (file: string) => timings[file] ?? fallback;
  const groups = Array.from({ length: Math.max(1, shards) }, (_, k) => ({
    total: stagger * k,
    files: new Set<string>(),
  }));
  const byCost = files.toSorted((a, b) => cost(b) - cost(a) || a.localeCompare(b));
  for (const file of byCost) {
    const lightest = groups.reduce((min, g) => (g.total < min.total ? g : min));
    lightest.files.add(file);
    lightest.total += cost(file);
  }
  return groups.filter((g) => g.files.size > 0).map((g) => files.filter((f) => g.files.has(f)));
}

/** About how long a run takes to start and sign in, so the next one may start (W-1096). */
export const START_S = 35;

/** The predicted time of each group, for the log. */
export const groupSeconds = (
  groups: readonly (readonly string[])[],
  timings: Readonly<Record<string, number>>,
) => groups.map((g) => Math.round(g.reduce((sum, f) => sum + (timings[f] ?? 0), 0)));

/**
 * Shard k's demo ports: node on `base + 10k`, Cloudflare one above, so shard 0 keeps the usual
 * 4411/4412 and the seeded-bug lanes (100 apart) and production servers (base + 10) of other
 * runs can be kept clear by moving `base`.
 */
export const shardPorts = (base: number, shard: number) => ({
  node: base + 10 * shard,
  cloudflare: base + 1 + 10 * shard,
});

/**
 * Splits e2e-full's own flags from the Playwright arguments it passes through. A file:line or
 * `--shard` filter means the caller picked the tests: those runs aren't split again.
 */
export function splitArgs(argv: readonly string[]): {
  /** Runs per platform: one number for all, or per platform (`--shards node=3,cloudflare=2`). */
  shards?: number | Record<string, number>;
  only?: number;
  platforms?: string[];
  portBase?: number;
  playwright: string[];
} {
  const out: ReturnType<typeof splitArgs> = { playwright: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const [flag, inline] = arg.startsWith("--") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const take = () => inline ?? argv[++i] ?? "";
    if (flag === "--shards") {
      const value = take();
      out.shards = value.includes("=")
        ? Object.fromEntries(
            value.split(",").map((pair) => {
              const [platform = "", n = ""] = pair.split("=");
              return [platform, Number(n)];
            }),
          )
        : Number(value);
    } else if (flag === "--only-shard") out.only = Number(take());
    else if (flag === "--platform") out.platforms = take().split(",").filter(Boolean);
    else if (flag === "--port-base") out.portBase = Number(take());
    else out.playwright.push(arg);
  }
  return out;
}

/** Spec files the caller named (the rest of Playwright's arguments are filters and options). */
export function namedFiles(playwright: readonly string[]): {
  files: string[];
  lines: boolean;
} {
  const files: string[] = [];
  let lines = false;
  for (let i = 0; i < playwright.length; i++) {
    const arg = playwright[i] ?? "";
    if (arg.startsWith("-")) {
      // Options that take a value as the next argument.
      if (
        /^(-g|--grep|-G|--grep-invert|--project|--output|--reporter|--trace|--workers|-j|--max-failures|--retries|--repeat-each|--timeout|--global-timeout|--shard|-c|--config)$/.test(
          arg,
        )
      )
        i++;
      if (arg.startsWith("--shard")) lines = true;
      continue;
    }
    if (/:\d+(:\d+)?$/.test(arg)) lines = true;
    files.push(arg.replace(/:\d+(:\d+)?$/, ""));
  }
  return { files, lines };
}

/**
 * W-1096: runs of the same platform start one after another: `turn(key)` waits until the run
 * before it under the same key called its `done` (its server is up, or it ended); other keys
 * don't wait. Six dev servers optimising their dependencies at once ran a 15 GB cap out of memory.
 */
export function startGates() {
  const last = new Map<string, Promise<void>>();
  return async (key: string): Promise<() => void> => {
    const before = last.get(key) ?? Promise.resolve();
    const gate = Promise.withResolvers<void>();
    last.set(key, gate.promise);
    await before;
    return gate.resolve;
  };
}

/** Serializes demo startup across both verify jobs. Closing the pipe releases the OS lock. */
export async function takeStartLock(path: string): Promise<() => void> {
  const lock = Bun.spawn(
    ["flock", "--exclusive", path, "sh", "-c", "printf 'locked\\n'; cat >/dev/null"],
    { stdin: "pipe", stdout: "pipe", stderr: "inherit" },
  );
  const reader = lock.stdout.getReader();
  const ready = await reader.read();
  reader.releaseLock();
  if (ready.done) {
    lock.stdin.end();
    throw new Error(`Could not acquire the demo start lock at ${path} (exit ${await lock.exited})`);
  }
  return () => {
    lock.stdin.end();
  };
}
