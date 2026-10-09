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
import { DEVICE_MEDIA, type PopupDevice } from "../theme/popup-rules.ts";

export type CssInput = {
  design: DesignSystem;
  usedTypes: ReadonlySet<string>;
  baseCss: ReadonlyMap<string, string>;
  localRules: ReadonlyArray<{
    id: string;
    declarations: Declaration[];
    states?: StateDeclarations;
    /** Tablet and mobile overrides (W-096). Desktop stays in `declarations`. */
    tablet?: Declaration[];
    mobile?: Declaration[];
    hiddenOn?: readonly PopupDevice[];
  }>;
  /** Editor canvas only: repeat each state rule for `[data-emvb-state="<state>"]` (W-089). */
  previewStates?: boolean;
  /** When a node rendered a background video (W-110). */
  backgroundVideo?: boolean;
  /**
   * Editor canvas only (W-116): the device the canvas previews. Device rules then follow this
   * device instead of the frame's width, so the Desktop canvas never picks up tablet styles in a
   * narrow window. Without it, the rules sit in their media queries as usual.
   */
  previewDevice?: PopupDevice;
};

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
function tagDefaultCss(design: DesignSystem): string {
  const defaults = design.defaults;
  if (!defaults) return "";
  let css = "";
  for (const tag of DEFAULT_STYLE_TAGS) {
    const style = defaults[tag];
    if (!style) continue;
    const { declarations } = styleDeclarations(style);
    css += block(`:where(.emvb-root) ${tag}`, declarations);
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

/**
 * Cascade order (R-021 / W-030 / W-089): variables on `.emvb-root`, base CSS, shared
 * `.emvb-k-<id>` class rules, then local `.emvb-e-<id>` (local wins). Each selector's `:hover`,
 * `:focus-visible` and `:active` rules follow its base rule in that order, so a state beats Normal,
 * local states beat class states, and Active beats Hover when both apply. Transitions sit on the
 * base rule, and one closing `prefers-reduced-motion: reduce` block turns them all off.
 */
export function generateCss({
  design,
  usedTypes,
  baseCss,
  localRules,
  previewStates = false,
  backgroundVideo = false,
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
              // W-210: a device that sets one background layer keeps the layers it inherits.
              tablet: styleDeclarations(withInheritedLayers(cls.devices?.tablet, cls.style ?? {}))
                .declarations,
              mobile: styleDeclarations(
                withInheritedLayers(cls.devices?.mobile, { ...cls.style, ...cls.devices?.tablet }),
              ).declarations,
              hiddenOn: cls.hiddenOn,
            },
          ]
        : [];
    }),
    ...localRules.map((rule) => ({
      selector: `.emvb-e-${rule.id}`,
      tablet: rule.tablet ?? [],
      mobile: rule.mobile ?? [],
      hiddenOn: rule.hiddenOn,
    })),
  ];
  /** A device block: in its media query, or, for a previewed device, on or off outright. */
  const forDevices = (devices: readonly PopupDevice[], query: string, body: string) => {
    if (!body) return "";
    if (previewDevice === undefined) return `@media ${query}{${body}}`;
    return devices.includes(previewDevice) ? body : "";
  };
  const at = (query: string, which: "tablet" | "mobile") =>
    forDevices(
      which === "tablet" ? ["tablet", "mobile"] : ["mobile"],
      query,
      responsive.map((rule) => block(rule.selector, rule[which])).join(""),
    );
  const hide = (device: PopupDevice, query: string) => {
    const selectors = responsive
      .filter((rule) => rule.hiddenOn?.includes(device))
      .map((rule) => rule.selector);
    return forDevices(
      [device],
      query,
      selectors.length > 0 ? `${selectors.join(",")}{display:none}` : "",
    );
  };
  for (const rule of responsive) {
    if (
      !entrances.includes(rule.selector) &&
      [...rule.tablet, ...rule.mobile].some((d) => d.property === "animation")
    ) {
      entrances.push(rule.selector);
    }
  }
  return [
    entrances.length > 0
      ? "@keyframes emvb-fade{from{opacity:0}to{opacity:1}}@keyframes emvb-fade-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes emvb-fade-down{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}@keyframes emvb-slide-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@keyframes emvb-slide-down{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:none}}@keyframes emvb-scale{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:none}}"
      : "",
    block(".emvb-root", variables),
    tagDefaultCss(design),
    backgroundVideo
      ? ".emvb-has-bg-video{position:relative;overflow:hidden}.emvb-bg-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none}.emvb-has-bg-video>:not(.emvb-bg-video){position:relative;z-index:1}"
      : "",
    ...[...usedTypes].toSorted().map((type) => baseCss.get(type) ?? ""),
    ...classes,
    ...locals,
    at(DEVICE_MEDIA.tablet, "tablet"),
    at(DEVICE_MEDIA.mobile, "mobile"),
    hide("desktop", DEVICE_MEDIA.hideDesktop),
    hide("tablet", DEVICE_MEDIA.hideTablet),
    hide("mobile", DEVICE_MEDIA.hideMobile),
    animated.length > 0
      ? `@media (prefers-reduced-motion: reduce){${animated.join(",")}{transition:none}}`
      : "",
    entrances.length > 0
      ? `@media (prefers-reduced-motion: reduce){${entrances.join(",")}{animation:none}}`
      : "",
  ].join("");
}
