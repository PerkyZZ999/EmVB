import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renderPage,
  validateDesign,
  validateLayout,
  type DesignSystem,
  type Layout,
} from "../../src/core/index.ts";

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

const readCase = (name: string) =>
  JSON.parse(readFileSync(join(CASES_DIR, `${name}.json`), "utf8")) as Case;

/** The schema version the case was stored at, before any upgrade. */
export function storedVersion(name: string): unknown {
  const { layout } = readCase(name) as { layout: { schemaVersion?: unknown } };
  return layout.schemaVersion;
}

/** A stored 0.x case read the way hosts read it (upgrade, validate); throws if it is rejected. */
export function readStoredCase(name: string) {
  const input = readCase(name);
  const design = validateDesign(input.design);
  if (!design.ok) throw new Error(`${name} design: ${JSON.stringify(design.issues.slice(0, 3))}`);
  const { sectionTemplates, loopTemplates, ...rest } = input.dynamic ?? {};
  const sections = templates(sectionTemplates, "section");
  const loops = templates(loopTemplates, "loop item");
  return {
    design: design.design as DesignSystem,
    layout: layoutOf(input.layout, name),
    templates: [...Object.values(sections ?? {}), ...Object.values(loops ?? {})],
    dynamic: input.dynamic
      ? {
          ...rest,
          ...(sections ? { sectionTemplates: sections } : {}),
          ...(loops ? { loopTemplates: loops } : {}),
        }
      : undefined,
  };
}

/** A stored 0.x page read the way hosts read it (upgrade, validate), then rendered publicly. */
export function renderCase(name: string): { html: string; css: string } {
  const { design, layout, dynamic } = readStoredCase(name);
  const { html, css } = renderPage(layout, design, {
    scope: name,
    ...(dynamic ? { dynamic } : {}),
  });
  return { html, css };
}
