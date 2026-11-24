/**
 * Switch the plugin and both browser-test demos to a supported EmDash release.
 * Run `bun install` afterward. Keep compatibility-only changes in a scratch checkout.
 *
 *   bun scripts/use-emdash.ts 1.4.0 && bun install
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The zod each EmDash depends on; the root override follows it (W-1007). */
export const EMDASH_ZOD: Record<string, string> = {
  "1.4.0": "4.5.4",
  "1.5.0": "4.6.7",
  "1.6.0": "4.6.7",
};

/** What each supported EmDash pins (from its @emdash-cms/admin and the forms plugin it ships with). */
export const EMDASH_SETS: Record<string, Record<string, string>> = {
  "1.4.0": { emdash: "1.4.0", "@cloudflare/kumo": "2.6.0", "@emdash-cms/plugin-forms": "0.2.12" },
  "1.5.0": { emdash: "1.5.0", "@cloudflare/kumo": "2.15.0", "@emdash-cms/plugin-forms": "0.2.13" },
  "1.6.0": { emdash: "1.6.0", "@cloudflare/kumo": "2.19.0", "@emdash-cms/plugin-forms": "0.2.14" },
};

export function withEmDash(
  manifest: Record<string, unknown>,
  version: string,
  section: "devDependencies" | "dependencies" = "devDependencies",
) {
  const set = EMDASH_SETS[version];
  if (!set)
    throw new Error(`No EmDash set for ${version}; known: ${Object.keys(EMDASH_SETS).join(", ")}`);
  const dependencies = { ...(manifest[section] as Record<string, string>) };
  for (const [name, pinned] of Object.entries(set)) {
    if (section === "devDependencies" || name in dependencies) dependencies[name] = pinned;
  }
  if ("@emdash-cms/cloudflare" in dependencies) dependencies["@emdash-cms/cloudflare"] = version;
  return { ...manifest, [section]: dependencies };
}

/** The root manifest with the zod override that EmDash release uses. */
export function rootWithEmDash(manifest: Record<string, unknown>, version: string) {
  const zod = EMDASH_ZOD[version];
  if (!zod) throw new Error(`No zod for EmDash ${version}`);
  const overrides = { ...(manifest["overrides"] as Record<string, string>), zod };
  return { ...manifest, overrides };
}

const update = (file: string, edit: (manifest: Record<string, unknown>) => unknown) => {
  const path = join(import.meta.dir, "..", file);
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  writeFileSync(path, `${JSON.stringify(edit(manifest), null, 2)}\n`);
};

if (import.meta.main) {
  const version = process.argv[2] ?? "";
  update("packages/emvb/package.json", (manifest) => withEmDash(manifest, version));
  for (const demo of ["node", "cloudflare"]) {
    update(`demos/${demo}/package.json`, (manifest) =>
      withEmDash(manifest, version, "dependencies"),
    );
  }
  update("package.json", (manifest) => rootWithEmDash(manifest, version));
  process.stdout.write(`The plugin and both demos now use EmDash ${version}. Run bun install.\n`);
}
