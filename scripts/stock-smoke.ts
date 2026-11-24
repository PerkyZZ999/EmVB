/**
 * The stock install smoke a release runs (W-1084, W-1095; one command since W-1096): EmVB's packed
 * tarballs installed on six stock EmDash sites (1.4.0, 1.5.0 and 1.6.0, Node and Cloudflare, with
 * the hello extension), `astro check`, then scripts/stock-smoke/checks.ts on the dev server and on
 * the production build of each. The sites run side by side, each on its own ports.
 *
 *   bun scripts/stock-smoke.ts --tarballs <dir> [--logs <dir>] [--sites <dir>] [--only a,b]
 *                              [--parallel n] [--port-base 7711] [--refresh] [--keep]
 *
 *   --tarballs  where `bun scripts/release.ts pack` put perkyzz-emvb(-icons)-<version>.tgz
 *   --sites     where the sites go (default EMVB_STOCK_SITES, else .verify/stock-sites); several GB
 *   --refresh   make the cached templates again (they need the network: create-emdash, npm)
 *   --keep      keep the sites afterwards (they are removed; the templates stay)
 *
 * Creating a site downloads its template and packages; that result (before EmVB) is kept as a
 * template under <sites>/.templates and copied (copy-on-write where the disk can) for each run,
 * so a run only installs the tarballs. Exits non-zero when any site fails.
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  STOCK_SITES,
  astroConfig,
  createCommands,
  route,
  stockDependencyProblem,
  templateKey,
} from "./stock-smoke/sites.ts";
import type { StockSite } from "./stock-smoke/sites.ts";

const ROOT = join(import.meta.dir, "..");
const option = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const tarballDir = option("tarballs");
if (!tarballDir)
  throw new Error("usage: bun scripts/stock-smoke.ts --tarballs <dir> [--logs <dir>]");
const logs = resolve(option("logs") ?? join(ROOT, ".verify", "stock"));
const sitesDir = resolve(
  option("sites") ?? process.env["EMVB_STOCK_SITES"] ?? join(ROOT, ".verify", "stock-sites"),
);
const templates = join(sitesDir, ".templates");
const only = (option("only") ?? "").split(",").filter(Boolean);
const parallel = Math.max(1, Number(option("parallel") ?? 4) || 1);
const portBase = Number(option("port-base") ?? 7711);
const refresh = process.argv.includes("--refresh");
const keep = process.argv.includes("--keep");
const print = (line: string) => process.stdout.write(`${line}\n`);

/** Runs a command with its output in `log`; resolves to its exit code. */
async function run(command: string[], cwd: string, log: string, env: Record<string, string> = {}) {
  const file = Bun.file(log);
  const proc = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const before = (await file.exists()) ? await file.text() : "";
  await Bun.write(file, `${before}$ ${command.join(" ")}\n${out}${err}\nexit ${code}\n`);
  return code;
}

/** A server in its own process group (so all of it stops together), with its output in `log`. */
function serve(command: string[], cwd: string, log: string, env: Record<string, string> = {}) {
  return Bun.spawn(["setsid", ...command], {
    cwd,
    env: { ...process.env, ...env },
    stdout: Bun.file(log),
    stderr: "ignore",
  });
}
async function stop(proc: { pid: number; exited: Promise<number> }) {
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
async function up(port: number, seconds = 300): Promise<boolean> {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- polls until the server answers
      await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5000) });
      return true;
    } catch {
      // oxlint-disable-next-line no-await-in-loop -- same
      await Bun.sleep(1000);
    }
  }
  return false;
}

/** The site's template, made (with the network) if it isn't cached yet. */
async function template(site: StockSite, log: string): Promise<string> {
  const dir = join(templates, templateKey(site));
  if (existsSync(join(dir, "node_modules")) && !refresh) return dir;
  const work = join(templates, `.new-${site.name}`);
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  for (const step of createCommands(site)) {
    const cwd = step.cwd === "parent" ? work : join(work, site.name);
    // oxlint-disable-next-line no-await-in-loop -- each step needs the one before
    if ((await run(step.command, cwd, log)) !== 0) throw new Error(`creating ${site.name} failed`);
  }
  await rm(dir, { recursive: true, force: true });
  await run(["mv", join(work, site.name), dir], templates, log);
  await rm(work, { recursive: true, force: true });
  return dir;
}

type Result = { site: string; ok: boolean; seconds: number; failed?: string };

