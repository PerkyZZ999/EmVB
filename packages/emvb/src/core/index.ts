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
export {
  validateLayout,
  validateDesign,
  summarizeIssues,
  byteLength,
  type LayoutIssue,
  type LayoutValidation,
  type DesignValidation,
} from "./validate.ts";
export {
  DESIGN_SCHEMA_VERSION,
  DesignSystem,
  ColorVariable,
  emptyDesign,
} from "./schema/design.ts";
export {
  renderPage,
  type RenderMode,
  type RenderResult,
  type RenderWarning,
} from "./render/index.ts";
export { serialize, isAllowedTag, isAllowedAttr, type VNode } from "./render/vnode.ts";
export { escapeAttr, escapeText } from "./sanitize/escape.ts";
export { summarizeLayout, type LayoutSummary } from "./stats.ts";
