import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { join } from "node:path";
import { bumpText, cutChangelog, PACKAGES, releaseNotes, VERSIONED } from "./release.ts";

// W-1016: the release script bumps every place that names the version, cuts the CHANGELOG and
// prints (never runs) the publish and tag commands.

const ROOT = join(import.meta.dirname, "..");
const read = (file: string) => Bun.file(join(ROOT, file)).text();
const current = (
  (await Bun.file(join(ROOT, "packages/emvb/package.json")).json()) as { version: string }
).version;

describe("W-1016: version bump", () => {
  test("every file the script bumps names the current version", async () => {
    const counts = await Promise.all(
      VERSIONED.map(async ({ file, patterns }) => [
        file,
        bumpText(await read(file), patterns, current, "9.9.9").count,
      ]),
    );
    for (const [file, count] of counts)
      expect({ file, count: Number(count) > 0 }).toEqual({ file, count: true });
  });

  test("no other tracked file quotes the current version", async () => {
    const listed = new Set(VERSIONED.map((v) => v.file));
    const quoted = new RegExp(`\\\\?"${current.replaceAll(".", "\\.")}\\\\?"`);
    const files = (await $`git ls-files`.cwd(ROOT).text())
      .split("\n")
      .filter(
        (f) =>
          f &&
          !listed.has(f) &&
          !/^(docs\/|CHANGELOG\.md$|README\.md$|bun\.lock$|packages\/emvb-icons\/[^/]+\.json$)/.test(
            f,
          ) &&
          /\.(ts|tsx|json|mjs|astro)$/.test(f),
      );
    const texts = await Promise.all(files.map(async (f) => [f, await read(f)] as const));
    expect(texts.filter(([, text]) => quoted.test(text)).map(([f]) => f)).toEqual([]);
  });

  test("a bump replaces versions and cross-dependencies, nothing else", () => {
    const pkg = VERSIONED.find((v) => v.file === "packages/emvb-mcp/package.json");
    const before = `"version": "1.2.3",\n"@perkyzz/emvb": "1.2.3",\n"zod": "1.2.3"`;
    expect(bumpText(before, pkg?.patterns ?? [], "1.2.3", "1.3.0")).toEqual({
      text: `"version": "1.3.0",\n"@perkyzz/emvb": "1.3.0",\n"zod": "1.2.3"`,
      count: 2,
    });
  });

  test("packages publish icons, then emvb, then the MCP bridge", () => {
    expect(PACKAGES.map((p) => p.name)).toEqual([
      "@perkyzz/emvb-icons",
      "@perkyzz/emvb",
      "@perkyzz/emvb-mcp",
    ]);
  });
});

describe("W-1016: CHANGELOG", () => {
  const log = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "",
    "- New thing.",
    "",
    "## [1.0.0] - 2026-01-01",
    "",
    "Old.",
    "",
    "[Unreleased]: https://github.com/PerkyZZ999/EmVB/compare/v1.0.0...HEAD",
    "[1.0.0]: https://github.com/PerkyZZ999/EmVB/compare/v0.9.0...v1.0.0",
    "",
  ].join("\n");

  test("Unreleased moves under a dated heading, with compare links", () => {
    const cut = cutChangelog(log, "1.0.0", "1.1.0", "2026-02-02");
    expect(cut).toContain(
      "## [Unreleased]\n\n## [1.1.0] - 2026-02-02\n\n### Added\n\n- New thing.",
    );
    expect(cut).toContain(
      "[Unreleased]: https://github.com/PerkyZZ999/EmVB/compare/v1.1.0...HEAD\n[1.1.0]: https://github.com/PerkyZZ999/EmVB/compare/v1.0.0...v1.1.0\n",
    );
    expect(() => cutChangelog(cut, "1.0.0", "1.1.0", "2026-02-02")).toThrow();
  });

  test("the release notes are that version's section only", () => {
    const cut = cutChangelog(log, "1.0.0", "1.1.0", "2026-02-02");
    expect(releaseNotes(cut, "1.1.0")).toBe("### Added\n\n- New thing.\n");
    expect(releaseNotes(cut, "1.0.0")).toBe("Old.\n");
  });

  test("the real CHANGELOG has notes for the current version", async () => {
    expect(releaseNotes(await read("CHANGELOG.md"), current).length).toBeGreaterThan(40);
  });
});
