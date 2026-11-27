/**
 * Which stored elements may hold which children (extensionApi 1.5), for the editor's drop rules.
 *
 * The rules come from the extension manifests: an element that declares a slot holds children,
 * and its `accepts` and `parts` say which. A part lives only inside the element that lists it.
 * This module is pure (no registry import), so the editor's drop rules and the core can read it
 * alike. The registry and the admin's manifest cache fill it with `setSlotRules`.
 */

type RuleElement = {
  type: string;
  slots?: readonly { accepts?: readonly string[] }[];
  parts?: readonly string[];
};

type SlotRule = { accepts?: readonly string[]; parts: readonly string[] };

/** The elements that declare a slot, by stored type. */
const RULES = new Map<string, SlotRule>();
/** Every stored type some element lists as a part: it lives only inside that element. */
const PARTS = new Set<string>();

/** Replaces the rules with the elements' declarations (a manifest list's elements). */
export function setSlotRules(elements: readonly RuleElement[]): void {
  RULES.clear();
  PARTS.clear();
  for (const element of elements) {
    for (const part of element.parts ?? []) PARTS.add(part);
    const slot = element.slots?.[0];
    if (slot) {
      RULES.set(element.type, {
        ...(slot.accepts ? { accepts: slot.accepts } : {}),
        parts: element.parts ?? [],
      });
    }
  }
}

export function clearSlotRules(): void {
  RULES.clear();
  PARTS.clear();
}

/** Whether a stored element holds children in a slot. */
export function holdsChildren(type: string): boolean {
  return RULES.has(type);
}

/**
 * Whether `parent` may hold a child of type `child`. A part goes only into its own parent. A
 * parent with a slot takes its `parts`, then its `accepts` (any child when `accepts` is unset).
 * Any other element takes any child that is not a part.
 */
export function canHoldChild(parent: string, child: string): boolean {
  const rule = RULES.get(parent);
  if (rule === undefined) return !PARTS.has(child);
  if (rule.parts.includes(child)) return true;
  if (PARTS.has(child)) return false;
  return rule.accepts === undefined || rule.accepts.includes(child);
}
