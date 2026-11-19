import { readdir, mkdir, symlink, lstat, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// bun does not always materialize node_modules/@perkyzz/* symlinks for these
// workspace packages, so scripts run from the repo root (not --cwd a package)
// cannot resolve a sibling workspace by its package name. Re-create the links
// idempotently after install. Safe to run repeatedly.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkgDir = join(root, "packages");
const scope = "@perkyzz";
const linkRoot = join(root, "node_modules", scope);

await mkdir(linkRoot, { recursive: true });
for (const name of await readdir(pkgDir)) {
  const target = join(pkgDir, name);
  const pkgJson = join(target, "package.json");
  const pkgName = (
    await Bun.file(pkgJson)
      .json()
      .catch(() => null)
  )?.name as string | undefined;
  if (!pkgName?.startsWith(`${scope}/`)) continue;
  const link = join(root, "node_modules", pkgName);
  await mkdir(dirname(link), { recursive: true });
  const existing = await lstat(link).catch(() => null);
  if (existing) await rm(link, { recursive: true, force: true });
  await symlink(relative(dirname(link), target), link, "dir");
}
process.stdout.write("Linked @perkyzz workspace packages into node_modules.\n");
