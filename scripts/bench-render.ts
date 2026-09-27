// N-002: renderPage on a 300-node layout must take ≤ 20 ms (median, Bun runtime, measured locally).
import { renderPage, type DesignSystem, type Layout } from "../packages/emvb/src/core/index.ts";

const BUDGET_MS = 20;
const ITERATIONS = 200;

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
    schemaVersion: 1,
    root: { id: "root0001", type: "container", props: {}, children: containers },
  };
}

const design: DesignSystem = {
  schemaVersion: 1,
  variables: { colors: [{ id: "brand", name: "Brand", value: "#0055ff" }] },
};

if (import.meta.main) {
  const layout = benchLayout();
  for (let i = 0; i < 20; i++) renderPage(layout, design);
  const times: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    renderPage(layout, design);
    times.push(performance.now() - start);
  }
  const sorted = times.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Number.NaN;
  const html = renderPage(layout, design).html.length;
  process.stdout.write(
    `renderPage, 300 nodes, ${ITERATIONS} runs: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms (budget ${BUDGET_MS} ms, ${html} bytes of HTML)\n`,
  );
  if (!(median <= BUDGET_MS)) process.exit(1);
}
