import type { DesignSystem } from "../schema/design.ts";
import { STYLE_STATES, type StyleStateName } from "../schema/state-names.ts";
import type { StyleProps, StyleStates } from "../schema/style.ts";

type StateStyle = NonNullable<StyleStates[StyleStateName]>;

/**
 * Merge `patch` into one state's styles (W-089); `undefined` clears a key. An emptied state is
 * dropped, and so is `states` itself. Pure.
 */
export function patchStates(
  states: StyleStates | undefined,
  state: StyleStateName,
  patch: Partial<StyleProps>,
): StyleStates | undefined {
  const merged: Record<string, unknown> = { ...states?.[state], ...patch };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  delete merged["transition"];
  const next: StyleStates = { ...states };
  if (Object.keys(merged).length > 0) next[state] = merged as StateStyle;
  else delete next[state];
  return STYLE_STATES.some((s) => next[s] !== undefined) ? next : undefined;
}

/** Whether a node or class has any state value (the "Has state styles" dot). */
export const hasStateStyles = (owner: { states?: StyleStates } | undefined): boolean =>
  STYLE_STATES.some((state) => Object.keys(owner?.states?.[state] ?? {}).length > 0);

/** `patchStates` on a design class. Pure. */
export function patchClassState(
  design: DesignSystem,
  classId: string,
  state: StyleStateName,
  patch: Partial<StyleProps>,
): DesignSystem {
  const classes = design.classes ?? [];
  if (!classes.some((c) => c.id === classId)) return design;
  return {
    ...design,
    classes: classes.map((c) => {
      if (c.id !== classId) return c;
      const next = Object.assign({}, c);
      const states = patchStates(c.states, state, patch);
      if (states) next.states = states;
      else delete next.states;
      return next;
    }),
  };
}
