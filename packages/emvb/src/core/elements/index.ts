import type { ContainerNode, HeadingNode } from "../schema/layout.ts";
import type { VNode } from "../render/vnode.ts";

type Build<N> = (node: N, attrs: Record<string, string>, children: VNode[]) => VNode;

type ElementDefinition<N> = {
  /** Base CSS for the element type, emitted only when the type is used on the page. */
  baseCss: string;
  build: Build<N>;
};

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

const heading: ElementDefinition<HeadingNode> = {
  baseCss: ".emvb-heading{margin:0}",
  build: (node, attrs) => ({
    tag: HEADING_TAGS[node.props.level - 1] ?? "h2",
    attrs,
    children: [node.props.text],
  }),
};

const container: ElementDefinition<ContainerNode> = {
  baseCss: ".emvb-container{display:flex;flex-direction:column;min-width:0}",
  build: (_node, attrs, children) => ({ tag: "div", attrs, children }),
};

export const ELEMENTS = { heading, container } as const;
