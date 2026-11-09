export { designJsonSchema, layoutJsonSchema } from "../core/json-schema.ts";

export type PromptDef = {
  name: string;
  title: string;
  description: string;
  args: Record<string, { description: string; required: boolean }>;
  text(args: Record<string, string | undefined>): string;
};

const list = (value: string | undefined) =>
  value ? ` Sections to include: ${JSON.stringify(value)}.` : "";

/** Arguments are the person's data: quoted as JSON strings, never spliced in as instructions. */
const q = (value: string | undefined) => JSON.stringify(value ?? "");

/** Workflow prompts (plan § 3 Prompts). They only describe steps; the tools do the work. */
export const PROMPTS: PromptDef[] = [
  {
    name: "build_landing_page",
    title: "Build a landing page",
    description:
      "Plan and build a new draft landing page from a topic, ready for a person to review.",
    args: {
      topic: { description: "What the page is about", required: true },
      audience: { description: "Who it is for", required: false },
      sections: { description: "Sections to include, comma-separated", required: false },
    },
    text: (a) =>
      `Build a draft EmVB landing page about ${q(a["topic"])}${a["audience"] ? ` for ${q(a["audience"])}` : ""}.${list(a["sections"])}
1. Call get_site_styles and list_section_recipes. If the site has no Brand, Ink, Muted and Surface colours or fs-*/space-* sizes, propose them first (see the skill's design reference); recipes and your styles use them.
2. Call create_page with a clear title and the recipes that fit, hero first: the hero heading becomes the page's h1.
3. Replace placeholder copy with update_element, passing the rev each write returns as the next expectedRev. Real copy, real links, alt text that describes each image.
4. Call get_accessibility_findings and fix every error.
5. Do not publish. Finish with describe_page and a short summary for the person to review.`,
  },
  {
    name: "fix_accessibility",
    title: "Fix accessibility findings",
    description: "Fix the accessibility findings on one page, then re-check.",
    args: { pageId: { description: "The page id (from list_pages)", required: true } },
    text: (a) =>
      `Fix the accessibility findings on page ${q(a["pageId"])}.
1. Call get_layout (format "outline") for the rev, then get_accessibility_findings.
2. For each finding, apply its fix with update_element on its nodeId: fix.kind "heading-level" → set.props.level; "text-color" → set.style.color; "decorative" → set.props.decorative true, but only when the image adds nothing; otherwise set.props.alt to words that describe it; "drop-aria-hidden" → set.attributes to its list without the aria-hidden entry. A finding without a fix: follow its message.
3. Pass the rev from your last read as expectedRev on the first write, then the rev each write returns on the next one.
4. When several contrast findings share one site colour, darken or lighten that colour variable once with update_site_styles instead of overriding each element; keep the design's palette. Keep sibling headings at the same level.
5. Call get_accessibility_findings again and report what is left. Do not publish.`,
  },
  {
    name: "restyle_site",
    title: "Restyle the site",
    description: "Propose and apply site style changes to the style draft only.",
    args: { brief: { description: "The look you want", required: true } },
    text: (a) =>
      `Restyle the site to match: ${q(a["brief"])}. Call get_site_styles, propose variable and class changes, then apply them with update_site_styles (draft only). Keep the variable names recipes look for (Brand, Ink, Muted, Surface, On brand; fs-* and space-* ids; Button and Card classes). Check text colours against their backgrounds for 4.5:1 contrast. Never remove a variable that is in use. Do not publish; a person reviews the style draft.`,
  },
  {
    name: "review_page",
    title: "Review a page",
    description: "Write a review of one page without changing it.",
    args: { pageId: { description: "The page id (from list_pages)", required: true } },
    text: (a) =>
      `Review page ${q(a["pageId"])} without editing it: call describe_page (sections, heading outline, images with their alt text) and get_accessibility_findings, and get_layout when you need styles or ids. Then write a short review covering structure, copy, images and alt text, accessibility, and consistency with the site styles, with the element ids for each suggestion.`,
  },
];
