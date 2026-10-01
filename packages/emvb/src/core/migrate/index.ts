import { LAYOUT_SCHEMA_VERSION } from "../schema/layout.ts";

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * v1 → v2 (D-031) marks the W-088 style keys as possible, v2 → v3 (D-032) the W-089
 * `states` and `transition`, v3 → v4 (D-034) background images, gradients and overlays,
 * and v4 → v5 (D-036) per-device styles. Every older value is valid in the newer version.
 */
const unchanged: Migration = (doc) => doc;

/** `LAYOUT_MIGRATIONS[n]` upgrades a version-n layout to version n + 1. Migrations must be pure. */
export const LAYOUT_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: unchanged,
  2: unchanged,
  3: unchanged,
  4: unchanged,
};

/** `DESIGN_MIGRATIONS[n]` upgrades a version-n design document to version n + 1. */
export const DESIGN_MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: unchanged,
  2: unchanged,
  3: unchanged,
  4: unchanged,
};

export type UpgradeResult =
  | { ok: true; doc: Record<string, unknown>; from: number }
  | {
      ok: false;
      reason: "not-an-object" | "missing-version" | "newer-version" | "no-migration";
      version?: number;
    };

function versionOf(doc: unknown): number | undefined {
  if (typeof doc !== "object" || doc === null) return undefined;
  const v = (doc as { schemaVersion?: unknown }).schemaVersion;
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : undefined;
}

export function isNewerThanSupported(doc: unknown, current = LAYOUT_SCHEMA_VERSION): boolean {
  const v = versionOf(doc);
  return v !== undefined && v > current;
}

/** Runs the migration chain up to `current`. Never mutates the input. */
export function upgradeLayout(
  doc: unknown,
  migrations: Readonly<Record<number, Migration>> = LAYOUT_MIGRATIONS,
  current = LAYOUT_SCHEMA_VERSION,
): UpgradeResult {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc))
    return { ok: false, reason: "not-an-object" };
  const from = versionOf(doc);
  if (from === undefined) return { ok: false, reason: "missing-version" };
  if (from > current) return { ok: false, reason: "newer-version", version: from };
  let result = structuredClone(doc) as Record<string, unknown>;
  for (let v = from; v < current; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, reason: "no-migration", version: v };
    result = { ...step(result), schemaVersion: v + 1 };
  }
  return { ok: true, doc: result, from };
}
