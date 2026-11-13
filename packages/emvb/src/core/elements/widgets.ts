/**
 * The 1.2 widgets (PLAN_1.2 part D): elements built from plain markup and CSS. Each one renders
 * without script; the few interactive extras are opt-in runtimes.
 */
import type { RatingNode } from "../schema/layout.ts";
import { MAX_RATING } from "../schema/layout.ts";
import type { VNode } from "../render/vnode.ts";
import type { ElementDefinition } from "./definition.ts";

/** Star outline on a 24 × 24 grid. */
const STAR =
  "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26";

/** A number as people write it: 4.5, 4, 0.3 (at most one decimal). */
const ratingNumber = (value: number) => String(Math.round(value * 10) / 10);

/** W-1023: what screen readers hear for a Rating. */
function ratingLabel(props: RatingNode["props"]): string {
  const max = props.max ?? 5;
  const value = ratingNumber(Math.min(Math.max(props.value, 0), max));
  const template = props.label?.trim() || "Rated {value} out of {max}";
  return template.replaceAll("{value}", value).replaceAll("{max}", String(max));
}

/**
 * One star filled to `fraction` (0 to 1): an empty star with the filled part over it. The filled
 * part is the same star cut by its viewBox, so a half star needs no ids, masks or styles.
 */
function star(size: number, fraction: number): VNode {
  const svg = (className: string, part: number, extra: Record<string, string>): VNode => ({
    tag: "svg",
    attrs: {
      xmlns: "http://www.w3.org/2000/svg",
      class: className,
      width: String(Math.round(size * part * 100) / 100),
      height: String(size),
      viewBox: `0 0 ${Math.round(24 * part * 1000) / 1000} 24`,
      fill: "currentColor",
      "aria-hidden": "true",
      focusable: "false",
      ...extra,
    },
    children: [{ tag: "polygon", attrs: { points: STAR }, children: [] }],
  });
  const parts: VNode[] = [svg("emvb-rating-empty", 1, { "fill-opacity": "0.25" })];
  if (fraction > 0) parts.push(svg("emvb-rating-fill", fraction, {}));
  return { tag: "span", attrs: { class: "emvb-rating-star" }, children: parts };
}

export const rating: ElementDefinition<RatingNode> = {
  baseCss:
    ".emvb-rating{display:inline-flex;gap:0.125em;line-height:0;color:inherit}.emvb-rating-star{position:relative;display:inline-block}.emvb-rating-star svg{display:block}.emvb-rating-fill{position:absolute;top:0;left:0}[dir=rtl] .emvb-rating-fill,.emvb-rating[dir=rtl] .emvb-rating-fill{left:auto;right:0;transform:scaleX(-1)}",
  defaults: () => ({ type: "rating", props: { value: 4.5, max: 5 } }),
  descriptor: {
    type: "rating",
    name: "Star rating",
    group: "content",
    defaultTab: "content",
    fields: [
      {
        key: "value",
        kind: "decimal",
        label: "Rating",
        min: 0,
        max: 5,
        maxProp: "max",
        message: "Enter a number from 0 up to the number of stars, such as 4.5.",
      },
      {
        key: "max",
        kind: "int",
        label: "Stars",
        optional: true,
        max: MAX_RATING,
        message: `From 1 to ${MAX_RATING} stars.`,
      },
      { key: "size", kind: "int", label: "Star size (px)", optional: true, min: 8, max: 128 },
      { key: "label", kind: "text", label: "Text for screen readers", optional: true },
    ],
  },
  build: (node, attrs) => {
    const max = node.props.max ?? 5;
    const value = Math.min(Math.max(node.props.value, 0), max);
    const size = node.props.size ?? 20;
    const stars = Array.from({ length: max }, (_, i) =>
      star(size, Math.min(Math.max(value - i, 0), 1)),
    );
    return {
      tag: "div",
      attrs: { ...attrs, role: "img", "aria-label": ratingLabel(node.props) },
      children: stars,
    };
  },
};
