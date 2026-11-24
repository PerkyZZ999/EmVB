/**
 * W-1096: the jobs `bun run verify` and `bun run verify:release` run, and how they share the
 * machine. Each job runs under its own memory cap (systemd MemoryMax, the job's `memGB`), and a
 * job starts only when its cap fits in what the running jobs leave of the run's memory budget, so
 * the caps never add up to more than the budget. CPU is shared the same way, loosely: `cpu` is
 * about how many cores the job keeps busy.
 */

export type Job = {
  name: string;
  /** What it proves, for the summary. */
  title: string;
  command: string[];
  /** Its memory cap in GB, which it also reserves from the run's budget while it runs. */
  memGB: number;
  /** About how many cores it keeps busy. */
  cpu: number;
  /** Jobs that must have passed first (the stock smoke needs the packed tarballs). */
  after?: string[];
  /** Jobs it must never run beside (they build or serve from the same folders). */
  excludes?: string[];
  env?: Record<string, string>;
  /** A folder to run in other than the repository. */
  cwd?: string;
  /**
   * Done in a minute or two: it may use memory a waiting bigger job keeps for itself, since it
   * gives it back long before that job could start anyway.
   */
  short?: boolean;
};

export type Budget = { memGB: number; cpu: number };

export type Progress = {
  done: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  running: readonly Job[];
};

/**
 * The jobs to start now, in plan order (the plan lists the longest first). A job waits for its
 * `after` jobs, and is never started beside a job it `excludes` (either way round). A job that
 * doesn't fit keeps its share: a later, smaller job may start only if it fits beside it too, so
 * small jobs can't starve a big one, unless it is `short` and fits in what is free right now. A
 * job alone on the machine always starts (its own cap still holds), and a job whose `after` job
 * failed never does.
 */
export function startable(
  pending: readonly Job[],
  progress: Progress,
  budget: Budget,
): { start: Job[]; skip: Job[] } {
  const start: Job[] = [];
  const skip: Job[] = [];
  let mem = progress.running.reduce((sum, j) => sum + j.memGB, 0);
  let cpu = progress.running.reduce((sum, j) => sum + j.cpu, 0);
  let reservedMem = 0;
  let reservedCpu = 0;
  const active = () => [...progress.running, ...start];
  for (const job of pending) {
    const after = job.after ?? [];
    if (after.some((name) => progress.failed.has(name))) {
      skip.push(job);
      continue;
    }
    if (!after.every((name) => progress.done.has(name))) continue;
    const clash = active().some(
      (other) => job.excludes?.includes(other.name) || other.excludes?.includes(job.name),
    );
    if (clash) continue;
    const alone = active().length === 0;
    const fits =
      mem + reservedMem + job.memGB <= budget.memGB && cpu + reservedCpu + job.cpu <= budget.cpu;
    const backfills =
      job.short === true && mem + job.memGB <= budget.memGB && cpu + job.cpu <= budget.cpu;
    if (alone || fits || backfills) {
      start.push(job);
      mem += job.memGB;
      cpu += job.cpu;
    } else {
      reservedMem += job.memGB;
      reservedCpu += job.cpu;
    }
  }
  return { start, skip };
}

/** Plan problems: unknown or circular `after` names, duplicate names, a cap over the budget. */
export function planProblems(jobs: readonly Job[], budget: Budget): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const job of jobs) {
    if (names.has(job.name)) problems.push(`${job.name}: duplicate name`);
    names.add(job.name);
    if (job.memGB > budget.memGB)
      problems.push(`${job.name}: its ${job.memGB} GB cap is over the ${budget.memGB} GB budget`);
  }
  for (const job of jobs) {
    for (const name of [...(job.after ?? []), ...(job.excludes ?? [])]) {
      if (!names.has(name)) problems.push(`${job.name}: unknown job ${name}`);
    }
  }
  // Every job must be reachable: a cycle in `after` would wait forever.
  const order = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const job of jobs) {
      if (!order.has(job.name) && (job.after ?? []).every((n) => order.has(n))) {
        order.add(job.name);
        grew = true;
      }
    }
  }
  for (const job of jobs) if (!order.has(job.name)) problems.push(`${job.name}: circular after`);
  return problems;
}

/**
 * The commit of the release before `current`: the newest commit whose subject is a release of
 * another version (`chore(W-1095): release 1.4.1`, `chore: release 1.2.0 (prepared; gate pending)`),
 * from `git log --format='%H %s'` output, newest first. Seeds changed since then are the release's.
 */
export function previousRelease(log: string, current: string): string | undefined {
  for (const line of log.split("\n")) {
    const [sha = "", ...words] = line.trim().split(" ");
    const version = words.join(" ").match(/^chore(?:\([^)]*\))?: release (\d+\.\d+\.\d+)\b/)?.[1];
    if (version && version !== current) return sha;
  }
  return undefined;
}

export type Outcome = {
  job: Job;
  status: "passed" | "failed" | "skipped";
  startedS?: number;
  seconds?: number;
  /** The job's peak memory without the file cache (sampled), its cgroup's memory.peak, CPU time. */
  peakGB?: number;
  cgroupPeakGB?: number;
  cpuS?: number;
  detail?: string;
};

const pad = (text: string, width: number) => text.padEnd(width);
const fixed = (value: number | undefined, digits = 1) =>
  value === undefined ? "-" : value.toFixed(digits);

/** The per-job table printed at the end and written to the run's summary file. */
export function summaryTable(
  outcomes: readonly Outcome[],
  wallS: number,
  peakTotalGB?: number,
): string {
  const rows = outcomes.map((o) => [
    o.status === "passed" ? "ok" : o.status === "failed" ? "FAIL" : "skip",
    o.job.name,
    fixed(o.startedS === undefined ? undefined : o.startedS / 60),
    fixed(o.seconds === undefined ? undefined : o.seconds / 60),
    fixed(o.peakGB),
    `${o.job.memGB}`,
    o.cpuS !== undefined && o.seconds ? fixed(o.cpuS / o.seconds) : "-",
    o.detail ?? o.job.title,
  ]);
  const head = ["", "job", "start", "min", "peak GB", "cap GB", "cores", "result"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === cells.length - 1 ? c : pad(c, widths[i] ?? 0)))
      .join("  ")
      .trimEnd();
  const failed = outcomes.filter((o) => o.status !== "passed");
  return [
    line(head),
    ...rows.map(line),
    "",
    `wall ${(wallS / 60).toFixed(1)} min` +
      (peakTotalGB === undefined
        ? ""
        : `, peak of all jobs together ${peakTotalGB.toFixed(1)} GB`) +
      `; ${failed.length === 0 ? "all passed" : `${failed.length} not passed: ${failed.map((o) => o.job.name).join(", ")}`}`,
  ].join("\n");
}
