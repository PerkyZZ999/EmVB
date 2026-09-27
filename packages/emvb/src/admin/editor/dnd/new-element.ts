import {
  defaultElement,
  ELEMENTS,
  newNodeId,
  type ElementType,
  type LayoutNode,
  type TabsNode,
} from "../../../core/index.ts";

/** Default node for an Add-tile drag. */
export function newElement(type: string, random?: () => number): LayoutNode | null {
  if (!(type in ELEMENTS)) return null;
  if (type === "tabs") {
    const tabs = defaultElement("tabs", newNodeId(random)) as TabsNode;
    const panel = (label: string, heading: string): LayoutNode => ({
      id: newNodeId(random),
      type: "tab-panel",
      props: { label },
      children: [
        {
          id: newNodeId(random),
          type: "heading",
          props: { text: heading, level: 3 },
        },
      ],
    });
    return {
      ...tabs,
      children: [panel("Tab 1", "First tab"), panel("Tab 2", "Second tab")],
    };
  }
  return defaultElement(type as ElementType, newNodeId(random));
}
