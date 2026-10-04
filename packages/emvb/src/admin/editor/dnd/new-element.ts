import {
  defaultElement,
  ELEMENTS,
  newNodeId,
  type ElementType,
  type LayoutNode,
} from "../../../core/index.ts";

const textNode = (text: string, random?: () => number): LayoutNode => ({
  ...defaultElement("text", newNodeId(random)),
  props: { text },
});

/** An accordion item titled "Item n" holding a Text, for a new Accordion or its Add item (W-130). */
export function newAccordionItem(n: number, random?: () => number, open = false): LayoutNode {
  return {
    id: newNodeId(random),
    type: "accordion-item",
    props: open ? { summary: `Item ${n}`, open: true } : { summary: `Item ${n}` },
    children: [textNode(`Content for item ${n}. Replace this text or add elements here.`, random)],
  };
}

/** A tab panel labelled "Tab n" holding a Text, for Tabs' Add tab (W-130). */
export function newTabPanel(n: number, random?: () => number): LayoutNode {
  return {
    id: newNodeId(random),
    type: "tab-panel",
    props: { label: `Tab ${n}` },
    children: [textNode(`Content for tab ${n}.`, random)],
  };
}

/**
 * Default node for a new element from the Add panel. Only new inserts get starter children;
 * saved Accordions and Tabs with no items keep working as they are (W-130).
 */
export function newElement(type: string, random?: () => number): LayoutNode | null {
  if (!(type in ELEMENTS)) return null;
  if (type === "tabs") {
    const tabs = defaultElement("tabs", newNodeId(random));
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
  if (type === "accordion") {
    const accordion = defaultElement("accordion", newNodeId(random));
    return {
      ...accordion,
      children: [1, 2, 3].map((n) => newAccordionItem(n, random, n === 1)),
    };
  }
  return defaultElement(type as ElementType, newNodeId(random));
}
