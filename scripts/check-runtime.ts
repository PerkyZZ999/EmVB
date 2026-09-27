/**
 * Enforces R-051: every workspace script that launches a Node-shebang CLI without `bun --bun`
 * must be listed in runtime-exceptions.json, and every listed exception must still exist and
 * still run on Node (so the list can't go stale).
 */
import { Glob } from "bun";

const NODE_SHEBANG_CLIS = new Set(["astro", "wrangler", "vitest", "playwright"]);

type Exception = { script: string; reason: string; evidence: string };

export function runsOnNode(command: string): boolean {
  return command.split("&&").some((part) => {
    const words = part
      .trim()
      .split(/\s+/)
      .filter((w) => !/^[A-Z_]+=/.test(w));
    const first = words[0] ?? "";
    return NODE_SHEBANG_CLIS.has(first) || (first === "bunx" && words[1] !== "--bun");
  });
}

type PackageJson = { scripts?: Record<string, string>; workspaces?: string[] };

async function workspaceScripts(root: string): Promise<Map<string, string>> {
  const rootPkg = (await Bun.file(`${root}/package.json`).json()) as PackageJson;
  const nested = await Promise.all(
    (rootPkg.workspaces ?? []).map((pattern) =>
      Array.fromAsync(new Glob(`${pattern}/package.json`).scan(root)),
    ),
  );
  const files = ["package.json", ...nested.flat()];
  const pkgs = await Promise.all(
    files.map(async (file) => ({
      dir: file === "package.json" ? "." : file.replace(/\/package\.json$/, ""),
      pkg: (await Bun.file(`${root}/${file}`).json()) as PackageJson,
    })),
  );
  const scripts = new Map<string, string>();
  for (const { dir, pkg } of pkgs) {
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      scripts.set(`${dir}#${name}`, command);
    }
  }
  return scripts;
}

export async function findProblems(root: string): Promise<string[]> {
  const listed = (
    (await Bun.file(`${root}/runtime-exceptions.json`).json()) as { node: Exception[] }
  ).node;
  const scripts = await workspaceScripts(root);
  const problems: string[] = [];
  for (const [id, command] of scripts) {
    if (runsOnNode(command) && !listed.some((e) => e.script === id)) {
      problems.push(
        `${id} runs on Node ("${command}") but is not listed in runtime-exceptions.json`,
      );
    }
  }
  for (const e of listed) {
    const command = scripts.get(e.script);
    if (command === undefined) problems.push(`${e.script} is listed but no such script exists`);
    else if (!runsOnNode(command))
      problems.push(`${e.script} is listed but now runs on Bun ("${command}")`);
    if (!e.reason || !e.evidence) problems.push(`${e.script} needs a reason and evidence`);
  }
  return problems;
}

if (import.meta.main) {
  const problems = await findProblems(process.cwd());
  for (const p of problems) process.stderr.write(`runtime-exceptions: ${p}\n`);
  process.exit(problems.length === 0 ? 0 : 1);
}
