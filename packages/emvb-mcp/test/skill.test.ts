import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_FILES } from "../src/content.ts";

const DIR = join(import.meta.dirname, "../skill/emvb-page-builder");

/** The Agent Skills rules `skills-ref validate` checks (W-468). */
describe("emvb-page-builder skill (W-468)", () => {
  const text = readFileSync(join(DIR, "SKILL.md"), "utf8");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
  const field = (name: string) => new RegExp(`^${name}: (.+)$`, "m").exec(front)?.[1] ?? "";

  test("frontmatter: name matches the folder; description says what and when, within limits", () => {
    expect(field("name")).toBe("emvb-page-builder");
    expect(field("name")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const description = field("description");
    expect(description.length).toBeGreaterThan(50);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).toContain("Use when");
  });

  test("the body stays short and every reference it names is served", () => {
    expect(text.split("\n").length).toBeLessThan(500);
    for (const ref of text.match(/references\/[\w-]+\.md/g) ?? []) {
      expect(Object.keys(SKILL_FILES)).toContain(ref);
    }
  });

  test("tool names in the skill exist", async () => {
    const { TOOLS } = await import("@perkyzz/emvb/mcp");
    const names = new Set(TOOLS.map((t) => t.name));
    for (const name of text.match(/`([a-z]+(?:_[a-z]+)+)`/g) ?? []) {
      expect(names.has(name.slice(1, -1))).toBe(true);
    }
  });

  test("the skill tells agents about saved sections (W-877)", () => {
    for (const name of [
      "list_saved_sections",
      "insert_saved_section",
      "save_section",
      "delete_saved_section",
    ]) {
      expect(text).toContain(`\`${name}\``);
    }
  });
});

describe("bridge package files (W-471)", () => {
  test("the skill, README and license are shipped", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")) as {
      files: string[];
    };
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "skill", "README.md", "LICENSE"]));
  });
});
