import type { DesignSystem } from "../schema/design.ts";
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

export type CssInput = {
  design: DesignSystem;
  usedTypes: ReadonlySet<string>;
  baseCss: ReadonlyMap<string, string>;
  localRules: ReadonlyArray<{
    id: string;
    declarations: Declaration[];
    states?: StateDeclarations;
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
 * local states beat class states, and Active beats Hover when both apply.
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
  const classes = (design.classes ?? []).flatMap((cls) => {
    const className = styleClassName(cls.id);
    return className
      ? rules(
          `.${className}`,
          styleDeclarations(cls.style).declarations,
          stateDeclarations(cls.states).states,
        )
      : [];
  });
  return [
    block(".emvb-root", variables),
    ...[...usedTypes].toSorted().map((type) => baseCss.get(type) ?? ""),
    ...classes,
    ...localRules.flatMap((rule) =>
      rules(`.emvb-e-${rule.id}`, rule.declarations, rule.states ?? {}),
    ),
  ].join("");
}
