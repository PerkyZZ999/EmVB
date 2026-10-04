/**
 * Every number here is quoted from the project's validation records. Keep the source
 * next to the figure, and update both together.
 */
export interface Metric {
  value: string;
  label: string;
  source: string;
}

export const metrics: Metric[] = [
  {
    value: "0.33 ms",
    label: "median server render of a 300-node page, p95 0.65 ms, against a 20 ms budget",
    source: "bench:render, 200 runs (N-002)",
  },
  {
    value: "943 B",
    label: "of gzipped CSS for that 300-node page, against a 15 KB budget",
    source: "W-040 performance check",
  },
  {
    value: "1714",
    label: "Bun tests passing, none failing, at the latest full check",
    source: "bun run check, W-101",
  },
  {
    value: "868 / 868",
    label: "seeded bugs caught by the test suite in the last full seeded-bug run",
    source: "bun run seeded-bugs, W-091",
  },
];

export const safeguards = [
  {
    title: "Validated on save and on read",
    body: "Every layout is checked against the schema before it is stored and again before it renders. Pages are capped at 512 KB and the design at 256 KB.",
  },
  {
    title: "Sanitised output",
    body: "The HTML serializer escapes by construction, links pass a protocol allowlist and inline SVG is sanitised. The editor canvas is a sandboxed iframe with scripts off.",
  },
  {
    title: "Role-checked writes",
    body: "Every write route needs an editor role or above. Logs carry ids and error codes, never page content.",
  },
  {
    title: "Accessible by default",
    body: "Focus styles target :focus-visible, accordions are native <details>, and entrance animations and transitions stop under prefers-reduced-motion.",
  },
] as const;
