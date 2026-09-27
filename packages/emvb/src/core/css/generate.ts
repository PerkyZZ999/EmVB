import type { DesignSystem } from "../schema/design.ts";
import { colorVariableName, isSafeCssValue, type Declaration } from "../sanitize/css.ts";

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

/** Cascade order (R-021): variables on `.emvb-root`, base CSS for used types, then local `.emvb-e-<id>` rules. */
export function generateCss({ design, usedTypes, baseCss, localRules }: CssInput): string {
  const variables: Declaration[] = [];
  for (const color of design.variables.colors) {
    const name = colorVariableName(color.id);
    if (name && isSafeCssValue(color.value)) variables.push({ property: name, value: color.value });
  }
  const parts = [block(".emvb-root", variables)];
  for (const type of [...usedTypes].toSorted()) parts.push(baseCss.get(type) ?? "");
  for (const rule of localRules) parts.push(block(`.emvb-e-${rule.id}`, rule.declarations));
  return parts.join("");
}
