import {
  COLLECTION_SPEC,
  FIELD_SPECS,
  THEME_PARTS_COLLECTION_SPEC,
  THEME_PARTS_FIELD_SPECS,
  type FieldSpec,
} from "./spec.ts";

export type FieldState = {
  slug: string;
  type: string;
  widget?: string | null;
  required?: boolean;
  validation?: { options?: string[] } | null;
  defaultValue?: unknown;
};

export type CollectionState = {
  slug: string;
  hidden?: boolean;
  supports?: string[];
  hasSeo?: boolean;
  urlPattern?: string | null;
  fields: FieldState[];
};

export type CollectionSpec = {
  slug: string;
  label: string;
  labelSingular: string;
  hidden: boolean;
  supports: readonly string[];
  hasSeo: boolean;
  urlPattern?: string;
};

export type SetupStep =
  | { kind: "create-collection"; collection: string; body: CollectionSpec }
  | {
      kind: "update-collection";
      collection: string;
      body: { hidden?: boolean; supports?: string[]; hasSeo?: boolean; urlPattern?: string };
    }
  | { kind: "create-field"; collection: string; body: FieldSpec }
  | {
      kind: "update-field";
      collection: string;
      slug: string;
      body: Omit<FieldSpec, "slug" | "type">;
    };

const sameSet = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((x) => b.includes(x));

function fieldMatches(state: FieldState, spec: FieldSpec): boolean {
  return (
    (state.widget ?? undefined) === spec.widget &&
    Boolean(state.required) === Boolean(spec.required) &&
    sameSet(state.validation?.options, spec.validation?.options)
  );
}

type CollectionUpdate = Extract<SetupStep, { kind: "update-collection" }>["body"];

/** Collection settings EmVB needs that the current collection lacks; empty when none. */
function collectionUpdate(current: CollectionState, spec: CollectionSpec): CollectionUpdate {
  const update: CollectionUpdate = {};
  if (current.hidden !== true) update.hidden = true;
  if (!spec.supports.every((s) => current.supports?.includes(s))) {
    update.supports = [...spec.supports];
  }
  if (current.hasSeo !== spec.hasSeo) update.hasSeo = spec.hasSeo;
  if (spec.urlPattern && !current.urlPattern) update.urlPattern = spec.urlPattern;
  return update;
}

/** The step (or type conflict) that brings one field to its spec; nothing when it matches. */
function fieldPlan(
  collection: string,
  state: FieldState | undefined,
  spec: FieldSpec,
): { step?: SetupStep; conflict?: string } {
  if (!state) return { step: { kind: "create-field", collection, body: spec } };
  if (state.type !== spec.type) {
    return {
      conflict: `Field "${spec.slug}" on ${collection} is ${state.type}; EmVB needs ${spec.type}.`,
    };
  }
  if (fieldMatches(state, spec)) return {};
  const { slug: _slug, type: _type, ...body } = spec;
  return { step: { kind: "update-field", collection, slug: spec.slug, body } };
}

/**
 * Pure planner for one collection: steps that bring the current state to the spec.
 * An empty plan means up to date. A field whose type differs is a conflict (data safety).
 */
function planCollectionSetup(
  current: CollectionState | null,
  collectionSpec: CollectionSpec,
  fieldSpecs: readonly FieldSpec[],
): { steps: SetupStep[]; conflicts: string[] } {
  const collection = collectionSpec.slug;
  if (!current) {
    return {
      steps: [
        { kind: "create-collection", collection, body: collectionSpec },
        ...fieldSpecs.map((body): SetupStep => ({ kind: "create-field", collection, body })),
      ],
      conflicts: [],
    };
  }
  const update = collectionUpdate(current, collectionSpec);
  const fields = fieldSpecs.map((spec) =>
    fieldPlan(
      collection,
      current.fields.find((f) => f.slug === spec.slug),
      spec,
    ),
  );
  return {
    steps: [
      ...(Object.keys(update).length > 0
        ? [{ kind: "update-collection", collection, body: update } as const]
        : []),
      ...fields.flatMap((f) => (f.step ? [f.step] : [])),
    ],
    conflicts: fields.flatMap((f) => (f.conflict ? [f.conflict] : [])),
  };
}

/**
 * Pure planner for "Set up / Upgrade EmVB": pages + theme parts collections.
 * Running setup twice is a no-op when both are up to date (idempotent).
 */
export function planSetup(
  pages: CollectionState | null,
  themeParts: CollectionState | null = null,
): { steps: SetupStep[]; conflicts: string[] } {
  const pagesPlan = planCollectionSetup(pages, COLLECTION_SPEC, FIELD_SPECS);
  const themePlan = planCollectionSetup(
    themeParts,
    THEME_PARTS_COLLECTION_SPEC,
    THEME_PARTS_FIELD_SPECS,
  );
  return {
    steps: [...pagesPlan.steps, ...themePlan.steps],
    conflicts: [...pagesPlan.conflicts, ...themePlan.conflicts],
  };
}
