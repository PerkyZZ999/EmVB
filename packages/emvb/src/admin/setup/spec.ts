import { PAGES_COLLECTION, PLUGIN_ID, THEME_PARTS_COLLECTION } from "../../constants.ts";
import { THEME_PART_TYPES } from "../../core/index.ts";

export const LAYOUT_WIDGET = `${PLUGIN_ID}:layout`;
const CANVAS_MODES = ["site-layout", "blank"] as const;
const PART_TYPES = THEME_PART_TYPES;

/** The `emvb_pages` collection EmVB owns (D-012, D-019). Setup converges the site to exactly this. */
export const COLLECTION_SPEC = {
  slug: PAGES_COLLECTION,
  label: "Visual pages",
  labelSingular: "Visual page",
  hidden: true,
  supports: ["drafts", "revisions", "preview"],
  hasSeo: true,
  /** Where published pages live. Set on creation only, so a host's own pattern is kept on upgrade. */
  urlPattern: "/{slug}",
} as const;

/**
 * Theme parts (headers/footers + content templates + popups). Hidden, no SEO, no public
 * urlPattern so they never become pages (D-TB-03).
 */
export const THEME_PARTS_COLLECTION_SPEC = {
  slug: THEME_PARTS_COLLECTION,
  label: "Theme parts",
  labelSingular: "Theme part",
  hidden: true,
  supports: ["drafts", "revisions", "preview"],
  hasSeo: false,
} as const;

export type FieldSpec = {
  slug: string;
  label: string;
  type: "string" | "json" | "select";
  required?: boolean;
  widget?: string;
  validation: { options?: string[] } | null;
  defaultValue?: unknown;
};

export const FIELD_SPECS: readonly FieldSpec[] = [
  { slug: "title", label: "Title", type: "string", required: true, validation: null },
  { slug: "layout", label: "Layout", type: "json", widget: LAYOUT_WIDGET, validation: null },
  {
    slug: "canvas_mode",
    label: "Canvas mode",
    type: "select",
    validation: { options: [...CANVAS_MODES] },
    defaultValue: "site-layout",
  },
];

/** Default conditions: Include → Entire Site (Elementor-like). */
const DEFAULT_THEME_CONDITIONS = {
  schemaVersion: 1,
  rules: [
    {
      id: "default-entire-site",
      op: "include",
      group: "general",
      name: "entire_site",
      args: {},
    },
  ],
} as const;

/** Default popup triggers: open on page load (Elementor-like). */
const DEFAULT_THEME_TRIGGERS = {
  schemaVersion: 1,
  open: [{ type: "page_load" }],
  advanced: {},
} as const;

export const THEME_PARTS_FIELD_SPECS: readonly FieldSpec[] = [
  { slug: "title", label: "Title", type: "string", required: true, validation: null },
  { slug: "layout", label: "Layout", type: "json", widget: LAYOUT_WIDGET, validation: null },
  {
    slug: "part_type",
    label: "Part type",
    type: "select",
    required: true,
    validation: { options: [...PART_TYPES] },
  },
  {
    slug: "conditions",
    label: "Conditions",
    type: "json",
    validation: null,
    defaultValue: DEFAULT_THEME_CONDITIONS,
  },
  {
    slug: "triggers",
    label: "Triggers",
    type: "json",
    validation: null,
    defaultValue: DEFAULT_THEME_TRIGGERS,
  },
];
