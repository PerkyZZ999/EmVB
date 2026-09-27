export type LayoutSummary = { nodes: number; schemaVersion: number | undefined };

/** Counts nodes without trusting the input shape (used for read-only summaries). */
export function summarizeLayout(input: unknown): LayoutSummary | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const doc = input as { schemaVersion?: unknown; root?: unknown };
  const schemaVersion = typeof doc.schemaVersion === "number" ? doc.schemaVersion : undefined;
  let nodes = 0;
  const stack: unknown[] = doc.root === undefined ? [] : [doc.root];
  while (stack.length > 0 && nodes <= 100_000) {
    const node = stack.pop();
    if (typeof node !== "object" || node === null) continue;
    nodes++;
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) stack.push(...children);
  }
  return { nodes, schemaVersion };
}
