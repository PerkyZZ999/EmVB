import { DesignSystem as DesignSystemSchema, DESIGN_SCHEMA_VERSION } from "../schema/design.ts";
import type { DesignSystem } from "../schema/design.ts";
import { DESIGN_MIGRATIONS, upgradeLayout } from "../migrate/index.ts";

/** The design document as JSON. This file is the backup: there is no revision history. */
export function designToJson(design: DesignSystem): string {
  return JSON.stringify(design, null, 2);
}

export type DesignImport = { ok: true; design: DesignSystem } | { ok: false; message: string };

/** Parse an exported design. Older schema versions are upgraded. A newer file is refused. */
export function designFromJson(text: string): DesignImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file is not JSON." };
  }
  const upgraded = upgradeLayout(parsed, DESIGN_MIGRATIONS, DESIGN_SCHEMA_VERSION);
  if (!upgraded.ok) {
    return {
      ok: false,
      message:
        upgraded.reason === "newer-version"
          ? "That design was saved by a newer EmVB."
          : "That file is not an EmVB design document.",
    };
  }
  const result = DesignSystemSchema.safeParse(upgraded.doc);
  if (!result.success) return { ok: false, message: "That file is not an EmVB design document." };
  return { ok: true, design: result.data };
}
