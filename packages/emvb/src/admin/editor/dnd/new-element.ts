import {
  defaultElement,
  ELEMENTS,
  newNodeId,
  type ElementType,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";

const hasH1 = (node: LayoutNode): boolean =>
  ((node.type === "heading" || node.type === "post-title") &&
    (node.props as { level?: number }).level === 1) ||
  ("children" in node && Array.isArray(node.children) && node.children.some(hasH1));

/**
 * A new Heading is the page's H1 when the page has none yet, otherwise the default H2 (W-147).
 * Other nodes, and headings whose level was already chosen, are returned as they are.
 */
export function withPageHeadingLevel(node: LayoutNode, layout: Layout): LayoutNode {
  if (node.type !== "heading" || node.props.level !== 2 || hasH1(layout.root)) return node;
  return { ...node, props: { ...node.props, level: 1 } };
}

const textNode = (text: string, random?: () => number): LayoutNode => ({
  ...defaultElement("text", newNodeId(random)),
  props: { text },
});

/**
 * An accordion item titled "Question n" holding a Text, for a new Accordion or its Add item
 * (W-130, W-154).
 */
export function newAccordionItem(n: number, random?: () => number, open = false): LayoutNode {
  return {
    id: newNodeId(random),
    type: "accordion-item",
    props: open ? { summary: `Question ${n}`, open: true } : { summary: `Question ${n}` },
    children: [
      textNode(`Answer to question ${n}. Replace this text or add elements here.`, random),
    ],
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
  if (type === "menu") {
    const menuNode = defaultElement("menu", newNodeId(random));
    const item = (text: string, href: string, children: LayoutNode[] = []): LayoutNode => ({
      id: newNodeId(random),
      type: "menu-item",
      props: { text, href },
      children,
    });
    return {
      ...menuNode,
      children: [
        item("Home", "/"),
        item("Work", "/work", [
          item("Projects", "/work/projects"),
          item("Archive", "/work/archive"),
        ]),
        item("About", "/about"),
      ],
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
