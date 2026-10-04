import { describe, expect, test } from "bun:test";
import { packProblems, packSmoke } from "./pack-smoke.ts";

describe("pack smoke (W-044, R-052)", () => {
  test("packed emvb tarball exports TypeScript source entrypoints", async () => {
    expect(await packSmoke()).toEqual([]);
  }, 120_000);

  const ts = {
    ".": "./src/index.ts",
    "./astro": { import: "./src/astro/index.ts" },
    "./astro/forms": { default: "./src/astro/forms/index.ts" },
    "./admin": "./src/admin/index.tsx",
    "./core": "./src/core/index.ts",
  };
  const files = [
    "package/src/index.ts",
    "package/src/astro/index.ts",
    "package/src/astro/forms/index.ts",
    "package/src/admin/index.tsx",
  ].join("\n");

  test("a package with TS exports and every entry file has no problems", () => {
    expect(packProblems({ name: "@perkyzz/emvb", exports: ts }, files)).toEqual([]);
  });

  test("a test file or a snapshot in the tarball is reported", () => {
    const shipped = `${files}\npackage/src/core/a.test.ts\npackage/src/admin/__snapshots__/b.test.tsx.snap`;
    expect(packProblems({ name: "@perkyzz/emvb", exports: ts }, shipped)).toEqual([
      "tarball ships package/src/core/a.test.ts",
      "tarball ships package/src/admin/__snapshots__/b.test.tsx.snap",
    ]);
  });

  test("a wrong name, a built export, a missing export and a missing file are each reported", () => {
    const { "./core": _core, ...rest } = ts;
    const problems = packProblems(
      { name: "other", exports: { ...rest, "./admin": "./dist/admin/index.js" } },
      files.replace("package/src/astro/index.ts", ""),
    );
    expect(problems).toEqual([
      "expected name @perkyzz/emvb, got other",
      'export ./admin must point at TypeScript source, got "./dist/admin/index.js"',
      "export ./core must point at TypeScript source, got undefined",
      "tarball missing package/src/astro/index.ts",
    ]);
  });

  test("a private flag, or a workspace: or catalog: range npm would install, is reported", () => {
    const problems = packProblems(
      {
        name: "@perkyzz/emvb",
        private: true,
        exports: ts,
        dependencies: { zod: "catalog:" },
        peerDependencies: { emdash: "workspace:*" },
        optionalDependencies: { left: "^1.0.0" },
      },
      files,
    );
    expect(problems).toEqual([
      "the package is marked private",
      "dependencies.zod uses catalog:",
      "peerDependencies.emdash uses workspace:*",
    ]);
  });
});
