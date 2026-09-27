import { COLLECTION_SPEC, FIELD_SPECS, type FieldSpec } from "./spec.ts";

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
  fields: FieldState[];
};

export type SetupStep =
  | { kind: "create-collection"; body: typeof COLLECTION_SPEC }
  | { kind: "update-collection"; body: { hidden?: boolean; supports?: string[]; hasSeo?: boolean } }
  | { kind: "create-field"; body: FieldSpec }
  | { kind: "update-field"; slug: string; body: Omit<FieldSpec, "slug" | "type"> };

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
 * Pure planner for "Set up / Upgrade EmVB": the steps that bring the current collection to the spec.
 * An empty plan means the site is up to date, so running setup twice is a no-op (idempotent).
 * A field whose type differs is reported as a conflict instead of being changed (data safety).
 */
export function planSetup(current: CollectionState | null): {
  steps: SetupStep[];
  conflicts: string[];
} {
  if (!current) {
    return {
      steps: [
        { kind: "create-collection", body: COLLECTION_SPEC },
        ...FIELD_SPECS.map((body): SetupStep => ({ kind: "create-field", body })),
      ],
      conflicts: [],
    };
  }
  const steps: SetupStep[] = [];
  const conflicts: string[] = [];
  const update: Extract<SetupStep, { kind: "update-collection" }>["body"] = {};
  if (current.hidden !== true) update.hidden = true;
  if (!COLLECTION_SPEC.supports.every((s) => current.supports?.includes(s))) {
    update.supports = [...COLLECTION_SPEC.supports];
  }
  if (current.hasSeo !== true) update.hasSeo = true;
  if (Object.keys(update).length > 0) steps.push({ kind: "update-collection", body: update });
  for (const spec of FIELD_SPECS) {
    const state = current.fields.find((f) => f.slug === spec.slug);
    if (!state) {
      steps.push({ kind: "create-field", body: spec });
    } else if (state.type !== spec.type) {
      conflicts.push(`Field "${spec.slug}" is ${state.type}; EmVB needs ${spec.type}.`);
    } else if (!fieldMatches(state, spec)) {
      const { slug: _slug, type: _type, ...body } = spec;
      steps.push({ kind: "update-field", slug: spec.slug, body });
    }
  }
  return { steps, conflicts };
}
