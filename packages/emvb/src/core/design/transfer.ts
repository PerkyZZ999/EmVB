import { clipText, MAX_DESIGN_BYTES } from "../limits.ts";
import { DesignSystem as DesignSystemSchema, DESIGN_SCHEMA_VERSION } from "../schema/design.ts";
import type { DesignSystem } from "../schema/design.ts";
import { restoreExtras, splitDesignExtras } from "../contract.ts";
import { DESIGN_MIGRATIONS, upgradeLayout } from "../migrate/index.ts";
import type { Layout } from "../schema/layout.ts";
import { findClassUsages, nameKey } from "./classes.ts";
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
    const next = `${clipText(name, 60 - suffix.length).trim()}${suffix}`;
    if (!taken.has(nameKey(next))) return next;
  }
}

function dedupe<T extends { name: string }>(items: T[], renamed: ImportRename[]): T[] {
  const taken = new Set(items.map((item) => nameKey(item.name)));
  const seen = new Set<string>();
  return items.map((item) => {
    const key = nameKey(item.name);
    if (!seen.has(key)) {
      seen.add(key);
      return item;
    }
    const to = freeName(item.name, taken);
    taken.add(nameKey(to));
    seen.add(nameKey(to));
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

function repeatedId(design: DesignSystem): { what: string; id: string } | null {
  const lists: [string, { id: string }[] | undefined][] = [
    ["classes", design.classes],
    ...VARIABLE_GROUPS.map(([group]): [string, { id: string }[] | undefined] => [
      "variables",
      design.variables[group],
    ]),
  ];
  for (const [what, list] of lists) {
    const seen = new Set<string>();
    for (const item of list ?? []) {
      if (seen.has(item.id)) return { what, id: item.id };
      seen.add(item.id);
    }
  }
  return null;
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
  const extras = splitDesignExtras(upgraded.doc);
  if (extras.issues.length > 0)
    return { ok: false, message: "That file is not an EmVB design document." };
  const result = DesignSystemSchema.safeParse(upgraded.doc);
  if (!result.success) return { ok: false, message: "That file is not an EmVB design document." };
  restoreExtras(result.data, extras.extras);
  // W-619: every reference points at an id, so two classes (or two variables of one kind) with
  // the same id can't both be kept; the editor never writes such a file.
  const repeated = repeatedId(result.data);
  if (repeated) {
    return {
      ok: false,
      message: `That file has two ${repeated.what} with the id "${clipText(repeated.id, 40)}". Give one of them a different id, then import it again.`,
    };
  }
  const imported = uniqueImportNames(result.data);
  // W-516: the file cap is 1 MB, but the saved design is capped lower; a design over that cap
  // replaced the site styles in the editor and then every save of them was refused.
  const bytes = new TextEncoder().encode(JSON.stringify(imported.design)).length;
  if (bytes > MAX_DESIGN_BYTES) {
    return {
      ok: false,
      message: `That design is ${Math.ceil(bytes / 1024)} KB; site styles can be at most ${MAX_DESIGN_BYTES / 1024} KB. Remove some classes or variables from the file, then import it again.`,
    };
  }
  return { ok: true, ...imported };
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
