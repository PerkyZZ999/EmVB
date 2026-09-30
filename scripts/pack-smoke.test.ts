import { describe, expect, test } from "bun:test";
import { packProblems, packSmoke } from "./pack-smoke.ts";

describe("pack smoke (W-044, R-052)", () => {
  test("packed emvb tarball exports TypeScript source entrypoints", async () => {
    await packSmoke();
    expect(true).toBe(true);
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
    expect(packProblems({ name: "emvb", exports: ts }, files)).toEqual([]);
  });

  test("a wrong name, a built export, a missing export and a missing file are each reported", () => {
    const { "./core": _core, ...rest } = ts;
    const problems = packProblems(
      { name: "other", exports: { ...rest, "./admin": "./dist/admin/index.js" } },
      files.replace("package/src/astro/index.ts", ""),
    );
    expect(problems).toEqual([
      "expected name emvb, got other",
      'export ./admin must point at TypeScript source, got "./dist/admin/index.js"',
      "export ./core must point at TypeScript source, got undefined",
      "tarball missing package/src/astro/index.ts",
    ]);
  });
});
