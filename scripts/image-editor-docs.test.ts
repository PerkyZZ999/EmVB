import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  IMAGE_EDITOR_GZIP_BUDGET,
  IMAGE_EDITOR_WORKER_GZIP_BUDGET,
} from "./image-editor-budget.ts";
import {
  DEFAULT_MAX_SIDE,
  EXPORT_FORMATS,
  PHOTOCN_VERSION,
} from "../packages/emvb/src/admin/image-editor/save.ts";
import { COMING_SOON, IMAGE_EDITOR_TOOLS } from "../packages/emvb/src/admin/image-editor/tools.ts";
import { COMPACT_WIDTH } from "../packages/emvb/src/admin/image-editor/ImageEditorDialog.tsx";

const guide = readFileSync(new URL("../docs/guides/image-editor.md", import.meta.url), "utf8");
const notices = readFileSync(
  new URL("../packages/emvb/THIRD_PARTY_NOTICES.md", import.meta.url),
  "utf8",
);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

describe("image editor docs match the code (W-488)", () => {
  test("the guide names the live tools, the one coming-soon tool, and the defaults", () => {
    for (const tool of IMAGE_EDITOR_TOOLS) {
      if (tool.id in COMING_SOON) expect(guide).toContain("Coming in a later update");
      else expect(guide).toMatch(new RegExp(`\\| ${tool.label} \\|`));
    }
    expect(Object.keys(COMING_SOON)).toEqual(["blender"]);
    expect(guide).toContain("2560");
    expect(DEFAULT_MAX_SIDE).toBe(2560);
    expect(guide).toContain("85 %");
    expect(EXPORT_FORMATS.find((f) => f.value === "webp")?.defaultQuality).toBe(0.85);
    expect(guide).toContain("350 KB");
    expect(IMAGE_EDITOR_GZIP_BUDGET).toBe(350 * 1024);
    expect(guide).toContain("32 KB");
    expect(IMAGE_EDITOR_WORKER_GZIP_BUDGET).toBe(32 * 1024);
    expect(guide).toContain("640 px");
    expect(COMPACT_WIDTH).toBe(640);
    expect(guide).toContain(PHOTOCN_VERSION);
  });

  test("THIRD_PARTY_NOTICES lists photocn and every project the plan asked for", () => {
    for (const name of ["photocn", "mini-photo-editor", "glfx.js", "exif-js", "fflate"]) {
      // Its own heading or bullet, not just a passing mention.
      const escaped = name.replace(".", "\\.");
      expect(notices).toMatch(new RegExp(`^(#{2,3} ${escaped}$|- \\*\\*${escaped}\\*\\*)`, "m"));
      expect(
        readFileSync(new URL(`../packages/emvb/licenses/${name}.LICENSE`, import.meta.url), "utf8")
          .length,
      ).toBeGreaterThan(40);
    }
  });

  test("the README features the image editor and links the guide", () => {
    expect(readme).toMatch(/image editor/i);
    expect(readme).toContain("docs/guides/image-editor.md");
    expect(readme).toContain("Layout schema 17");
  });
});
