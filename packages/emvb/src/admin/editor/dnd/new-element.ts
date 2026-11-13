import {
  defaultElement,
  updateNode,
  ELEMENTS,
  isExtensionType,
  newNodeId,
  type ElementType,
  type Layout,
  type LayoutNode,
} from "../../../core/index.ts";
import type { ThemePartType } from "../../../core/theme/part-types.ts";
import { indexLayout } from "../../../core/tree-ops.ts";
import { isSharedPart } from "../panels/settings/heading-warning.ts";

const hasH1 = (node: LayoutNode): boolean =>
  ((node.type === "heading" || node.type === "post-title") &&
    (node.props as { level?: number }).level === 1) ||
  ("children" in node && Array.isArray(node.children) && node.children.some(hasH1));

/**
 * A new Heading is the page's H1 when the page has none yet, otherwise the default H2 (W-147).
 * Other nodes, and headings whose level was already chosen, are returned as they are. In a
 * header, footer, popup, float, synced section or loop item it stays H2: that part lands on pages
 * that have their own H1 (W-946).
 */
export function withPageHeadingLevel(
  node: LayoutNode,
  layout: Layout,
  partType?: ThemePartType,
): LayoutNode {
  if (node.type !== "heading" || node.props.level !== 2) return node;
  if (isSharedPart(partType) || hasH1(layout.root)) return node;
  return { ...node, props: { ...node.props, level: 1 } };
}

/**
 * W-968: a new Post title inside a Loop (or in a loop item part) is an H2. Its default H1 gave a
 * grid of cards one H1 per post. Run on the layout right after the insert; a title whose level was
 * already changed, or one moved in later, is left alone.
 */
export function withLoopPostTitleLevel(
  layout: Layout,
  id: string,
  partType?: ThemePartType,
): Layout {
  const index = indexLayout(layout);
  const node = index.byId.get(id);
  if (node?.type !== "post-title" || (node.props as { level?: number }).level !== 1) return layout;
  let inLoop = partType === "loop_item";
  for (let at = index.parentOf.get(id); !inLoop && at; at = index.parentOf.get(at))
    inLoop = index.byId.get(at)?.type === "loop";
  if (!inLoop) return layout;
  return updateNode(layout, id, (n) => ({ ...n, props: { ...n.props, level: 2 } }) as LayoutNode);
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

/** W-1024: the networks new Social links cycle through, and an example profile for each. */
const STARTER_NETWORKS = [
  ["facebook", "https://facebook.com/"],
  ["instagram", "https://instagram.com/"],
  ["linkedin", "https://linkedin.com/"],
  ["youtube", "https://youtube.com/"],
  ["x", "https://x.com/"],
] as const;

/** W-1024: a Social link for a new Social icons element or its Add link. */
export function newSocialLink(n: number, random?: () => number): LayoutNode {
  const [network, href] =
    STARTER_NETWORKS[(n - 1) % STARTER_NETWORKS.length] ?? STARTER_NETWORKS[0];
  return { id: newNodeId(random), type: "social-link", props: { network, href, newTab: true } };
}

/** W-1018: a Carousel slide holding a heading and a Text, for a new Carousel or its Add slide. */
export function newCarouselSlide(n: number, random?: () => number): LayoutNode {
  return {
    id: newNodeId(random),
    type: "carousel-slide",
    props: {},
    children: [
      { id: newNodeId(random), type: "heading", props: { text: `Slide ${n}`, level: 3 } },
      textNode(`What slide ${n} says. Replace this text or add elements here.`, random),
    ],
  };
}

/** W-1019: an empty Gallery image for a Gallery's Add picture; its panel picks the picture. */
export function newGalleryImage(random?: () => number): LayoutNode {
  return { id: newNodeId(random), type: "gallery-image", props: { src: "", alt: "Image" } };
}

/**
 * Default node for a new element from the Add panel. Only new inserts get starter children;
 * saved Accordions and Tabs with no items keep working as they are (W-130).
 */
export function newElement(
  type: string,
  random?: () => number,
  extensionDefaults?: Record<string, unknown>,
): LayoutNode | null {
  // W-927: extension elements are stored as UnknownNodes with namespaced types.
  if (isExtensionType(type)) {
    return {
      id: newNodeId(random),
      type,
      props: extensionDefaults ? { ...extensionDefaults } : {},
    };
  }
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
  if (type === "carousel") {
    return {
      ...defaultElement("carousel", newNodeId(random)),
      children: [1, 2, 3].map((n) => newCarouselSlide(n, random)),
    };
  }
  if (type === "social-icons") {
    return {
      ...defaultElement("social-icons", newNodeId(random)),
      children: [1, 2, 3].map((n) => newSocialLink(n, random)),
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
