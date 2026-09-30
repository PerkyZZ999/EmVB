/**
 * R-052 / W-044: `bun pm pack` the emvb package and assert the tarball ships
 * TypeScript source exports (no build step).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PKG = join(ROOT, "packages/emvb");

const EXPORTS = [".", "./astro", "./astro/forms", "./admin", "./core"];
const FILES = [
  "package/src/index.ts",
  "package/src/astro/index.ts",
  "package/src/astro/forms/index.ts",
  "package/src/admin/index.tsx",
];

type PackedPackage = {
  name?: string;
  exports?: Record<string, string | { import?: string; default?: string }>;
};

/** What is wrong with a packed package.json and tarball file list; empty when it ships TS source. */
export function packProblems(pkg: PackedPackage, names: string): string[] {
  const problems: string[] = [];
  if (pkg.name !== "emvb") problems.push(`expected name emvb, got ${pkg.name}`);
  for (const key of EXPORTS) {
    const entry = pkg.exports?.[key];
    const path = typeof entry === "string" ? entry : (entry?.import ?? entry?.default ?? "");
    if (!path.includes(".ts")) {
      problems.push(`export ${key} must point at TypeScript source, got ${JSON.stringify(entry)}`);
    }
  }
  for (const need of FILES) if (!names.includes(need)) problems.push(`tarball missing ${need}`);
  return problems;
}

async function run(cmd: string[], cwd?: string) {
  const child = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(`${cmd.slice(0, 3).join(" ")} failed (exit ${code})\n${out}${err}`);
  return out;
}

/** Packs the emvb package and returns what is wrong with the tarball; empty when it ships TS source. */
export async function packSmoke(): Promise<string[]> {
  const staging = await mkdtemp(join(tmpdir(), "emvb-pack-"));
  try {
    await run(["bun", "pm", "pack", "--destination", staging], PKG);
    const listing = await Array.fromAsync(
      new Bun.Glob("*.tgz").scan({ cwd: staging, absolute: true }),
    );
    const tarball = listing[0];
    if (!tarball) throw new Error(`No tarball in ${staging}`);
    const pkg = JSON.parse(
      await run(["tar", "-xOf", tarball, "package/package.json"]),
    ) as PackedPackage;
    return packProblems(pkg, await run(["tar", "-tzf", tarball]));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  const problems = await packSmoke();
  if (problems.length > 0) throw new Error(problems.join("\n"));
  process.stdout.write("pack-smoke ok: the tarball exports TS source\n");
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
