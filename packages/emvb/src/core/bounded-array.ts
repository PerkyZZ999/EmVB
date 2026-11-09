import { z } from "zod";

/**
 * D-070 (GHSA-mrhx-c7xc-m3w5): zod before 4.6.6 parses every element of an array, collecting an
 * issue for each bad one, before `.max()` is checked. A 10 MB request of bad items held about 2 GB.
 * EmDash 1.4 pins zod 4.5.4, and it parses EmVB's route and MCP tool inputs before any EmVB code
 * runs, so every array in such an input checks its length first and stops with a single issue.
 * JSON Schema output (MCP `tools/list`) is the plain array, with minItems/maxItems.
 */
export function boundedArray<T extends z.ZodType>(item: T, max: number, min = 0) {
  return z
    .unknown()
    .check((ctx) => {
      const value = ctx.value;
      if (!Array.isArray(value)) return;
      if (value.length > max || value.length < min) {
        ctx.issues.push({
          code: value.length > max ? "too_big" : "too_small",
          origin: "array",
          ...(value.length > max ? { maximum: max } : { minimum: min }),
          inclusive: true,
          input: value,
          message:
            value.length > max
              ? `Too many items: at most ${max}.`
              : `Too few items: at least ${min}.`,
        } as never);
      }
    })
    .pipe(z.array(item).min(min).max(max));
}
