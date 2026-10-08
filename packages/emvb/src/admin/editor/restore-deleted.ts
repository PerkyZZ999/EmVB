import type { DesignSystem, Layout, VariableKind } from "../../core/index.ts";

type Variables = DesignSystem["variables"];
type ListKey = keyof Variables;
type StyleClass = NonNullable<DesignSystem["classes"]>[number];
type AnyVariable = NonNullable<Variables[ListKey]>[number];

const LIST: Record<VariableKind, ListKey> = {
  color: "colors",
  font: "fonts",
  fontSize: "fontSizes",
  spacing: "spacings",
};

/** A variable or class deleted from Site styles, where it stood, and the page just before. */
export type Deletion = {
  before: Layout;
  index: number;
} & (
  | { kind: "variable"; variableKind: VariableKind; variable: AnyVariable }
  | { kind: "class"; cls: StyleClass }
);

/** The deletion of `id` from `design`, or undefined when the design doesn't have it. */
export function deletionOf(
  design: DesignSystem,
  before: Layout,
  target:
    | { kind: "variable"; id: string; variableKind: VariableKind }
    | { kind: "class"; id: string },
): Deletion | undefined {
  if (target.kind === "class") {
    const classes = design.classes ?? [];
    const index = classes.findIndex((c) => c.id === target.id);
    const cls = classes[index];
    return cls ? { kind: "class", cls, index, before } : undefined;
  }
  const list: readonly AnyVariable[] = design.variables[LIST[target.variableKind]] ?? [];
  const index = list.findIndex((v) => v.id === target.id);
  const variable = list[index];
  return variable
    ? { kind: "variable", variableKind: target.variableKind, variable, index, before }
    : undefined;
}

/**
 * W-252: Site styles changes aren't undo steps, but deleting a variable or class also clears its
 * uses on the page, which is one. Undoing that brought the uses back with nothing defining them.
 * When the page is again exactly the one from before a deletion (undo restores that object), the
 * deleted items go back into the design where they were. Null when nothing needs restoring.
 */
export function restoreOnUndo(
  design: DesignSystem,
  layout: Layout,
  deletions: readonly Deletion[],
): DesignSystem | null {
  const classes = [...(design.classes ?? [])];
  const variables: Partial<Record<ListKey, AnyVariable[]>> = {};
  let classRestored = false;
  for (const deletion of deletions) {
    if (deletion.before !== layout) continue;
    if (deletion.kind === "class") {
      if (classes.some((c) => c.id === deletion.cls.id)) continue;
      classes.splice(Math.min(deletion.index, classes.length), 0, deletion.cls);
      classRestored = true;
    } else {
      const key = LIST[deletion.variableKind];
      const list = variables[key] ?? [...(design.variables[key] ?? [])];
      if (list.some((v) => v.id === deletion.variable.id)) continue;
      list.splice(Math.min(deletion.index, list.length), 0, deletion.variable);
      variables[key] = list;
    }
  }
  if (!classRestored && Object.keys(variables).length === 0) return null;
  return {
    ...design,
    ...(classRestored ? { classes } : {}),
    variables: { ...design.variables, ...variables } as Variables,
  };
}
