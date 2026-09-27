import {
  defaultElement,
  ELEMENTS,
  newNodeId,
  type ElementType,
  type LayoutNode,
} from "../../../core/index.ts";

/** Default node for an Add-tile drag. */
export function newElement(type: string, random?: () => number): LayoutNode | null {
  if (!(type in ELEMENTS)) return null;
  return defaultElement(type as ElementType, newNodeId(random));
}
