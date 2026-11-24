/**
 * W-1035: every e2e run gets its own demo data, so content left in the developer's demo databases
 * (or by an earlier run) can't change a result, and runs never share state.
 *
 * A Playwright run makes `e2e/.data/run-<time>-<pid>/` and gives each demo server it starts the
 * `<platform>` folder inside it (`EMVB_DEMO_DATA`): the node demo keeps `data.db` and `uploads/`
 * there, the Cloudflare demo its local D1 and R2 state (`v3/`). A caller can name the folder
 * instead (`EMVB_E2E_DATA`), as the seeded-bug runner does for each lane; it then keeps it.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
export const DATA_ROOT = join(ROOT, "e2e/.data");
/** Runs older than this are leftovers of an interrupted run. */
const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * This run's data folder. The Playwright runner calls it first and sets `EMVB_E2E_DATA`, which
 * its workers inherit, so every process of the run agrees on the folder.
 */
export function runDataDir(): string {
  const given = process.env["EMVB_E2E_DATA"];
  if (given) return given;
  const dir = join(DATA_ROOT, `run-${Date.now()}-${process.pid}`);
  process.env["EMVB_E2E_DATA"] = dir;
  process.env["EMVB_E2E_DATA_OWNED"] = "1";
  return dir;
}

/** The data folder of one platform's demo servers in this run, made if it isn't there yet. */
export function platformDataDir(platform: string): string {
  const dir = join(runDataDir(), platform);
  // SQLite doesn't make the folder of a new database file.
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * W-1096: the file a platform's sign-in (the setup project) is saved to and every spec starts
 * from. `bun run e2e:full` gives each of its parallel runs its own folder (`EMVB_E2E_AUTH_DIR`),
 * since each signs in to its own demo server.
 */
export const authFile = (platform: string) =>
  join(process.env["EMVB_E2E_AUTH_DIR"] ?? "e2e/.auth", `${platform}.json`);

/** Removes runs that an interrupted Playwright run left behind; never this run's folder. */
export function pruneStaleRuns(now = Date.now()) {
  let names: string[];
  try {
    names = readdirSync(DATA_ROOT);
  } catch {
    return;
  }
  const current = process.env["EMVB_E2E_DATA"];
  for (const name of names) {
    const dir = join(DATA_ROOT, name);
    if (!name.startsWith("run-") || dir === current) continue;
    try {
      if (now - statSync(dir).mtimeMs > STALE_MS) rmSync(dir, { recursive: true, force: true });
    } catch {
      // Another run removed it first.
    }
  }
}

/** Playwright's global teardown: removes the run's folder unless the caller named it. */
export default function removeRunData() {
  const dir = process.env["EMVB_E2E_DATA"];
  if (dir && process.env["EMVB_E2E_DATA_OWNED"] === "1")
    rmSync(dir, { recursive: true, force: true });
}

/** The demo's SQLite database in this run: the node file, or Wrangler's local D1 file. */
export function demoDatabase(platform: string): string {
  const data = platformDataDir(platform);
  if (platform === "node") return join(data, "data.db");
  // Wrangler keeps the local D1 database as a SQLite file named by a hash.
  const dir = join(data, "v3/d1/miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find(
    (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
  );
  if (!file) throw new Error(`No local D1 database in ${dir}`);
  return join(dir, file);
}
