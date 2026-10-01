export * from "./limits.ts";
export {
  LAYOUT_SCHEMA_VERSION,
  Layout,
  type LayoutNode,
  type UnknownNode,
  ContainerNode,
  DivBlockNode,
  FlexboxNode,
  SvgNode,
  TabPanelNode,
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
  isDivBlockNode,
  isFlexboxNode,
  isLayoutParentNode,
  isTabsNode,
  isTabPanelNode,
  isFormNode,
  isLoopNode,
  isParentNode,
  isFormFieldType,
  FORM_FIELD_TYPES,
  isHeadingNode,
  isUnknownNode,
  FormNode,
  LoopNode,
  TextInputNode,
  TextareaNode,
  SelectNode,
  CheckboxNode,
  RadioNode,
  SubmitNode,
  PostTitleNode,
  PostExcerptNode,
  PostContentNode,
  PostImageNode,
  PostLinkNode,
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
export {
  StyleProps,
  StyleStates,
  ColorValue,
  Length,
  LengthValue,
  VariableRef,
} from "./schema/style.ts";
export { STYLE_STATES, type StyleStateName } from "./schema/state-names.ts";
export {
  upgradeLayout,
  isNewerThanSupported,
  LAYOUT_MIGRATIONS,
  DESIGN_MIGRATIONS,
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
  FontVariable,
  LengthVariable,
} from "./schema/design.ts";
export {
  findVariableUsages,
  findVariableUsagesInDesign,
  clearVariableRefs,
  removeVariable,
  renameVariable,
  deleteVariable,
  refMatchesKind,
  type VariableKind,
  type VariableUsage,
} from "./design/variables.ts";
export { resolveCascade } from "./design/cascade.ts";
export {
  findMissingRequiredFields,
  layoutHasForm,
  type MissingRequiredField,
} from "./forms/binding.ts";
export {
  fieldsOf,
  fieldByName,
  type PublicFormDefinition,
  type PublicFormField,
  type FormDefinitions,
} from "./forms/definition.ts";
export { FORMS_SUBMIT_PATH } from "./render/index.ts";

export {
  moveClassId,
  addClassId,
  removeClassId,
  findClassUsages,
  clearClassRefs,
  duplicateClass,
  renameClass,
  patchClassStyle,
  replaceClassId,
} from "./design/classes.ts";
export { hasStateStyles, patchClassState, patchStates } from "./design/states.ts";
export {
  renderPage,
  type RenderMode,
  type RenderResult,
  type RenderWarning,
} from "./render/index.ts";
export { serialize, isAllowedTag, isAllowedAttr, type VNode } from "./render/vnode.ts";
export { escapeAttr, escapeText } from "./sanitize/escape.ts";
export { sanitizeHref } from "./sanitize/href.ts";
export { isSafeFontStack } from "./sanitize/css.ts";
export { sanitizeMediaUrl } from "./sanitize/media-url.ts";
export { sanitizeSvgMarkup, isSafeSvgMarkup } from "./sanitize/svg.ts";
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
  withFreshIds,
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

export {
  CONDITIONS_SCHEMA_VERSION,
  MAX_CONDITION_RULES,
  defaultConditions,
  defaultConditionsFor,
  validateConditions,
  matchesConditions,
  conditionSpecificity,
  conditionsSpecificity,
  themePartLocationApplies,
  contentPartTypeForContext,
  pickThemePartWinner,
  listMatchingThemeParts,
  type ConditionRule,
  type ConditionsDoc,
  type ConditionsValidation,
  type ThemeRequestContext,
  type ThemePartCandidate,
} from "./theme/conditions.ts";

export {
  THEME_PART_TYPES,
  CONTENT_THEME_PART_TYPES,
  ITEM_THEME_PART_TYPES,
  OVERLAY_THEME_PART_TYPES,
  THEME_PART_TYPE_LABELS,
  isThemePartType,
  parseThemePartType,
  isContentThemePartType,
  isItemThemePartType,
  isOverlayThemePartType,
  type ThemePartType,
  type ContentThemePartType,
  type ItemThemePartType,
  type OverlayThemePartType,
} from "./theme/part-types.ts";

export {
  TRIGGERS_SCHEMA_VERSION,
  MAX_POPUP_TRIGGERS,
  defaultTriggers,
  validateTriggers,
  isSafeClickSelector,
  type PopupOpenTrigger,
  type PopupAdvancedRules,
  type TriggersDoc,
  type TriggersValidation,
} from "./theme/triggers.ts";

export {
  TRIGGER_LIMITS,
  clampScrollPercent,
  deviceForWidth,
  matchesPopupDevices,
  withinShowTimes,
  type PopupDevice,
} from "./theme/popup-rules.ts";

export { POPUP_CHROME_CSS, wrapPopupMarkup, type PopupPublicConfig } from "./theme/popup-markup.ts";

export {
  SAMPLE_POST,
  portableTextToVNodes,
  collectLoopItemPartIds,
  resolvePostForRender,
  resolvePostsForLoop,
  type ThemePostFields,
  type ThemeDynamicData,
} from "./theme/dynamic.ts";

export { layoutHasTabs } from "./tabs/presence.ts";
export {
  CLIPBOARD_FORMAT,
  CLIPBOARD_VERSION,
  CLIP_REASONS,
  applyStyle,
  clipStyle,
  droppedNotice,
  elementClip,
  encodeClip,
  pasteNode,
  pastePlace,
  peekClipKind,
  prepareElement,
  prepareStyle,
  readClip,
  styleClip,
  styleOf,
  type Clip,
  type ClipEnvelope,
  type CopiedStyle,
  type Dropped,
  type PasteMode,
  type ReadClip,
} from "./clipboard.ts";
