/**
 * R-052 / W-044: `bun pm pack` the emvb package and assert the tarball ships
 * TypeScript source exports (no build step). Optionally installs into a temp dir.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PKG = join(ROOT, "packages/emvb");

async function main() {
  const staging = await mkdtemp(join(tmpdir(), "emvb-pack-"));
  try {
    const pack = Bun.spawn(["bun", "pm", "pack", "--destination", staging], {
      cwd: PKG,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(pack.stdout).text(),
      new Response(pack.stderr).text(),
      pack.exited,
    ]);
    if (code !== 0) {
      process.stderr.write(out + err);
      process.exit(code);
    }
    const match = (out + err).match(/emvb-[\d.]+(?:-[^\s]+)?\.tgz/);
    // bun pm pack prints the filename; also list staging
    const listing = await Array.fromAsync(
      new Bun.Glob("*.tgz").scan({ cwd: staging, absolute: true }),
    );
    const tarball = listing[0];
    if (!tarball) {
      process.stderr.write(`No tarball in ${staging}\n${out}\n${err}\n`);
      process.exit(1);
    }
    // Read package.json from tarball via bun's unzip isn't built-in; use tar
    const tar = Bun.spawn(["tar", "-xOf", tarball, "package/package.json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [pkgJsonText, tarErr, tarCode] = await Promise.all([
      new Response(tar.stdout).text(),
      new Response(tar.stderr).text(),
      tar.exited,
    ]);
    if (tarCode !== 0) {
      process.stderr.write(tarErr);
      process.exit(tarCode);
    }
    const pkg = JSON.parse(pkgJsonText) as {
      name?: string;
      exports?: Record<string, string | { import?: string; default?: string }>;
    };
    if (pkg.name !== "emvb") {
      process.stderr.write(`expected name emvb, got ${pkg.name}\n`);
      process.exit(1);
    }
    const exports = pkg.exports ?? {};
    for (const key of [".", "./astro", "./astro/forms", "./admin", "./core"]) {
      const entry = exports[key];
      const path = typeof entry === "string" ? entry : (entry?.import ?? entry?.default ?? "");
      if (!path || !String(path).includes(".ts")) {
        process.stderr.write(
          `export ${key} must point at TypeScript source, got ${JSON.stringify(entry)}\n`,
        );
        process.exit(1);
      }
    }
    // Confirm packed files include src/astro and src/admin
    const list = Bun.spawn(["tar", "-tzf", tarball], { stdout: "pipe", stderr: "pipe" });
    const [names, , listCode] = await Promise.all([
      new Response(list.stdout).text(),
      new Response(list.stderr).text(),
      list.exited,
    ]);
    if (listCode !== 0) process.exit(listCode);
    for (const need of [
      "package/src/index.ts",
      "package/src/astro/index.ts",
      "package/src/astro/forms/index.ts",
      "package/src/admin/index.tsx",
    ]) {
      if (!names.includes(need)) {
        process.stderr.write(`tarball missing ${need}\n`);
        process.exit(1);
      }
    }
    process.stdout.write(
      `pack-smoke ok: ${tarball.split("/").pop()} exports TS source (${match?.[0] ?? "emvb.tgz"})\n`,
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (import.meta.main) await main();

export { main as packSmoke };
