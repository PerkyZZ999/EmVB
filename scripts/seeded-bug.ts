/**
 * Seeded-bug runner (N-001): applies each mutation from a manifest, runs the check that should
 * catch it, restores the files, and fails if any mutation went unnoticed.
 *
 *   bun scripts/seeded-bug.ts [--manifest scripts/seeded-bugs.json] [--root .] [--only <text>]
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
