import { PAGES_COLLECTION, PLUGIN_ID } from "../../constants.ts";

export const LAYOUT_WIDGET = `${PLUGIN_ID}:layout`;
const CANVAS_MODES = ["site-layout", "blank"] as const;

/** The `emvb_pages` collection EmVB owns (D-012, D-019). Setup converges the site to exactly this. */
export const COLLECTION_SPEC = {
  slug: PAGES_COLLECTION,
  label: "Visual pages",
  labelSingular: "Visual page",
  hidden: true,
  supports: ["drafts", "revisions", "preview"],
  hasSeo: true,
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
