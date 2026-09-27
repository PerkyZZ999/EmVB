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
  | { kind: "update-field"; collection: string; slug: string; body: Omit<FieldSpec, "slug" | "type"> };

const sameSet = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((x) => b.includes(x));

function fieldMatches(state: FieldState, spec: FieldSpec): boolean {
  return (
    (state.widget ?? undefined) === spec.widget &&
    Boolean(state.required) === Boolean(spec.required) &&
    sameSet(state.validation?.options, spec.validation?.options)
  );
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
        ...fieldSpecs.map(
          (body): SetupStep => ({ kind: "create-field", collection, body }),
        ),
      ],
      conflicts: [],
    };
  }
  const steps: SetupStep[] = [];
  const conflicts: string[] = [];
  const update: Extract<SetupStep, { kind: "update-collection" }>["body"] = {};
  if (current.hidden !== true) update.hidden = true;
  if (!collectionSpec.supports.every((s) => current.supports?.includes(s))) {
    update.supports = [...collectionSpec.supports];
  }
  if (current.hasSeo !== collectionSpec.hasSeo) update.hasSeo = collectionSpec.hasSeo;
  if (collectionSpec.urlPattern && !current.urlPattern) {
    update.urlPattern = collectionSpec.urlPattern;
  }
  if (Object.keys(update).length > 0) {
    steps.push({ kind: "update-collection", collection, body: update });
  }
  for (const spec of fieldSpecs) {
    const state = current.fields.find((f) => f.slug === spec.slug);
    if (!state) {
      steps.push({ kind: "create-field", collection, body: spec });
    } else if (state.type !== spec.type) {
      conflicts.push(
        `Field "${spec.slug}" on ${collection} is ${state.type}; EmVB needs ${spec.type}.`,
      );
    } else if (!fieldMatches(state, spec)) {
      const { slug: _slug, type: _type, ...body } = spec;
      steps.push({ kind: "update-field", collection, slug: spec.slug, body });
    }
  }
  return { steps, conflicts };
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
