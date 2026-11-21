import type { Declaration } from "../sanitize/css.ts";
import { escapeAttr } from "../sanitize/escape.ts";
import { DEVICE_MEDIA } from "./popup-rules.ts";

/**
 * W-1097 (#42): a sticky box at the top level of a theme part (the part's root, or a box right
 * inside it), with its placement on each device. A sticky box can't leave its containing block,
 * and a header part's wrapper and root are only as tall as the header, so the box had no room to
 * stick. The part's wrapper takes the same placement instead and sticks along the whole page.
 */
export type StickyFrame = {
  /** Desktop: `position` (sticky or static), `top`, `bottom`, `z-index`, `--emvb-sticky-hide`. */
  declarations: Declaration[];
  wide?: Declaration[];
  laptop?: Declaration[];
  tablet?: Declaration[];
  mobile?: Declaration[];
  /** The box hides while scrolling down (W-1070): the wrapper hides instead. */
  hide: boolean;
};

type DeviceDeclarations = {
  declarations: Declaration[];
  wide?: Declaration[];
  laptop?: Declaration[];
  tablet?: Declaration[];
  mobile?: Declaration[];
};

const COPIED = new Set(["top", "bottom", "z-index", "--emvb-sticky-hide"]);

/** A device's placement for the wrapper: any position but sticky leaves the wrapper in flow. */
const placement = (list: readonly Declaration[] | undefined): Declaration[] =>
  (list ?? []).flatMap((d) =>
    d.property === "position"
      ? [{ property: "position", value: d.value === "sticky" ? "sticky" : "static" }]
      : COPIED.has(d.property)
        ? [d]
        : [],
  );

const sticks = (list: readonly Declaration[] | undefined): boolean =>
  (list ?? []).some((d) => d.property === "position" && d.value === "sticky");

/** The frame of a box's rule when the box is sticky on Desktop or any other device. */
export function stickyFrameOf(rule: DeviceDeclarations, hide: boolean): StickyFrame | undefined {
  const lists = [rule.declarations, rule.wide, rule.laptop, rule.tablet, rule.mobile];
  if (!lists.some(sticks)) return undefined;
  const frame: StickyFrame = { declarations: placement(rule.declarations), hide };
  for (const device of ["wide", "laptop", "tablet", "mobile"] as const) {
    const own = placement(rule[device]);
    if (own.length > 0) frame[device] = own;
  }
  return frame;
}

const block = (selector: string, declarations: readonly Declaration[]) =>
  declarations.length === 0
    ? ""
    : `${selector}{${declarations.map((d) => `${d.property}:${d.value}`).join(";")}}`;

/** The wrapper's rules, device by device in the order the part's own sheet writes them. */
export function stickyFrameCss(selector: string, frame: StickyFrame): string {
  const at = (media: string, list: readonly Declaration[] | undefined) => {
    const css = block(selector, list ?? []);
    return css ? `@media ${media}{${css}}` : "";
  };
  return [
    block(selector, frame.declarations),
    at(DEVICE_MEDIA.wide, frame.wide),
    at(DEVICE_MEDIA.laptop, frame.laptop),
    at(DEVICE_MEDIA.tablet, frame.tablet),
    at(DEVICE_MEDIA.mobile, frame.mobile),
  ].join("");
}

/**
 * A theme part's markup in its wrapper (W-216, W-586): a header or footer part is the page's
 * `<header>` or `<footer>` landmark unless it has its own; other parts get a `<div>`. W-1097: a
 * header or footer part with a sticky top-level box gets a sticky wrapper (`css` holds its rules;
 * empty otherwise, so every other part renders exactly as before).
 */
export function wrapThemePart(
  partType: string,
  partId: string,
  html: string,
  stickyFrame?: StickyFrame,
): { html: string; css: string } {
  if (!html) return { html: "", css: "" };
  const landmark = partType === "header" || partType === "footer";
  const ownLandmark = /<(?:header|footer)[\s>]/.test(html);
  const tag = landmark && !ownLandmark ? partType : "div";
  const frame = landmark ? stickyFrame : undefined;
  const className = `emvb-theme-${partType}${frame ? " emvb-theme-sticky" : ""}`;
  const hide = frame?.hide ? ' data-emvb-sticky-hide=""' : "";
  return {
    html: `<${tag} class="${className}" data-emvb-theme-part="${escapeAttr(partId)}"${hide}>${html}</${tag}>`,
    css: frame ? stickyFrameCss(`.emvb-theme-${partType}.emvb-theme-sticky`, frame) : "",
  };
}
