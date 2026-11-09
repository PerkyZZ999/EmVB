import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderPage, validateDesign, validateLayout, type Layout } from "../../src/core/index.ts";

const CASES_DIR = join(import.meta.dir, "cases");
export const EXPECTED_DIR = join(import.meta.dir, "expected");

type Case = {
  design: unknown;
  layout: unknown;
  dynamic?: Record<string, unknown> & {
    sectionTemplates?: Record<string, unknown>;
    loopTemplates?: Record<string, unknown>;
  };
};

export const caseNames = (): string[] =>
  readdirSync(CASES_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .toSorted();

function layoutOf(raw: unknown, what: string): Layout {
  const result = validateLayout(raw);
  if (!result.ok) throw new Error(`${what}: ${JSON.stringify(result.issues.slice(0, 3))}`);
  return result.layout;
}

const templates = (map: Record<string, unknown> | undefined, what: string) =>
  map
    ? Object.fromEntries(
        Object.entries(map).map(([id, raw]) => [id, layoutOf(raw, `${what} ${id}`)]),
      )
    : undefined;

/** A stored 0.x page read the way hosts read it (upgrade, validate), then rendered publicly. */
export function renderCase(name: string): { html: string; css: string } {
  const input = JSON.parse(readFileSync(join(CASES_DIR, `${name}.json`), "utf8")) as Case;
  const design = validateDesign(input.design);
  if (!design.ok) throw new Error(`${name} design: ${JSON.stringify(design.issues.slice(0, 3))}`);
  const { sectionTemplates, loopTemplates, ...rest } = input.dynamic ?? {};
  const dynamic = {
    ...rest,
    ...(sectionTemplates ? { sectionTemplates: templates(sectionTemplates, "section") } : {}),
    ...(loopTemplates ? { loopTemplates: templates(loopTemplates, "loop item") } : {}),
  };
  const { html, css } = renderPage(layoutOf(input.layout, name), design.design, {
    scope: name,
    ...(input.dynamic ? { dynamic } : {}),
  });
  return { html, css };
}
