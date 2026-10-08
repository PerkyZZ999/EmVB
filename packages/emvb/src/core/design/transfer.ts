import { DesignSystem as DesignSystemSchema, DESIGN_SCHEMA_VERSION } from "../schema/design.ts";
import type { DesignSystem } from "../schema/design.ts";
import { DESIGN_MIGRATIONS, upgradeLayout } from "../migrate/index.ts";
import type { Layout } from "../schema/layout.ts";
import { findClassUsages } from "./classes.ts";
import { findVariableUsages } from "./variables.ts";

/** The design document as JSON. This file is the backup: there is no revision history. */
export function designToJson(design: DesignSystem): string {
  return JSON.stringify(design, null, 2);
}

/** A name Import changed so names stay unique (W-283). */
export type ImportRename = { from: string; to: string };

export type DesignImport =
  | { ok: true; design: DesignSystem; renamed: ImportRename[] }
  | { ok: false; message: string };

/** Names are capped at 60 characters; "Card 2" keeps the number inside the cap. */
function freeName(name: string, taken: Set<string>): string {
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const next = `${name.slice(0, 60 - suffix.length).trim()}${suffix}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
}

function dedupe<T extends { name: string }>(items: T[], renamed: ImportRename[]): T[] {
  const taken = new Set(items.map((item) => item.name.toLowerCase()));
  const seen = new Set<string>();
  return items.map((item) => {
    const key = item.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      return item;
    }
    const to = freeName(item.name, taken);
    taken.add(to.toLowerCase());
    seen.add(to.toLowerCase());
    renamed.push({ from: item.name, to });
    return { ...item, name: to };
  });
}

/**
 * W-283: the editor keeps class names, and variable names within a kind, unique (W-277, W-278).
 * A hand-edited file can still repeat one, so Import renames the later ones ("Card 2") and the
 * confirm lists them. Ids, and so every reference, stay as they are.
 */
export function uniqueImportNames(design: DesignSystem): {
  design: DesignSystem;
  renamed: ImportRename[];
} {
  const renamed: ImportRename[] = [];
  const classes = design.classes ? dedupe(design.classes, renamed) : design.classes;
  const variables = { ...design.variables };
  for (const [group] of VARIABLE_GROUPS) {
    const list = design.variables[group];
    if (list) Object.assign(variables, { [group]: dedupe<{ name: string }>(list, renamed) });
  }
  if (renamed.length === 0) return { design, renamed };
  return { design: { ...design, variables, ...(classes ? { classes } : {}) }, renamed };
}

/** Parse an exported design. Older schema versions are upgraded. A newer file is refused. */
export function designFromJson(text: string): DesignImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file is not JSON." };
  }
  const upgraded = upgradeLayout(parsed, DESIGN_MIGRATIONS, DESIGN_SCHEMA_VERSION);
  if (!upgraded.ok) {
    return {
      ok: false,
      message:
        upgraded.reason === "newer-version"
          ? "That design was saved by a newer EmVB."
          : "That file is not an EmVB design document.",
    };
  }
  const result = DesignSystemSchema.safeParse(upgraded.doc);
  if (!result.success) return { ok: false, message: "That file is not an EmVB design document." };
  return { ok: true, ...uniqueImportNames(result.data) };
}

/** The largest design file Import reads (W-214); the saved design is capped far lower. */
export const MAX_DESIGN_FILE_BYTES = 1024 * 1024;

export type ImportLosses = {
  /** Classes and variables in the current design that the file doesn't have. */
  classes: number;
  variables: number;
  /** Of those, how many this page uses (its elements would lose that styling). */
  usedOnPage: number;
};

const VARIABLE_GROUPS = [
  ["colors", "color"],
  ["fonts", "font"],
  ["fontSizes", "fontSize"],
  ["spacings", "spacing"],
] as const;

/**
 * W-214: what Import would drop. It replaces the whole design and there is no revision history,
 * so the editor confirms first and names the cost.
 */
export function importLosses(
  current: DesignSystem,
  incoming: DesignSystem,
  layout: Layout | null,
): ImportLosses {
  const keptClasses = new Set((incoming.classes ?? []).map((c) => c.id));
  const lostClasses = (current.classes ?? []).filter((c) => !keptClasses.has(c.id));
  let variables = 0;
  let usedOnPage = 0;
  for (const [group, kind] of VARIABLE_GROUPS) {
    const kept = new Set((incoming.variables[group] ?? []).map((v) => v.id));
    for (const variable of current.variables[group] ?? []) {
      if (kept.has(variable.id)) continue;
      variables += 1;
      if (layout && findVariableUsages(layout, variable.id, kind).length > 0) usedOnPage += 1;
    }
  }
  if (layout) {
    usedOnPage += lostClasses.filter((c) => findClassUsages(layout, c.id).length > 0).length;
  }
  return { classes: lostClasses.length, variables, usedOnPage };
}
