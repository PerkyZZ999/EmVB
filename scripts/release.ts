/**
 * W-1016: cut a release.
 *
 *   bun scripts/release.ts prepare <version> [--date YYYY-MM-DD]
 *     Bumps the three packages, their exact cross-dependencies, PLUGIN_VERSION, BRIDGE_VERSION,
 *     the smoke test and the seeds that name them, cuts the CHANGELOG's Unreleased section and,
 *     for a minor release, adds its pages to the compatibility corpus (W-1017).
 *     Review the diff, update the README's release line by hand, run the release gate, commit.
 *
 *   bun scripts/release.ts pack <version> [--out <dir>]
 *     Runs pack:smoke, packs the three packages into <dir> (default dist/release-<version>),
 *     writes release-notes.md from the CHANGELOG, and prints checksums, the npm publish lines and
 *     the tag and GitHub release commands. It publishes, tags and pushes nothing.
 */
import { $ } from "bun";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const REPO = "https://github.com/PerkyZZ999/EmVB";

/** Publish order: each package after the ones it depends on. */
export const PACKAGES = [
  { dir: "packages/emvb-icons", name: "@perkyzz/emvb-icons" },
  { dir: "packages/emvb", name: "@perkyzz/emvb" },
  { dir: "packages/emvb-mcp", name: "@perkyzz/emvb-mcp" },
] as const;

/** Files whose text names the current version, and the exact strings that do. */
export const VERSIONED: { file: string; patterns: ((v: string) => string)[] }[] = [
  ...PACKAGES.map((p) => ({
    file: `${p.dir}/package.json`,
    patterns: [
      (v: string) => `"version": "${v}"`,
      ...PACKAGES.map((dep) => (v: string) => `"${dep.name}": "${v}"`),
    ],
  })),
  {
    file: "packages/emvb/src/constants.ts",
    patterns: [(v) => `export const PLUGIN_VERSION = "${v}";`],
  },
  {
    file: "packages/emvb-mcp/src/bridge.ts",
    patterns: [(v) => `export const BRIDGE_VERSION = "${v}";`],
  },
  { file: "e2e/smoke.e2e.ts", patterns: [(v) => `version: "${v}" }`] },
  {
    file: "scripts/seeded-bugs.json",
    patterns: [
      (v) => `PLUGIN_VERSION = \\"${v}\\";`,
      (v) => `BRIDGE_VERSION = \\"${v}\\";`,
      ...PACKAGES.map((dep) => (v: string) => `\\"${dep.name}\\": \\"${v}\\"`),
    ],
  },
];

const SEMVER = /^\d+\.\d+\.\d+$/;

/** Replaces every versioned string in one file; how many it replaced. */
export function bumpText(
  text: string,
  patterns: ((v: string) => string)[],
  from: string,
  to: string,
): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const pattern of patterns) {
    const parts = out.split(pattern(from));
    count += parts.length - 1;
    out = parts.join(pattern(to));
  }
  return { text: out, count };
}

/** Moves the Unreleased entries under a dated heading and adds the compare links. */
export function cutChangelog(text: string, from: string, to: string, date: string): string {
  const heading = "## [Unreleased]\n";
  if (!text.includes(heading)) throw new Error("CHANGELOG has no [Unreleased] section");
  if (text.includes(`## [${to}]`)) throw new Error(`CHANGELOG already has a [${to}] section`);
  const unreleasedLink = `[Unreleased]: ${REPO}/compare/v${from}...HEAD\n`;
  if (!text.includes(unreleasedLink))
    throw new Error(`CHANGELOG's [Unreleased] link isn't from v${from}`);
  return text
    .replace(heading, `${heading}\n## [${to}] - ${date}\n`)
    .replace(
      unreleasedLink,
      `[Unreleased]: ${REPO}/compare/v${to}...HEAD\n[${to}]: ${REPO}/compare/v${from}...v${to}\n`,
    );
}

