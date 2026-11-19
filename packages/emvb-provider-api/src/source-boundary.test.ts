import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const sourceFiles = (root: string): string[] =>
  readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  });

describe("provider source boundary", () => {
  test("active EmVB code has no DaisyUI package import or provider-specific runtime flag", () => {
    const root = join(import.meta.dir, "../../emvb/src");
    const files = sourceFiles(root).filter(
      (path) => !path.endsWith("/core/migrate/index.ts") && !path.endsWith("/index.ts"),
    );
    const source = files.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toContain('from "@perkyzz/emvb-daisyui');
    expect(source).not.toContain("needsDaisyRuntime");
    expect(source).not.toContain('provider === "daisyui"');
    expect(source).not.toContain('provider: "daisyui"');
  });

  test("the provider API has no framework or provider implementation import", () => {
    const source = sourceFiles(import.meta.dir)
      .filter((path) => !path.endsWith("/source-boundary.test.ts"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    for (const dependency of ["@perkyzz/emvb-daisyui", "@perkyzz/emvb", "react", "astro"])
      expect(source).not.toContain(`from "${dependency}`);
  });
});
