import { project } from "./project";

/**
 * Measured on 2026-11-11 at release 1.1.0 (W-967): `bun run bench:render`, `bun run bench:css`,
 * `bun run test` and the seed count in scripts/seeded-bugs.json. Re-measure before changing one.
 */
export interface Metric {
  value: string;
  unit?: string;
  label: string;
  source: string;
}

export const metrics: Metric[] = [
  {
    value: "1.6",
    unit: "ms",
    label: "median server render of a 300-element page, p95 2.6 ms, against a 20 ms budget",
    source: "bun run bench:render, 200 runs",
  },
  {
    value: "1,181",
    unit: "B",
    label: "of gzipped CSS for that 300-element page, against a 15 KB budget",
    source: "bun run bench:css",
  },
  {
    value: "4,335",
    label: "unit and component tests passing, none failing",
    source: "bun run test",
  },
  {
    value: "2,729",
    label: "seeded bugs on record, each one proven to make a test fail",
    source: "scripts/seeded-bugs.json",
  },
];

export const safeguards = [
  {
    title: "Validated on save and on read",
    body: `Every layout is checked against the schema before it is stored and again before it renders. Pages are capped at ${project.layoutLimitKb} KB and the design at ${project.designLimitKb} KB.`,
  },
  {
    title: "Sanitised output",
    body: "The HTML serializer escapes by construction, links pass a protocol allowlist and SVG is sanitised. The editor canvas is a sandboxed iframe with scripts off.",
  },
  {
    title: "Role-checked writes",
    body: "Every write route needs an editor role or above. Logs carry ids and error codes, never page content.",
  },
  {
    title: "Accessible by default",
    body: "Focus styles target :focus-visible, accordions are native <details>, and animations stop under prefers-reduced-motion.",
  },
];
