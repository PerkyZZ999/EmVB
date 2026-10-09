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
  isSectionNode,
  isParentNode,
  isFormFieldType,
  FORM_FIELD_TYPES,
  FIELD_NAME_PATTERN,
  MAX_FIELD_NAME,
  isHeadingNode,
  isUnknownNode,
  FormNode,
  LoopNode,
  LoopEmptyNode,
  Variant,
  AB_TEST_NAME,
  Audience,
  AUDIENCE_DEVICES,
  LOOP_DISPLAYS,
  LOOP_ORDERS,
  SectionNode,
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
  PaginationNode,
  BIND_SOURCES,
  Binding,
  type BindSource,
  type NodeExtras,
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
  iconHasAdjustableStroke,
  iconHasOwnColors,
  type ElementType,
} from "./elements/index.ts";
export {
  commitPlainText,
  isMultilineText,
  isPlainTextNode,
  plainTextOf,
  withPlainText,
} from "./elements/plain-text.ts";
export {
  StyleProps,
  StyleStates,
  DeviceStyles,
  HiddenOn,
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
export { nestingIssues } from "./nesting.ts";
export {
  DESIGN_SCHEMA_VERSION,
  DEFAULT_STYLE_TAGS,
  DesignSystem,
  ColorVariable,
  emptyDesign,
  FontVariable,
  LengthVariable,
  type DefaultStyleTag,
} from "./schema/design.ts";
export {
  MAX_VARIABLES,
  variableListFull,
  findVariableUsages,
  findVariableUsagesInDesign,
  clearVariableRefs,
  removeVariable,
  renameVariable,
  variableNameTaken,
  variableNameTakenMessage,
  duplicateVariable,
  deleteVariable,
  refMatchesKind,
  type VariableKind,
  type VariableUsage,
} from "./design/variables.ts";
export { classStylesInListOrder, resolveCascade } from "./design/cascade.ts";
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
  cleanClassName,
  MAX_CLASSES,
  moveClassId,
  addClassId,
  removeClassId,
  findClassUsages,
  clearClassRefs,
  duplicateClass,
  moveDesignClass,
  renameClass,
  classNameTaken,
  classNameTakenMessage,
  patchClassStyle,
  replaceClassId,
  hasLocalStyles,
  localToClassRefusal,
  localStylesToClass,
} from "./design/classes.ts";
export { hasStateStyles, patchClassState, patchStates } from "./design/states.ts";
export {
  designFromJson,
  designToJson,
  importLosses,
  MAX_DESIGN_FILE_BYTES,
  type DesignImport,
  type ImportRename,
  uniqueImportNames,
  type ImportLosses,
} from "./design/transfer.ts";
export {
  patchClassDevices,
  patchDeviceStyle,
  toggleHidden,
  type ResponsiveDevice,
} from "./design/devices.ts";
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
export {
  sanitizeSvgMarkup,
  sanitizeSvgReport,
  isSafeSvgMarkup,
  isAllowedSvgImageHref,
  type SvgReport,
} from "./sanitize/svg.ts";
export {
  prepareUploadedSvg,
  UPLOAD_SVG_MAX_BYTES,
  type PreparedSvg,
  type UploadedIcon,
  type UploadedIconItem,
} from "./sanitize/svg-upload.ts";
export { resolveEmbedUrl, type EmbedTarget } from "./sanitize/embed-url.ts";
export { summarizeLayout, type LayoutSummary } from "./stats.ts";
export {
  BINDABLE_FIELDS,
  BIND_SOURCE_LABELS,
  MAX_BOUND_LENGTH,
  POST_BIND_KEYS,
  SITE_BIND_KEYS,
  applyBindings,
  boundValue,
  bindableFields,
  hasBindings,
  layoutUsesSource,
  paramsFromSearch,
  resolveBinding,
  siteBindingValues,
  withBinding,
  type BindKind,
  type BindableField,
  type BindingData,
} from "./data/bindings.ts";
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
  addNodeNear,
  addSectionNear,
  canDrop,
  duplicateNode,
  createVariantB,
  endAbTest,
  defaultTestName,
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
  layoutFromPageTemplate,
  CSS_ID_KEPT,
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
  POPUP_DEVICES,
  DEVICE_MEDIA,
  DEVICE_PREVIEW_PX,
  matchesPopupDevices,
  withinShowTimes,
  type PopupDevice,
} from "./theme/popup-rules.ts";

export { POPUP_CHROME_CSS, wrapPopupMarkup, type PopupPublicConfig } from "./theme/popup-markup.ts";

export {
  FLOAT_EDGES,
  defaultFloatSettings,
  validateFloatSettings,
  FLOAT_CHROME_CSS,
  floatHasOwnSurface,
  wrapFloatMarkup,
  type FloatEdge,
  type FloatSettings,
  type FloatValidation,
} from "./theme/float.ts";

export {
  SAMPLE_POST,
  portableTextToVNodes,
  collectLoopItemPartIds,
  collectSectionPartIds,
  collectCollectionLoops,
  type CollectionLoop,
  resolvePostForRender,
  resolvePostsForLoop,
  type ThemePostFields,
  type ThemeDynamicData,
} from "./theme/dynamic.ts";
export {
  archivePagePath,
  archivePageTitle,
  DEFAULT_PER_PAGE,
  loopPerPage,
  MAX_ARCHIVE_PAGE,
  paginationItems,
  splitArchivePage,
  type ArchivePagination,
  type PaginationItem,
} from "./theme/pagination.ts";

export { layoutHasMenuDropdown, layoutHasTabs } from "./tabs/presence.ts";
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
export {
  layoutScripts,
  nodeScript,
  SCRIPT_BYTES,
  SCRIPT_LABELS,
  typeMayAddScript,
  type PageScript,
} from "./perf/scripts.ts";
export {
  measurePage,
  PERF_BUDGETS,
  type PerfKind,
  type PerfReport,
  type SectionWeight,
} from "./perf/meter.ts";
export {
  abCookieName,
  collectAbTests,
  pickArm,
  variantShows,
  type AbArm,
  type AbTest,
} from "./audience/variants.ts";
export {
  audienceShows,
  audienceSummary,
  clockIn,
  deviceFromUserAgent,
  layoutUsesAudience,
  type VisitorInfo,
} from "./audience/rules.ts";
export { changedIds, diffSections, restoreSection, type SectionChange } from "./history/diff.ts";
export {
  applyTokens,
  DEFAULT_FLUID_RANGE,
  fluidClamp,
  SCALE_RATIOS,
  spaceScale,
  typeScale,
  type ScaleInput,
} from "./design/tokens.ts";
export {
  applyA11yFix,
  applyAllA11yFixes,
  auditPage,
  contrastRatio,
  type A11yIssue,
  type A11yReport,
} from "./a11y/audit.ts";
export {
  defaultTagFor,
  inheritedStyle,
  traceStyle,
  type StyleSource,
  type StyleTrace,
  type TraceDevice,
} from "./css/trace.ts";
export { MOTION_EFFECTS, MOTION_LIMITS, type MotionEffect } from "./schema/motion.ts";
export {
  recipeNode,
  SECTION_RECIPES,
  siteTokens,
  type RecipeId,
  type RecipeTokens,
} from "./recipes/index.ts";
export {
  decodeSharedPage,
  encodeSharedPage,
  LONG_LINK_CHARS,
  PLAYGROUND_URL,
  sharedFromHash,
  shareUrl,
  type SharedPage,
  type ShareRead,
} from "./share/link.ts";
