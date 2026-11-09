/** Elementor 4 global classes and variables, as a template export carries them (W-945). */
import { isRecord, type Settings, str } from "./values.ts";

export type Value = { $$type?: string; value?: unknown };
export type ClassVariant = {
  meta?: { breakpoint?: string | null; state?: string | null };
  props?: Settings;
  custom_css?: unknown;
};
export type ClassDef = { id?: string; label?: string; variants?: ClassVariant[] };

/** The global classes and variables a template export carries. */
export type AtomicSnapshots = {
  classes: Map<string, ClassDef>;
  /** Position in Elementor's class order: a lower index wins over a higher one. */
  rank: Map<string, number>;
  variables: Map<string, { type: string; value: unknown }>;
};

export const emptySnapshots = (): AtomicSnapshots => ({
  classes: new Map(),
  rank: new Map(),
  variables: new Map(),
});

/** Reads `global_classes: { items, order }` and `global_variables: { data }` into `into`. */
export function readSnapshots(source: Settings, into: AtomicSnapshots): void {
  const classes = isRecord(source["global_classes"]) ? source["global_classes"] : undefined;
  const items = classes && isRecord(classes["items"]) ? classes["items"] : undefined;
  if (items) {
    for (const [id, def] of Object.entries(items).slice(0, 5000)) {
      if (isRecord(def) && !into.classes.has(id)) into.classes.set(id, def as ClassDef);
    }
    const order = Array.isArray(classes?.["order"]) ? (classes["order"] as unknown[]) : [];
    order.forEach((id, i) => {
      if (typeof id === "string" && !into.rank.has(id)) into.rank.set(id, i);
    });
  }
  const variables = isRecord(source["global_variables"]) ? source["global_variables"] : undefined;
  const data = variables && isRecord(variables["data"]) ? variables["data"] : undefined;
  if (data) {
    for (const [id, def] of Object.entries(data).slice(0, 5000)) {
      if (!isRecord(def) || into.variables.has(id)) continue;
      const raw = isRecord(def["value"]) ? def["value"]["value"] : def["value"];
      into.variables.set(id, { type: str(def["type"]) ?? "", value: raw });
    }
  }
}
