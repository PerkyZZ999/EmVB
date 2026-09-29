import { z } from "zod";
import * as schemas from "../../src/core/schema/layout.ts";

/** JSON Schema of every exported layout schema, keys in declaration order. */
export function nodeShapes(): Record<string, string> {
  const shapes: Record<string, string> = {};
  for (const [name, value] of Object.entries(schemas)) {
    if (value instanceof z.ZodType) {
      shapes[name] = JSON.stringify(z.toJSONSchema(value, { unrepresentable: "any", io: "input" }));
    }
  }
  return shapes;
}
