import type { DesignSystem } from "../schema/design.ts";
import {
  colorVariableName,
  fontSizeVariableName,
  fontVariableName,
  isSafeCssValue,
  spacingVariableName,
  styleClassName,
  styleDeclarations,
  type Declaration,
} from "../sanitize/css.ts";

export type CssInput = {
  design: DesignSystem;
  usedTypes: ReadonlySet<string>;
  baseCss: ReadonlyMap<string, string>;
  localRules: ReadonlyArray<{ id: string; declarations: Declaration[] }>;
};

const block = (selector: string, declarations: Declaration[]) =>
  declarations.length === 0
    ? ""
    : `${selector}{${declarations.map((d) => `${d.property}:${d.value}`).join(";")}}`;

const safe = (value: string) => (isSafeCssValue(value) ? value : undefined);

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
 * Cascade order (R-021 / W-030): variables on `.emvb-root`, base CSS, shared
 * `.emvb-k-<id>` class rules, then local `.emvb-e-<id>` (local wins).
 */
export function generateCss({ design, usedTypes, baseCss, localRules }: CssInput): string {
  const { colors, fonts, fontSizes, spacings } = design.variables;
  const variables = [
    ...declare(colors, colorVariableName, (color) => safe(color.value)),
    ...declare(fonts, fontVariableName, (font) => safe(font.value)),
    ...declare(fontSizes, fontSizeVariableName, (size) => lengthCss(size.value)),
    ...declare(spacings, spacingVariableName, (space) => lengthCss(space.value)),
  ];
  const classes = (design.classes ?? []).flatMap((cls) => {
    const className = styleClassName(cls.id);
    return className ? [block(`.${className}`, styleDeclarations(cls.style).declarations)] : [];
  });
  return [
    block(".emvb-root", variables),
    ...[...usedTypes].toSorted().map((type) => baseCss.get(type) ?? ""),
    ...classes,
    ...localRules.map((rule) => block(`.emvb-e-${rule.id}`, rule.declarations)),
  ].join("");
}
