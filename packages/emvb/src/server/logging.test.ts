import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname);

describe("server log shape (W-045 / N-008)", () => {
  test("hooks and design routes log codes and page ids, never layout or secrets", () => {
    const hooks = readFileSync(join(root, "hooks.ts"), "utf8");
    const design = readFileSync(join(root, "design-routes.ts"), "utf8");
    expect(hooks).toContain('ctx.log.warn("emvb: page save rejected"');
    expect(hooks).toContain("pageId");
    expect(hooks).toContain("code:");
    expect(hooks).not.toMatch(/ctx\.log\.[a-z]+\([^)]*layout/);
    expect(hooks).not.toMatch(/password|secret|token|formData/i);
    expect(design).toContain('ctx.log.error("emvb: stored design is unreadable"');
    expect(design).toContain("code:");
    expect(design).not.toMatch(/password|secret|formData/i);
  });
});
