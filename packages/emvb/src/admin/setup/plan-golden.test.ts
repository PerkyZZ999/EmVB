import { expect, test } from "bun:test";
import { planSetup, type CollectionSpec, type CollectionState, type FieldState } from "./plan.ts";
import {
  COLLECTION_SPEC,
  FIELD_SPECS,
  THEME_PARTS_COLLECTION_SPEC,
  THEME_PARTS_FIELD_SPECS,
  type FieldSpec,
} from "./spec.ts";

const upToDate = (spec: CollectionSpec, fields: readonly FieldSpec[]): CollectionState => ({
  slug: spec.slug,
  hidden: spec.hidden,
  supports: [...spec.supports],
  hasSeo: spec.hasSeo,
  urlPattern: spec.urlPattern ?? null,
  fields: fields.map((f) => ({
    slug: f.slug,
    type: f.type,
    widget: f.widget ?? null,
    required: Boolean(f.required),
    validation: f.validation ?? null,
  })),
});

const collectionVariants: [string, (c: CollectionState) => CollectionState][] = [
  ["as spec", (c) => c],
  ["shown", (c) => ({ ...c, hidden: false })],
  ["hidden unset", ({ hidden: _h, ...c }) => c],
  ["supports missing one", (c) => ({ ...c, supports: c.supports?.slice(1) })],
  ["supports extra", (c) => ({ ...c, supports: [...(c.supports ?? []), "extra"] })],
  ["supports unset", ({ supports: _s, ...c }) => c],
  ["seo flipped", (c) => ({ ...c, hasSeo: !c.hasSeo })],
  ["url pattern unset", (c) => ({ ...c, urlPattern: null })],
  ["url pattern custom", (c) => ({ ...c, urlPattern: "/custom/{slug}" })],
];

const fieldVariants: [string, (f: FieldState) => FieldState | null][] = [
  ["missing", () => null],
  ["other type", (f) => ({ ...f, type: f.type === "json" ? "string" : "json" })],
  ["other widget", (f) => ({ ...f, widget: "other:widget" })],
  ["required flipped", (f) => ({ ...f, required: !f.required })],
  ["options changed", (f) => ({ ...f, validation: { options: ["zzz"] } })],
  [
    "options reordered",
    (f) => ({
      ...f,
      validation: f.validation?.options
        ? { options: f.validation.options.toReversed() }
        : f.validation,
    }),
  ],
  ["default changed", (f) => ({ ...f, defaultValue: "changed" })],
];

test("planSetup over collection and field variants matches the snapshot (W-086 L10)", () => {
  const pages = upToDate(COLLECTION_SPEC, FIELD_SPECS);
  const parts = upToDate(THEME_PARTS_COLLECTION_SPEC, THEME_PARTS_FIELD_SPECS);
  const rows: Record<string, unknown> = {
    "both missing": planSetup(null, null),
    "pages only": planSetup(pages, null),
    "parts only": planSetup(null, parts),
  };
  for (const [name, vary] of collectionVariants) {
    rows[`pages ${name}`] = planSetup(vary(pages), parts);
    rows[`parts ${name}`] = planSetup(pages, vary(parts));
  }
  for (const [which, base] of [
    ["pages", pages],
    ["parts", parts],
  ] as const) {
    for (const [i, field] of base.fields.entries()) {
      for (const [name, vary] of fieldVariants) {
        const next = vary(field);
        const fields = base.fields.flatMap((f, j) => (j === i ? (next ? [next] : []) : [f]));
        const changed = { ...base, fields };
        rows[`${which} ${field.slug} ${name}`] =
          which === "pages" ? planSetup(changed, parts) : planSetup(pages, changed);
      }
    }
  }
  expect(rows).toMatchSnapshot();
});
