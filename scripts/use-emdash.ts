/**
 * W-1002: switch this checkout's EmDash to another release for a test run (CI's EmDash 1.5
 * job). Sets the plugin's dev versions of emdash, Kumo and the forms plugin to the ones that
 * EmDash release pins, then `bun install` picks them up. Never commit the result.
 *
 *   bun scripts/use-emdash.ts 1.5.0 && bun install
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The zod each EmDash depends on; the root override follows it (W-1007). */
export const EMDASH_ZOD: Record<string, string> = { "1.4.0": "4.5.4", "1.5.0": "4.6.7" };

/** What each supported EmDash pins (from its @emdash-cms/admin and the forms plugin it ships with). */
export const EMDASH_SETS: Record<string, Record<string, string>> = {
  "1.4.0": { emdash: "1.4.0", "@cloudflare/kumo": "2.6.0", "@emdash-cms/plugin-forms": "0.2.12" },
  "1.5.0": { emdash: "1.5.0", "@cloudflare/kumo": "2.15.0", "@emdash-cms/plugin-forms": "0.2.13" },
};

export function withEmDash(manifest: Record<string, unknown>, version: string) {
  const set = EMDASH_SETS[version];
  if (!set)
    throw new Error(`No EmDash set for ${version}; known: ${Object.keys(EMDASH_SETS).join(", ")}`);
  const dev = { ...(manifest["devDependencies"] as Record<string, string>) };
  for (const [name, pinned] of Object.entries(set)) dev[name] = pinned;
  return { ...manifest, devDependencies: dev };
}

/** The root manifest with the zod override that EmDash release uses. */
export function rootWithEmDash(manifest: Record<string, unknown>, version: string) {
  const zod = EMDASH_ZOD[version];
  if (!zod) throw new Error(`No zod for EmDash ${version}`);
  const overrides = { ...(manifest["overrides"] as Record<string, string>), zod };
  return { ...manifest, overrides };
}

if (import.meta.main) {
  const version = process.argv[2] ?? "";
  const path = join(import.meta.dir, "../packages/emvb/package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  writeFileSync(path, `${JSON.stringify(withEmDash(manifest, version), null, 2)}\n`);
  const rootPath = join(import.meta.dir, "../package.json");
  const root = JSON.parse(readFileSync(rootPath, "utf8")) as Record<string, unknown>;
  writeFileSync(rootPath, `${JSON.stringify(rootWithEmDash(root, version), null, 2)}\n`);
  // oxlint-disable-next-line no-console -- a CLI
  console.log(`packages/emvb dev dependencies now follow EmDash ${version}; run bun install.`);
}
