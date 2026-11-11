import { cssTypeName } from "../schema/layout.ts";
import { MARK_CSS } from "../text-marks.ts";
import { DEFAULT_FLUID_RANGE, fluidClamp } from "../design/tokens.ts";
import type { FluidRange, LengthVariable } from "../schema/design.ts";
import type { DesignSystem } from "../schema/design.ts";
import { DEFAULT_STYLE_TAGS } from "../schema/design.ts";
import {
  colorVariableName,
  fontSizeVariableName,
  fontVariableName,
  isSafeCssValue,
  isSafeFontStack,
  spacingVariableName,
  stateDeclarations,
  styleClassName,
  styleDeclarations,
  withInheritedLayers,
  type Declaration,
  type StateDeclarations,
} from "../sanitize/css.ts";
import { STYLE_STATES, type StyleStateName } from "../schema/state-names.ts";
import { DEVICE_MEDIA, type Device, type EditorDevice } from "../theme/popup-rules.ts";
import { LOOP_KEYFRAMES, MOTION_KEYFRAMES } from "../sanitize/motion.ts";

export type CssInput = {
  design: DesignSystem;
  usedTypes: ReadonlySet<string>;
  baseCss: ReadonlyMap<string, string>;
  localRules: ReadonlyArray<{
    id: string;
    declarations: Declaration[];
    states?: StateDeclarations;
    /** W-959: Wide screen overrides (2400 px and up), and its hide override. */
    wide?: Declaration[];
    wideHidden?: boolean;
    /** Laptop (W-956), tablet and mobile overrides (W-096). Desktop stays in `declarations`. */
    laptop?: Declaration[];
    tablet?: Declaration[];
    mobile?: Declaration[];
    hiddenOn?: readonly Device[];
    /** W-443: an image with a caption, rendered inside a figure that hides with it. */
    figure?: boolean;
    /** Container-query overrides (W-346). */
    query?: Declaration[];
    queryMin?: number;
  }>;
  /** Editor canvas only: repeat each state rule for `[data-emvb-state="<state>"]` (W-089). */
  previewStates?: boolean;
  /** When a node rendered a background video (W-110). */
  backgroundVideo?: boolean;
  /** W-952: when a List is drawn as numbered steps. */
  listSteps?: boolean;
  /**
   * Editor canvas only (W-116): the device the canvas previews. Device rules then follow this
   * device instead of the frame's width, so the Desktop canvas never picks up tablet styles in a
   * narrow window. Without it, the rules sit in their media queries as usual.
   */
  previewDevice?: EditorDevice;
};

/**
 * W-959: a class's Wide screen overrides and hide. `renderableDesign` moved the class's
 * `style.wide` to `devices.wide` and `wideHidden`; the values build on Desktop's.
 */
function classWide(cls: unknown): { wide: Declaration[]; wideHidden?: boolean } {
  const { style, devices, wideHidden } = cls as {
    style?: unknown;
    devices?: { wide?: unknown };
    wideHidden?: unknown;
  };
  return {
    wide: devices?.wide
      ? styleDeclarations(withInheritedLayers(devices.wide, style ?? {})).declarations
      : [],
    ...(typeof wideHidden === "boolean" ? { wideHidden } : {}),
  };
}

/** Focus is keyboard focus (W-089): `:focus-visible`, never `:focus`. */
const STATE_PSEUDO: Readonly<Record<StyleStateName, string>> = {
  hover: ":hover",
  focus: ":focus-visible",
  active: ":active",
};

/**
 * Heading and Icon put their link inside the element (`innerLink`), so keyboard focus lands on
 * that link, never on the element itself. Their Focus state also matches then (W-242).
 */
const INNER_LINK_FOCUS = ":has(> :is(.emvb-heading-link,.emvb-icon-link):focus-visible)";

/** One state's selector list: Focus adds the inner-link form (W-242). */
const stateSelector = (selector: string, state: StyleStateName) =>
  state === "focus"
    ? `${selector}${STATE_PSEUDO.focus},${selector}${INNER_LINK_FOCUS}`
    : `${selector}${STATE_PSEUDO[state]}`;

const block = (selector: string, declarations: Declaration[]) =>
  declarations.length === 0
    ? ""
    : `${selector}{${declarations.map((d) => `${d.property}:${d.value}`).join(";")}}`;

/** Tag defaults sit under `:where` so a class (0,1,0) still beats the tag (0,0,1). */
function tagDefaultCss(
  design: DesignSystem,
  track: (selector: string, declarations: Declaration[]) => Declaration[],
): string {
  const defaults = design.defaults;
  if (!defaults) return "";
  let css = "";
  for (const tag of DEFAULT_STYLE_TAGS) {
    const style = defaults[tag];
    if (!style) continue;
    // W-670: tracked like classes, so a tag default's entrance gets its keyframes and turns off
    // for reduced motion.
    const selector = `:where(.emvb-root) ${tag}`;
    css += block(selector, track(selector, styleDeclarations(style).declarations));
  }
  return css;
}

