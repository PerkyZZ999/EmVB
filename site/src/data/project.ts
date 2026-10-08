/**
 * Facts the site quotes about the package, read from the plugin source so they can't drift.
 */
import { PACKAGE_NAME, PLUGIN_VERSION } from "../../../packages/emvb/src/constants.ts";
import { MAX_DESIGN_BYTES, MAX_LAYOUT_BYTES } from "../../../packages/emvb/src/core/limits.ts";
import { LAYOUT_SCHEMA_VERSION } from "../../../packages/emvb/src/core/schema/layout.ts";

export const project = {
  packageName: PACKAGE_NAME,
  version: PLUGIN_VERSION,
  schemaVersion: LAYOUT_SCHEMA_VERSION,
  layoutLimitKb: MAX_LAYOUT_BYTES / 1024,
  designLimitKb: MAX_DESIGN_BYTES / 1024,
  npmUrl: `https://www.npmjs.com/package/${PACKAGE_NAME}`,
  repoUrl: "https://github.com/PerkyZZ999/EmVB",
  installGuideUrl:
    "https://github.com/PerkyZZ999/EmVB/blob/main/docs/guides/install-in-a-host-site.md",
} as const;
