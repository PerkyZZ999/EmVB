import { defaultElement, type ElementType, type LayoutNode } from "../core/index.ts";

/**
 * W-1089 (#29): optional props whose Add-panel default is sample content (words, prices, links,
 * a place, a ribbon). People get them as a starting point to edit; an element an agent adds
 * keeps only what the agent set, so a price table with a title and a price doesn't also show
 * "For growing teams.", a crossed-out "Custom domain" and a Featured ribbon. Required props keep
 * their defaults, so the element stays valid.
 */
export const AGENT_SAMPLE_PROPS: Readonly<Partial<Record<ElementType, readonly string[]>>> = {
  alert: ["title"],
  testimonial: ["role"],
  counter: ["suffix", "title"],
  progress: ["label"],
  countdown: ["title"],
  map: ["lat", "lng"],
  "price-table": [
    "description",
    "currency",
    "period",
    "features",
    "excluded",
    "buttonText",
    "buttonHref",
    "featured",
  ],
  cta: ["text", "buttonText", "href"],
  "flip-box": ["frontText", "backTitle", "backText", "buttonText", "href"],
  headline: ["before", "after", "rotate"],
};

/** The element an agent's add starts from: the type's defaults without sample content. */
export function agentDefaultElement(type: ElementType, id: string): LayoutNode {
  const base = defaultElement(type, id) as LayoutNode & { props?: Record<string, unknown> };
  const sample = AGENT_SAMPLE_PROPS[type];
  if (!sample || !base.props) return base;
  const props = { ...base.props };
  for (const key of sample) delete props[key];
  return { ...base, props } as LayoutNode;
}
