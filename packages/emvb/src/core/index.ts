export * from "./limits.ts";
export {
  LAYOUT_SCHEMA_VERSION,
  Layout,
  type LayoutNode,
  ContainerNode,
  HeadingNode,
  NodeId,
} from "./schema/layout.ts";
export { StyleProps, ColorValue, Length, VariableRef } from "./schema/style.ts";
export {
  upgradeLayout,
  isNewerThanSupported,
  LAYOUT_MIGRATIONS,
  type Migration,
  type UpgradeResult,
} from "./migrate/index.ts";
export { validateLayout, byteLength, type LayoutIssue, type LayoutValidation } from "./validate.ts";
