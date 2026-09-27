export * from "./limits.ts";
export {
  LAYOUT_SCHEMA_VERSION,
  Layout,
  type LayoutNode,
  type UnknownNode,
  ContainerNode,
  HeadingNode,
  SpacerNode,
  DividerNode,
  TextNode,
  LabelNode,
  LinkNode,
  ButtonNode,
  ListNode,
  ImageNode,
  IconNode,
  VideoNode,
  NodeId,
  CONTAINER_TAGS,
  TEXT_TAGS,
  KNOWN_ELEMENT_TYPES,
  isContainerNode,
  isHeadingNode,
  isUnknownNode,
} from "./schema/layout.ts";
export {
  type FieldKind,
  type FieldOption,
  type FieldDescriptor,
  type ElementDescriptor,
} from "./schema/descriptors.ts";
export {
  ELEMENTS,
  ELEMENT_DESCRIPTORS,
  defaultElement,
  type ElementType,
} from "./elements/index.ts";
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
export { sanitizeHref } from "./sanitize/href.ts";
export { sanitizeMediaUrl } from "./sanitize/media-url.ts";
export { resolveEmbedUrl, type EmbedTarget } from "./sanitize/embed-url.ts";
export { summarizeLayout, type LayoutSummary } from "./stats.ts";
export {
  findNode,
  updateNode,
  removeNode,
  insertNode,
  nodeIdAtPath,
  newNodeId,
  starterLayout,
  slugify,
  type Removed,
} from "./tree-ops.ts";
export {
  REASONS,
  addNode,
  canDrop,
  duplicateNode,
  firstChild,
  insertionPoint,
  moveDown,
  moveIn,
  moveNode,
  moveOut,
  moveUp,
  nextInOrder,
  parentOf,
  previousInOrder,
  selectionAfterDelete,
  subtreeSize,
  type Allowed,
  type Arranged,
  type DragSource,
  type Place,
  type Refusal,
} from "./arrange.ts";
export {
  BUNDLED_ICONS,
  BUNDLED_ICON_IDS,
  getBundledIcon,
  type BundledIcon,
  type IconPrimitive,
} from "./icons/catalog.ts";
