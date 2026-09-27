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

function lengthCss(value: { value: number; unit: string }): string | undefined {
  const out = `${value.value}${value.unit}`;
  return isSafeCssValue(out) ? out : undefined;
}

/**
 * Cascade order (R-021 / W-030): variables on `.emvb-root`, base CSS, shared
 * `.emvb-k-<id>` class rules, then local `.emvb-e-<id>` (local wins).
 */
export function generateCss({ design, usedTypes, baseCss, localRules }: CssInput): string {
  const variables: Declaration[] = [];
  for (const color of design.variables.colors) {
    const name = colorVariableName(color.id);
    if (name && isSafeCssValue(color.value)) variables.push({ property: name, value: color.value });
  }
  for (const font of design.variables.fonts ?? []) {
    const name = fontVariableName(font.id);
    if (name && isSafeCssValue(font.value)) variables.push({ property: name, value: font.value });
  }
  for (const size of design.variables.fontSizes ?? []) {
    const name = fontSizeVariableName(size.id);
    const value = lengthCss(size.value);
    if (name && value) variables.push({ property: name, value });
  }
  for (const space of design.variables.spacings ?? []) {
    const name = spacingVariableName(space.id);
    const value = lengthCss(space.value);
    if (name && value) variables.push({ property: name, value });
  }
  const parts = [block(".emvb-root", variables)];
  for (const type of [...usedTypes].toSorted()) parts.push(baseCss.get(type) ?? "");
  for (const cls of design.classes ?? []) {
    const className = styleClassName(cls.id);
    if (!className) continue;
    const { declarations } = styleDeclarations(cls.style);
    parts.push(block(`.${className}`, declarations));
  }
  for (const rule of localRules) parts.push(block(`.emvb-e-${rule.id}`, rule.declarations));
  return parts.join("");
}