const safe = (value: string) => (isSafeCssValue(value) ? value : undefined);

const fontStack = (value: string) => (isSafeFontStack(value) ? value : undefined);

const lengthCss = (length: { value: number; unit: string }) =>
  safe(`${length.value}${length.unit}`);

/** A size token: its fixed length, or a fluid `clamp()` when it has one (W-316). */
const sizeCss = (variable: LengthVariable, range: FluidRange | undefined) =>
  variable.fluid
    ? fluidClamp(variable.fluid.min, variable.fluid.max, range ?? DEFAULT_FLUID_RANGE)
    : lengthCss(variable.value);

/** One custom property per variable whose id and value are both safe to emit. */
function declare<T extends { id: string }>(
  variables: readonly T[] | undefined,
  name: (id: string) => string | undefined,
  value: (variable: T) => string | undefined,
): Declaration[] {
  return (variables ?? []).flatMap((variable) => {
    const property = name(variable.id);
    const css = value(variable);
    return property && css ? [{ property, value: css }] : [];
  });
}

/** W-319: declarations that play scroll motion. */
const usesMotion = (declarations: readonly Declaration[]) =>
  declarations.some((d) => d.property === "animation" && /\bemvb-m[otsrb]\b/.test(d.value));

/** W-938: declarations that play a loop. */
const usesLoop = (declarations: readonly Declaration[]) =>
  declarations.some((d) => d.property === "animation" && /\bemvb-l[otsrb]\b/.test(d.value));

/**
 * Cascade order (R-021 / W-030 / W-089): variables on `.emvb-root`, base CSS, shared
 * `.emvb-k-<id>` class rules, then local `.emvb-e-<id>` (local wins). Each selector's `:hover`,
 * `:focus-visible` and `:active` rules follow its base rule in that order, so a state beats Normal,
 * local states beat class states, and Active beats Hover when both apply. Transitions sit on the
 * base rule, and one closing `prefers-reduced-motion: reduce` block turns them all off.
 */
/**
 * The element base rules for these types, in the order every sheet writes them (W-971 reads
 * the same order to write them once for all theme parts on a page).
 */
export function baseRulesFor(
  types: Iterable<string>,
  baseCss: ReadonlyMap<string, string>,
): string {
  return [...types]
    .toSorted((a, b) =>
      cssTypeName(a) < cssTypeName(b) ? -1 : cssTypeName(a) > cssTypeName(b) ? 1 : 0,
    )
    .map((type) => baseCss.get(type) ?? "")
    .join("");
}

