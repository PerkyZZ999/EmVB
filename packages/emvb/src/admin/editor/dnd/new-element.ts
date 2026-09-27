import { newNodeId, type LayoutNode } from "../../../core/index.ts";

/** Default node for an Add-tile drag. Only heading is exposed in W-015; more types arrive with W-016. */
export function newElement(type: string, random?: () => number): LayoutNode | null {
  if (type === "heading") {
    return { id: newNodeId(random), type: "heading", props: { text: "Heading", level: 2 } };
  }
  if (type === "container") {
    return { id: newNodeId(random), type: "container", props: {}, children: [] };
  }
  return null;
}