async function smoke(site: StockSite, index: number, tarballs: string[]): Promise<Result> {
  const started = performance.now();
  const log = (step: string) => join(logs, `${site.name}-${step}.log`);
  const dir = join(sitesDir, site.name);
  const dev = portBase + 2 * index;
  const prod = dev + 1;
  const fail = (failed: string): Result => ({
    site: site.name,
    ok: false,
    seconds: (performance.now() - started) / 1000,
    failed,
  });
  const from = await template(site, log("create"));
  await rm(dir, { recursive: true, force: true });
  // Copy-on-write where the file system can (XFS, Btrfs): seconds for a site of several GB.
  if ((await run(["cp", "-a", "--reflink=auto", from, dir], sitesDir, log("install"))) !== 0)
    return fail("copy");
  if (
    (await run(
      ["npm", "i", "--no-audit", "--no-fund", "--prefer-offline", ...tarballs],
      dir,
      log("install"),
    )) !== 0
  )
    return fail("npm install of the tarballs");
  const lock = (await Bun.file(join(dir, "package-lock.json")).json()) as {
    packages: Record<string, { version?: string }>;
  };
  const dependencyProblem = stockDependencyProblem(site, lock.packages);
  if (dependencyProblem) return fail(dependencyProblem);
  await writeFile(join(dir, "astro.config.mjs"), astroConfig(site));
  await mkdir(join(dir, "src/pages/v"), { recursive: true });
  await writeFile(join(dir, "src/pages/v/[slug].astro"), route(site));
  if ((await run(["npx", "astro", "check"], dir, log("check"))) !== 0) return fail("astro check");

  const state = join(logs, `${site.name}-state.json`);
  const checks = (mode: "dev" | "prod", port: number) => [
    "bun",
    "scripts/stock-smoke/checks.ts",
    mode,
    `http://127.0.0.1:${port}`,
    state,
    "--ext",
    `--cookie=${site.cookie}`,
    ...(mode === "dev" && site.forms ? ["--forms"] : []),
  ];
  // Astro 7.4 backgrounds `astro dev` when an agent runs it; this keeps it in the foreground.
  const devServer = serve(
    ["npx", "astro", "dev", "--host", "127.0.0.1", "--port", String(dev)],
    dir,
    log("dev-server"),
    {
      ASTRO_DEV_BACKGROUND: "1",
    },
  );
  try {
    if (!(await up(dev))) return fail("dev server did not start");
    if ((await run(checks("dev", dev), ROOT, log("smoke-dev"))) !== 0) return fail("dev smoke");
  } finally {
    await stop(devServer);
  }
  if ((await run(["npx", "astro", "build"], dir, log("build"))) !== 0) return fail("build");
  const prodServer =
    site.platform === "node"
      ? serve(["node", "./dist/server/entry.mjs"], dir, log("prod-server"), {
          HOST: "127.0.0.1",
          PORT: String(prod),
        })
      : serve(
          ["npx", "wrangler", "dev", "--ip", "127.0.0.1", "--port", String(prod)],
          dir,
          log("prod-server"),
        );
  try {
    if (!(await up(prod))) return fail("production server did not start");
    if ((await run(checks("prod", prod), ROOT, log("smoke-prod"))) !== 0)
      return fail("production smoke");
  } finally {
    await stop(prodServer);
  }
  if (!keep) await rm(dir, { recursive: true, force: true });
  return { site: site.name, ok: true, seconds: (performance.now() - started) / 1000 };
}

await mkdir(logs, { recursive: true });
await mkdir(templates, { recursive: true });
const sites = STOCK_SITES.filter((s) => only.length === 0 || only.includes(s.name));
const tgz = (await readdir(resolve(tarballDir))).filter((f) =>
  /^perkyzz-emvb(-icons)?-[\d.]+\.tgz$/.test(f),
);
if (tgz.length !== 2)
  throw new Error(
    `expected the emvb and emvb-icons tarballs in ${tarballDir}, found ${tgz.join(", ")}`,
  );
// The hello extension, packed as a user would get it.
const extDir = join(logs, "ext");
await mkdir(extDir, { recursive: true });
if (
  (await run(
    ["bun", "pm", "pack", "--destination", extDir, "--quiet"],
    join(ROOT, "examples/emvb-ext-hello"),
    join(logs, "ext-pack.log"),
  )) !== 0
)
  throw new Error("packing examples/emvb-ext-hello failed");
const ext = (await readdir(extDir)).filter((f) => f.endsWith(".tgz")).map((f) => join(extDir, f));
// Icons first, as the install guide lists them.
const tarballs = [
  ...tgz
    .toSorted()
    .toReversed()
    .map((f) => join(resolve(tarballDir), f)),
  ...ext,
];

const started = performance.now();
const queue = sites.map((site, index) => ({ site, index }));
const results: Result[] = [];
await Promise.all(
  Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { site, index } = next;
      // oxlint-disable-next-line no-await-in-loop -- one site at a time per slot
      const result = await smoke(site, index, tarballs).catch((error: unknown) => ({
        site: site.name,
        ok: false,
        seconds: 0,
        failed: String(error),
      }));
      results.push(result);
      print(
        `${result.ok ? "ok  " : "FAIL"} ${result.site} in ${Math.round(result.seconds)} s${result.failed ? `: ${result.failed} (logs ${logs}/${result.site}-*.log)` : ""}`,
      );
    }
  }),
);
print(
  `stock smoke: ${results.filter((r) => r.ok).length}/${results.length} sites ok in ${Math.round((performance.now() - started) / 1000)} s; logs in ${logs}`,
);
process.exit(results.every((r) => r.ok) && results.length === sites.length ? 0 : 1);
