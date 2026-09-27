// N-002: EmVB-generated CSS for the demo/success page ≤ 15 KB gzipped; 0 EmVB JS (checked in e2e).
import { gzipSync } from "node:zlib";
import { emptyDesign, renderPage } from "../packages/emvb/src/core/index.ts";
import { successSignalLayout } from "../packages/emvb/src/core/forms/success-layout.ts";
import { benchLayout } from "./bench-render.ts";

export const CSS_GZIP_BUDGET = 15 * 1024;

export function cssGzipBytes(css: string): number {
  return gzipSync(Buffer.from(css, "utf8")).byteLength;
}

export function successPageCss(): string {
  const layout = successSignalLayout({
    formId: "form-budget",
    colorVar: "brand",
    classId: "hero",
    imageSrc: "/hero.png",
    heading: "Budget page",
  });
  const design = {
    ...emptyDesign(),
    variables: { colors: [{ id: "brand", name: "Brand", value: "#112233" }] },
    classes: [{ id: "hero", name: "Hero", style: { color: "#abcdef" } }],
  };
  return renderPage(layout, design).css;
}

export function densePageCss(): string {
  return renderPage(benchLayout(300), {
    ...emptyDesign(),
    variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
  }).css;
}

if (import.meta.main) {
  const success = cssGzipBytes(successPageCss());
  const dense = cssGzipBytes(densePageCss());
  process.stdout.write(
    `CSS gzip: success ${success} B, 300-node ${dense} B (budget ${CSS_GZIP_BUDGET} B)\n`,
  );
  if (success > CSS_GZIP_BUDGET || dense > CSS_GZIP_BUDGET) process.exit(1);
}