/** The CHANGELOG section of one version, without its heading: the GitHub release notes. */
export function releaseNotes(changelog: string, version: string): string {
  const start = changelog.indexOf(`## [${version}]`);
  if (start < 0) throw new Error(`CHANGELOG has no [${version}] section`);
  const body = changelog.slice(changelog.indexOf("\n", start) + 1);
  const end = body.search(/^## \[|^\[Unreleased\]:/m);
  return `${(end < 0 ? body : body.slice(0, end)).trim()}\n`;
}

async function currentVersion() {
  const pkg = (await Bun.file(join(ROOT, "packages/emvb/package.json")).json()) as {
    version: string;
  };
  return pkg.version;
}

async function prepare(to: string, date: string) {
  const from = await currentVersion();
  if (Bun.semver.order(to, from) !== 1) throw new Error(`${to} must be newer than ${from}`);
  for (const { file, patterns } of VERSIONED) {
    const path = join(ROOT, file);
    const { text, count } = bumpText(await Bun.file(path).text(), patterns, from, to);
    if (count === 0) throw new Error(`${file} names no ${from}; is the release script current?`);
    await Bun.write(path, text);
  }
  const changelog = join(ROOT, "CHANGELOG.md");
  await Bun.write(changelog, cutChangelog(await Bun.file(changelog).text(), from, to, date));
  await $`bun install`.cwd(ROOT).quiet();
  // W-1017: a minor release adds its playground pages to the compatibility corpus.
  if (to.endsWith(".0")) await $`bun ${join(ROOT, "scripts/compat-snapshot.ts")} ${to}`.cwd(ROOT);
  return [
    `Prepared ${from} → ${to} (${date}).`,
    "Next: write the [" + to + "] summary line in CHANGELOG.md, update the README's release line,",
    "run the release gate, commit, then: bun scripts/release.ts pack " + to,
  ].join("\n");
}

async function pack(version: string, out: string) {
  if ((await currentVersion()) !== version)
    throw new Error(`packages are at ${await currentVersion()}, not ${version}; run prepare first`);
  await $`bun run pack:smoke`.cwd(ROOT);
  await mkdir(out, { recursive: true });
  const lines = [`Tarballs in ${out}:`];
  const publish: string[] = [];
  for (const p of PACKAGES) {
    await $`bun pm pack --destination ${out} --quiet`.cwd(join(ROOT, p.dir)).quiet();
    const file = `${p.name.replace("@", "").replace("/", "-")}-${version}.tgz`;
    const bytes = new Uint8Array(await Bun.file(join(out, file)).arrayBuffer());
    const sha1 = createHash("sha1").update(bytes).digest("hex");
    const sha512 = createHash("sha512").update(bytes).digest("base64");
    lines.push(`  ${file}  sha1 ${sha1}  integrity sha512-${sha512}`);
    publish.push(`npm publish ${join(out, file)} --access public`);
  }
  const notes = join(out, "release-notes.md");
  await Bun.write(notes, releaseNotes(await Bun.file(join(ROOT, "CHANGELOG.md")).text(), version));
  return [
    ...lines,
    "",
    "Publish (in this order):",
    ...publish.map((l) => `  ${l}`),
    "",
    "Tag and release:",
    `  git tag -a v${version} -m "EmVB ${version}"`,
    `  gh release create v${version} --repo PerkyZZ999/EmVB --title "EmVB ${version}" --notes-file ${notes}`,
  ].join("\n");
}

function option(name: string) {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

if (import.meta.main) {
  const [command, version] = process.argv.slice(2);
  if (!(command === "prepare" || command === "pack") || !version || !SEMVER.test(version)) {
    throw new Error("usage: bun scripts/release.ts prepare|pack <x.y.z> [--date d] [--out dir]");
  }
  const message =
    command === "prepare"
      ? await prepare(version, option("--date") ?? new Date().toISOString().slice(0, 10))
      : await pack(version, option("--out") ?? join(ROOT, "dist", `release-${version}`));
  // oxlint-disable-next-line no-console -- a CLI
  console.log(message);
}
