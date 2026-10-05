// N-002: renderPage on a 300-node layout must take ≤ 20 ms (median, Bun runtime, measured locally).
import { renderPage, type DesignSystem, type Layout } from "../packages/emvb/src/core/index.ts";

export const BUDGET_MS = 20;
export const ITERATIONS = 200;

export function benchLayout(nodes = 300): Layout {
  type Node = Layout["root"]["children"][number];
  const containers: Node[] = [];
  let count = 1;
  while (count < nodes) {
    const headings: Node[] = [];
    for (let h = 0; h < 4 && count + 1 + headings.length < nodes; h++) {
      const id = `h${String(count + 1 + h).padStart(7, "0")}`;
      headings.push({
        id,
        type: "heading",
        props: { text: `Heading <${id}> & "quotes"`, level: 2 },
        style: { color: { var: "brand" } },
      });
    }
    containers.push({
      id: `c${String(count).padStart(7, "0")}`,
      type: "container",
      props: {},
      style: { flexDirection: "row", gap: { value: 12, unit: "px" } },
      children: headings,
    });
    count += 1 + headings.length;
  }
  return {
    schemaVersion: 11,
    root: { id: "root0001", type: "container", props: {}, children: containers },
  };
}

const design: DesignSystem = {
  schemaVersion: 11,
  variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
};

/** Runs `run` `warmup` times untimed, then `iterations` timed runs; returns the times in ms, ascending. */
export function sortedTimes(run: () => unknown, warmup: number, iterations: number): number[] {
  for (let i = 0; i < warmup; i++) run();
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run();
    times.push(performance.now() - start);
  }
  return times.toSorted((a, b) => a - b);
}

const at = (sorted: number[], fraction: number) =>
  sorted[Math.floor(sorted.length * fraction)] ?? Number.NaN;

export function benchRenderMedian(iterations = 40): number {
  const layout = benchLayout();
  return at(
    sortedTimes(() => renderPage(layout, design), 5, iterations),
    0.5,
  );
}

if (import.meta.main) {
  const layout = benchLayout();
  const sorted = sortedTimes(() => renderPage(layout, design), 20, ITERATIONS);
  const median = at(sorted, 0.5);
  const p95 = at(sorted, 0.95);
  const html = renderPage(layout, design).html.length;
  process.stdout.write(
    `renderPage, 300 nodes, ${ITERATIONS} runs: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms (budget ${BUDGET_MS} ms, ${html} bytes of HTML)\n`,
  );
  if (!(median <= BUDGET_MS)) process.exit(1);
}
