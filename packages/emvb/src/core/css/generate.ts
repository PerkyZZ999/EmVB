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
};

/** Focus is keyboard focus (W-089): `:focus-visible`, never `:focus`. */
const STATE_PSEUDO: Readonly<Record<StyleStateName, string>> = {
  hover: ":hover",
  focus: ":focus-visible",
  active: ":active",
};

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
}: CssInput): string {
  const { colors, fonts, fontSizes, spacings } = design.variables;
  const variables = [
    ...declare(colors, colorVariableName, (color) => safe(color.value)),
    ...declare(fonts, fontVariableName, (font) => fontStack(font.value)),
    ...declare(fontSizes, fontSizeVariableName, (size) => lengthCss(size.value)),
    ...declare(spacings, spacingVariableName, (space) => lengthCss(space.value)),
  ];
  const animated: string[] = [];
  const entrances: string[] = [];
  const rules = (selector: string, declarations: Declaration[], states: StateDeclarations) => [
    block(selector, declarations),
    ...STYLE_STATES.map((state) =>
      block(
        previewStates
          ? `${selector}${STATE_PSEUDO[state]},${selector}[data-emvb-state="${state}"]`
          : `${selector}${STATE_PSEUDO[state]}`,
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
              tablet: styleDeclarations(cls.devices?.tablet).declarations,
              mobile: styleDeclarations(cls.devices?.mobile).declarations,
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
  const at = (query: string, which: "tablet" | "mobile") => {
    const body = responsive.map((rule) => block(rule.selector, rule[which])).join("");
    return body ? `@media ${query}{${body}}` : "";
  };
  const hide = (device: PopupDevice, query: string) => {
    const selectors = responsive
      .filter((rule) => rule.hiddenOn?.includes(device))
      .map((rule) => rule.selector);
    return selectors.length > 0 ? `@media ${query}{${selectors.join(",")}{display:none}}` : "";
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
