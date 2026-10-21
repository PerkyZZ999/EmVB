import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLED_ICON_IDS, siteTokens, validateDesign } from "@perkyzz/emvb/core";
import { TOOLS } from "@perkyzz/emvb/mcp";
import { SKILL_FILES } from "../src/content.ts";

/**
 * W-470 evals that run without a model: trigger checks against the skill's description and task
 * checks that what the skill tells an agent to send is accepted by the tools and the recipes.
 * The live, model-driven runs are in the 0.5.0 dogfood report.
 */
const skill = SKILL_FILES["SKILL.md"] ?? "";
const description = /^description: (.+)$/m.exec(skill)?.[1]?.toLowerCase() ?? "";
const triggers = JSON.parse(
  readFileSync(join(import.meta.dirname, "../evals/triggers.json"), "utf8"),
) as {
  shouldTrigger: string[];
  shouldNotTrigger: string[];
};
const STOP = new Set([
  "the",
  "and",
  "with",
  "for",
  "our",
  "that",
  "this",
  "page",
  "pages",
  "make",
  "add",
  "to",
  "a",
  "of",
  "on",
  "my",
  "me",
  "what",
  "tell",
  "in",
]);
const words = (s: string) =>
  s
    .toLowerCase()
    .match(/[a-z]+/g)
    ?.filter((w) => w.length > 3 && !STOP.has(w)) ?? [];
const overlap = (query: string) =>
  words(query).filter((w) => description.includes(w.replace(/s$/, ""))).length;

describe("skill trigger evals (W-470)", () => {
  test.each(triggers.shouldTrigger)("triggers: %s", (query) => {
    expect(
      overlap(query) + (/emvb|emdash|page|site|style/i.test(query) ? 1 : 0),
    ).toBeGreaterThanOrEqual(2);
  });
  test.each(triggers.shouldNotTrigger)("stays quiet: %s", (query) => {
    expect(overlap(query)).toBeLessThanOrEqual(1);
  });
});

const tool = (name: string) => {
  const def = TOOLS.find((t) => t.name === name);
  if (!def) throw new Error(`no tool ${name}`);
  return def;
};

describe("skill task evals (W-470)", () => {
  test("a site set up with the design reference's names gives recipes real variables", () => {
    const len = (value: number) => ({ value, unit: "px" as const });
    const design = validateDesign({
      schemaVersion: 15,
      variables: {
        colors: [
          { id: "brand", name: "Brand", value: "#4f46e5" },
          { id: "ink", name: "Ink", value: "#0f172a" },
          { id: "muted", name: "Muted text", value: "#475569" },
          { id: "surface", name: "Surface", value: "#faf8f5" },
          { id: "on-brand", name: "On brand", value: "#ffffff" },
        ],
        fonts: [{ id: "display", name: "Display", value: "Georgia, serif" }],
        fontSizes: ["fs-4xl", "fs-3xl", "fs-2xl", "fs-xl", "fs-l", "fs-m", "fs-s"].map((id, i) => ({
          id,
          name: id,
          value: len(64 - i * 7),
        })),
        spacings: ["space-xs", "space-s", "space-m", "space-l", "space-2xl", "space-3xl"].map(
          (id, i) => ({ id, name: id, value: len(8 * (i + 1)) }),
        ),
      },
      classes: [
        { id: "btn", name: "Button", style: {} },
        { id: "card", name: "Card", style: {} },
      ],
    });
    if (!design.ok) throw new Error(JSON.stringify(design.issues));
    const tokens = siteTokens(design.design);
    for (const key of [
      "display",
      "heading",
      "body",
      "sectionSpace",
      "gap",
      "accent",
      "ink",
      "muted",
      "surface",
      "onAccent",
    ] as const) {
      expect(tokens[key]).toHaveProperty("var");
    }
    expect(tokens.buttonClass).toBe("btn");
    expect(tokens.cardClass).toBe("card");
    const design_md = SKILL_FILES["references/design.md"] ?? "";
    for (const id of [
      "brand",
      "ink",
      "muted",
      "surface",
      "on-brand",
      "fs-4xl",
      "fs-2xl",
      "space-3xl",
      "btn",
      "card",
    ]) {
      expect(design_md).toContain(`\`${id}\``);
    }
  });

  test("the calls the workflow describes pass the tools' input schemas", () => {
    const ok = (name: string, input: unknown) =>
      expect(tool(name).input.safeParse(input).success).toBe(true);
    ok("create_page", { title: "Spring sale", recipes: ["hero", "features", "cta"] });
    ok("get_layout", { pageId: "p1", format: "outline" });
    // W-877: saved sections, as the skill's step 5 describes.
    ok("list_saved_sections", {});
    ok("insert_saved_section", { pageId: "p1", sectionId: "0123456789abcdef" });
    ok("save_section", { pageId: "p1", elementId: "n1", name: "Hero" });
    ok("update_element", {
      pageId: "p1",
      nodeId: "n1",
      set: { props: { text: "Hi" } },
      expectedRev: "r",
    });
    ok("add_element", {
      pageId: "p1",
      parentId: "root",
      element: {
        type: "layout-section",
        props: { contentWidth: { value: 1200, unit: "px" } },
        children: [{ type: "heading", props: { text: "Hi", level: 2 } }],
      },
    });
    ok("update_site_styles", {
      variables: { fonts: [{ id: "display", name: "Display", value: "Georgia, serif" }] },
    });
  });

  test("every reference variable shape the skill shows is a valid style value", () => {
    for (const ref of skill.match(/\{ "var": "[a-z0-9-]+"(, "from": "[a-zA-Z]+")? \}/g) ?? []) {
      const parsed = JSON.parse(ref) as { from?: string };
      expect([undefined, "font", "fontSize", "spacing", "color"]).toContain(parsed.from);
    }
  });

  test("the icon ids the tools advertise are the bundled ones", async () => {
    const out = (await tool("list_element_types").run({} as never, { type: "icon" } as never)) as {
      elements: { notes?: string }[];
    };
    const notes = out.elements[0]?.notes ?? "";
    for (const id of BUNDLED_ICON_IDS) expect(notes).toContain(id);
  });

  test("the skill names its limits: popups, forms, loops", () => {
    expect(skill).toMatch(/Popups/);
    expect(skill).toMatch(/formId/);
    expect(skill).toMatch(/collection slug/);
    expect(skill).toMatch(/NOT_SET_UP/);
  });
});