export function generateCss({
  design,
  usedTypes,
  baseCss,
  localRules,
  previewStates = false,
  backgroundVideo = false,
  listSteps = false,
  previewDevice,
}: CssInput): string {
  const { colors, fonts, fontSizes, spacings } = design.variables;
  const variables = [
    ...declare(colors, colorVariableName, (color) => safe(color.value)),
    ...declare(fonts, fontVariableName, (font) => fontStack(font.value)),
    ...declare(fontSizes, fontSizeVariableName, (size) => sizeCss(size, design.fluidRange)),
    ...declare(spacings, spacingVariableName, (space) => sizeCss(space, design.fluidRange)),
  ];
  const animated: string[] = [];
  const entrances: string[] = [];
  /** W-319: any scroll motion on the page, so its keyframes are sent. */
  let motion = false;
  /** W-938: any loop on the page, so its keyframes are sent. */
  let loops = false;
  const rules = (selector: string, declarations: Declaration[], states: StateDeclarations) => [
    block(selector, declarations),
    ...STYLE_STATES.map((state) =>
      block(
        previewStates
          ? `${stateSelector(selector, state)},${selector}[data-emvb-state="${state}"]`
          : stateSelector(selector, state),
        states[state] ?? [],
      ),
    ),
  ];
  const track = (selector: string, declarations: Declaration[]) => {
    if (declarations.some((d) => d.property === "transition")) animated.push(selector);
    if (declarations.some((d) => d.property === "animation")) entrances.push(selector);
    if (usesMotion(declarations)) motion = true;
    if (usesLoop(declarations)) loops = true;
    return declarations;
  };
  const classes = (design.classes ?? []).flatMap((cls) => {
    const className = styleClassName(cls.id);
    return className
      ? rules(
          `.${className}`,
          track(`.${className}`, styleDeclarations(cls.style).declarations),
          stateDeclarations(cls.states).states,
        )
      : [];
  });
  const locals = localRules.flatMap((rule) =>
    rules(`.emvb-e-${rule.id}`, track(`.emvb-e-${rule.id}`, rule.declarations), rule.states ?? {}),
  );
  const responsive = [
    ...(design.classes ?? []).flatMap((cls) => {
      const className = styleClassName(cls.id);
      return className
        ? [
            {
              selector: `.${className}`,
              ...classWide(cls),
              // W-210: a device that sets one background layer keeps the layers it inherits.
              laptop: styleDeclarations(withInheritedLayers(cls.devices?.laptop, cls.style ?? {}))
                .declarations,
              tablet: styleDeclarations(
                withInheritedLayers(cls.devices?.tablet, { ...cls.style, ...cls.devices?.laptop }),
              ).declarations,
              mobile: styleDeclarations(
                withInheritedLayers(cls.devices?.mobile, {
                  ...cls.style,
                  ...cls.devices?.laptop,
                  ...cls.devices?.tablet,
                }),
              ).declarations,
              hiddenOn: cls.hiddenOn,
              // W-571: the page root is never hidden (W-567), not even by a class.
              hideSelector: `.${className}:not(.emvb-root)`,
            },
          ]
        : [];
    }),
    ...localRules.map((rule) => ({
      selector: `.emvb-e-${rule.id}`,
      wide: rule.wide ?? [],
      wideHidden: rule.wideHidden,
      laptop: rule.laptop ?? [],
      tablet: rule.tablet ?? [],
      mobile: rule.mobile ?? [],
      hiddenOn: rule.hiddenOn,
      figure: rule.figure === true,
    })),
  ];
  /** A device block: in its media query, or, for a previewed device, on or off outright. */
  const forDevices = (devices: readonly EditorDevice[], query: string, body: string) => {
    if (!body) return "";
    if (previewDevice === undefined) return `@media ${query}{${body}}`;
    return devices.includes(previewDevice) ? body : "";
  };
  const at = (query: string, which: "wide" | "laptop" | "tablet" | "mobile") =>
    forDevices(
      which === "wide"
        ? ["wide"]
        : which === "laptop"
          ? ["laptop", "tablet", "mobile"]
          : which === "tablet"
            ? ["tablet", "mobile"]
            : ["mobile"],
      query,
      responsive.map((rule) => block(rule.selector, rule[which])).join(""),
    );
  /**
   * W-956: Desktop and Laptop hidden together keep the one `min-width: 1025px` rule every page
   * saved before Laptop had; hidden on only one of them, each gets its own range.
   */
  /**
   * W-959: Wide screen follows Desktop's hide unless `wide.hidden` says otherwise. An element
   * that Wide screen shows again gets a Desktop range that stops at 2399.98 px (`notWide`); one
   * hidden on Wide screen only gets the Wide screen rule. Rules without `wide.hidden` keep the
   * CSS they had.
   */
  type HideRule = { hiddenOn?: readonly Device[] | undefined; wideHidden?: boolean | undefined };
  const hide = (
    devices: readonly Device[],
    query: string,
    wide: "follows" | "notWide" | "only" = "follows",
  ) => {
    const hidden = (rule: HideRule) => {
      const on = rule.hiddenOn ?? [];
      if (wide === "only") return rule.wideHidden === true && !on.includes("desktop");
      if (devices.includes("desktop") && (rule.wideHidden === false) !== (wide === "notWide"))
        return false;
      if (devices.includes("desktop") && devices.includes("laptop"))
        return on.includes("desktop") && on.includes("laptop");
      if (devices[0] === "desktop") return on.includes("desktop") && !on.includes("laptop");
      if (devices[0] === "laptop") return on.includes("laptop") && !on.includes("desktop");
      return on.includes(devices[0] as Device);
    };
    const previewed: EditorDevice[] =
      wide === "only"
        ? ["wide"]
        : wide === "follows" && devices.includes("desktop")
          ? ["wide", ...devices]
          : [...devices];
    // W-443: a captioned image hides its figure too, or the caption stayed on its own.
    const selectors = responsive
      .filter(hidden)
      .flatMap((rule) =>
        "figure" in rule && rule.figure
          ? [rule.selector, `.emvb-figure:has(>${rule.selector},>a>${rule.selector})`]
          : ["hideSelector" in rule && rule.hideSelector ? rule.hideSelector : rule.selector],
      );
    return forDevices(
      previewed,
      query,
      selectors.length > 0 ? `${selectors.join(",")}{display:none}` : "",
    );
  };
  for (const rule of responsive) {
    const devices = [rule.wide ?? [], rule.laptop, rule.tablet, rule.mobile];
    if (devices.some(usesMotion)) motion = true;
    if (devices.some(usesLoop)) loops = true;
    if (
      !entrances.includes(rule.selector) &&
      devices.flat().some((d) => d.property === "animation")
    ) {
      entrances.push(rule.selector);
    }
  }
  const defaultsCss = tagDefaultCss(design, track);
  // W-670: an entrance or scroll motion set only in a container query override pointed at
  // keyframes that were never sent (no animation at all) and ignored reduced motion.
  for (const rule of localRules) {
    const query = rule.query ?? [];
    const selector = `.emvb-e-${rule.id}`;
    if (usesMotion(query)) motion = true;
    if (usesLoop(query)) loops = true;
    if (!entrances.includes(selector) && query.some((d) => d.property === "animation")) {
      entrances.push(selector);
    }
    if (!animated.includes(selector) && query.some((d) => d.property === "transition")) {
      animated.push(selector);
    }
  }
  const sheet = [
    entrances.length > 0
      ? "@keyframes emvb-fade{from{opacity:0}to{opacity:1}}@keyframes emvb-fade-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes emvb-fade-down{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}@keyframes emvb-slide-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@keyframes emvb-slide-down{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}@keyframes emvb-scale{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:none}}"
      : "",
    entrances.length > 0 && motion ? MOTION_KEYFRAMES : "",
    entrances.length > 0 && loops ? LOOP_KEYFRAMES : "",
    block(".emvb-root", variables),
    defaultsCss,
    backgroundVideo
      ? ".emvb-has-bg-video{position:relative;overflow:hidden}.emvb-bg-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none}.emvb-has-bg-video>:not(.emvb-bg-video){position:relative;z-index:1}" +
        // W-802: the overlay above the video, under the content; reset so a nested box's own wins.
        '.emvb-has-bg-video{--emvb-bg-overlay:none}.emvb-has-bg-video::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:var(--emvb-bg-overlay)}' +
        // W-801: a looping video kept playing for visitors who ask for reduced motion.
        "@media (prefers-reduced-motion: reduce){.emvb-bg-video{display:none}}"
      : "",
    baseRulesFor(usedTypes, baseCss),
    ...classes,
    ...locals,
    ...localRules
      .filter((rule) => rule.query && rule.query.length > 0 && rule.queryMin)
      .map(
        (rule) =>
          `@container (min-width:${rule.queryMin}px){${block(`.emvb-e-${rule.id}`, rule.query ?? [])}}`,
      ),
    at(DEVICE_MEDIA.wide, "wide"),
    at(DEVICE_MEDIA.laptop, "laptop"),
    at(DEVICE_MEDIA.tablet, "tablet"),
    at(DEVICE_MEDIA.mobile, "mobile"),
    hide(["desktop", "laptop"], DEVICE_MEDIA.hideDesktop),
    hide(["desktop"], DEVICE_MEDIA.hideDesktopOnly),
    hide(["desktop", "laptop"], DEVICE_MEDIA.hideDesktopNotWide, "notWide"),
    hide(["desktop"], DEVICE_MEDIA.hideDesktopOnlyNotWide, "notWide"),
    hide([], DEVICE_MEDIA.wide, "only"),
    hide(["laptop"], DEVICE_MEDIA.hideLaptop),
    hide(["tablet"], DEVICE_MEDIA.hideTablet),
    hide(["mobile"], DEVICE_MEDIA.hideMobile),
    animated.length > 0
      ? `@media (prefers-reduced-motion: reduce){${animated.join(",")}{transition:none}}`
      : "",
    entrances.length > 0
      ? `@media (prefers-reduced-motion: reduce){${entrances.join(",")}{animation:none}}`
      : "",
  ].join("");
  // W-952: list marker colour and size, and numbered steps, only on pages that use them, so
  // every page saved before them keeps the exact CSS it had.
  return [
    sheet,
    sheet.includes("--emvb-marker-") ? LIST_MARKER_CSS : "",
    listSteps ? LIST_STEPS_CSS : "",
    sheet.includes("--emvb-mark-") ? MARK_CSS : "",
  ].join("");
}

/** Markers take the list's marker colour and size when it sets them (W-952). */
const LIST_MARKER_CSS =
  ".emvb-list>li::marker{color:var(--emvb-marker-color,inherit);font-size:var(--emvb-marker-size,inherit)}";

/**
 * Numbered steps (W-952): each number in a circle beside its item, counted by the list's own
 * `list-item` counter so Start at still applies.
 */
const LIST_STEPS_CSS =
  ".emvb-list--steps{list-style:none;padding-inline-start:0;display:flex;flex-direction:column;gap:0.75em}" +
  ".emvb-list--steps>li{display:flex;align-items:flex-start;gap:0.75em;counter-increment:list-item}" +
  ".emvb-list--steps>li::before{content:counter(list-item);flex:none;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:2em;height:2em;padding:0 0.4em;border-radius:999px;border:2px solid var(--emvb-marker-color,currentColor);color:var(--emvb-marker-color,currentColor);font-size:var(--emvb-marker-size,1em);font-weight:600;line-height:1}";
