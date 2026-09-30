/**
 * Seeded-bug runner (N-001): applies each mutation from a manifest, runs the check that should
 * catch it, restores the files, and fails if any mutation went unnoticed.
 *
 *   bun scripts/seeded-bug.ts [--manifest scripts/seeded-bugs.json] [--root .] [--only <text>]
 *   bun scripts/seeded-bug.ts --verify   (checks every seed still applies, without running any)
 */
import { createLogger, initLogger } from "evlog";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
};

export async function runSeed(root: string, seed: Seed): Promise<SeedResult> {
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
    const proc = Bun.spawn(seed.command, {
      cwd: root,
      env: { ...process.env, ...seed.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
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
    return { id: seed.id, status: "caught", exitCode, detail: match[0].trim().slice(0, 200) };
  } finally {
    await Promise.all([...originals].map(([path, text]) => writeFile(path, text)));
    await Promise.all(created.map((path) => rm(path, { force: true })));
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

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

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
  const selected = seeds.filter((s) => !only || s.id.includes(only));
  const results: SeedResult[] = [];
  // Seeds mutate the same working tree, so they must run one at a time.
  for (const seed of selected) {
    const log = createLogger({ seed: seed.id, requirement: seed.requirement });
    const started = performance.now();
    const result = await runSeed(root, seed);
    log.set({
      outcome: result.status,
      exitCode: result.exitCode,
      detail: result.detail,
      ms: Math.round(performance.now() - started),
    });
    if (result.status !== "caught") log.error(new Error(`${seed.id}: ${result.status}`));
    log.emit();
    results.push(result);
  }
  const failed = results.filter((r) => r.status !== "caught");
  const summary = createLogger({ run: "seeded-bugs", manifest: manifestPath });
  summary.set({
    total: results.length,
    caught: results.length - failed.length,
    failed: failed.map((r) => r.id),
  });
  summary.emit();
  process.exit(failed.length === 0 && results.length > 0 ? 0 : 1);
}
