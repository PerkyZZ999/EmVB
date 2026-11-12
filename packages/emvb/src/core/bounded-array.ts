import { z } from "zod";

/**
 * D-070 (GHSA-mrhx-c7xc-m3w5): zod before 4.6.6 parses every element of an array, collecting an
 * issue for each bad one, before `.max()` is checked. A 10 MB request of bad items held about 2 GB.
 * EmDash 1.4 pins zod 4.5.4, and it parses EmVB's route and MCP tool inputs before any EmVB code
 * runs, so every array in such an input checks its length first and stops with a single issue.
 * JSON Schema output (MCP `tools/list`) is the plain array, with minItems/maxItems.
 */
export function boundedArray<T extends z.ZodType>(item: T, max: number, min = 0) {
  // S-03: a transform in front (not a check) keeps the JSON Schema the plain array for input
  // and output alike, so the published layout schemas are unchanged.
  const schema = z
    .transform((value: unknown, ctx) => {
      if (Array.isArray(value) && value.length > max) {
        ctx.issues.push({
          code: "too_big",
          origin: "array",
          maximum: max,
          inclusive: true,
          input: value,
          message: `Too many items: at most ${max}.`,
        } as never);
        return z.NEVER;
      }
      return value;
    })
    .pipe((min > 0 ? z.array(item).min(min) : z.array(item)).max(max));
  // A transform counts as an optional input, which would make a tuple slot holding this array
  // optional in the JSON Schema; the array itself is required.
  // oxlint-disable-next-line no-underscore-dangle -- zod keeps the flag on its internals
  Object.defineProperty(schema._zod, "optin", { value: undefined, configurable: true });
  return schema;
}
