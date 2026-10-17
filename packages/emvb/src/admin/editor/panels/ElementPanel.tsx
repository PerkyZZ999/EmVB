import { Collapsible, Tabs } from "@cloudflare/kumo";
import type { Fetcher } from "../../api.ts";
import {
  CaretDownIcon,
  CaretRightIcon,
  PaintBrushIcon,
  PencilSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { ELEMENT_NAMES, elementIcon } from "../element-chrome.ts";
import { indexLayout } from "../../../core/tree-ops.ts";
import type { ThemePartType } from "../../../core/theme/part-types.ts";
import { sharedPartH1 } from "./settings/heading-warning.ts";
import {
  HELD_BACK_BOX_LINK_NOTE,
  UNNAMED_BOX_LINK_NOTE,
  unnamedBoxLink,
} from "./settings/box-link-name.ts";
import { imageAltNote } from "./settings/image-alt.ts";
import { loopContextNote } from "./settings/loop-context.ts";
import { buttonUrlNote } from "./settings/button-url.ts";
import { svgImagesLeftOut, svgImagesNotice } from "./settings/svg-images.ts";
import { duplicateFieldName } from "./settings/form-names.ts";
import { hasItemList, ItemList, type ItemActions } from "./settings/ItemList.tsx";
import {
  ELEMENT_DESCRIPTORS,
  hasLocalStyles,
  localStylesToClass,
  localToClassRefusal,
  isFormNode,
  loneAbTests,
  type DesignSystem,
  type ElementDescriptor,
  type Layout,
  type Arranged,
  inheritedStyle,
  type LayoutNode,
  type PopupDevice,
  type ResponsiveDevice,
  classStylesInListOrder,
  iconHasAdjustableStroke,
  iconHasOwnColors,
  resolveCascade,
  SAMPLE_POST,
  STYLE_STATES,
  type StyleProps,
  type StyleStates,
  boxLinkHeldBack,
} from "../../../core/index.ts";
import { applyStylePatch } from "./style-target.ts";
import { FieldControl } from "./settings/FieldControl.tsx";
import { BindingsEditor } from "./settings/BindingsEditor.tsx";
import { VariantEditor } from "./settings/VariantEditor.tsx";
import { AudienceEditor } from "./settings/AudienceEditor.tsx";
import { StyleSources } from "./settings/StyleSources.tsx";
import { BoxControl } from "./settings/BoxControl.tsx";
import { boxGroupOf } from "./settings/box-sides.ts";
import { IconShapeRow, IconSingleColorRow } from "./settings/IconControls.tsx";
import { StyleRow } from "./settings/StyleRow.tsx";
import {
  AttributesEditor,
  ContainerQueryFields,
  DirectionField,
  HtmlIdField,
} from "./settings/AdvancedFields.tsx";
import { ClassChipInput } from "./settings/ClassChipInput.tsx";
import { StateDot, StateSwitcher, type StyleStateChoice } from "./settings/StateSwitcher.tsx";
import {
  DEFAULT_UI,
  keysFor,
  offsetsApply,
  SECTION_LABELS,
  sectionsFor,
  type StyleKey,
  STYLE_UI,
  type StyleSectionId,
} from "./settings/style-sections.ts";

const enclosingFormId = (layout: Layout, nodeId: string): string | undefined => {
  const index = indexLayout(layout);
  let current = index.parentOf.get(nodeId);
  while (current) {
    const node = index.byId.get(current);
    if (node && isFormNode(node)) return node.props.formId || undefined;
    current = index.parentOf.get(current);
  }
  return undefined;
};

const GRID_ITEM_KEYS = new Set<string>([
  "gridColumnSpan",
  "gridColumnStart",
  "gridRowSpan",
  "gridRowStart",
]);

/** Whether the node sits directly in a box that lays its children out on a grid. */
const inGridParent = (layout: Layout | null | undefined, nodeId: string): boolean => {
  if (!layout) return true;
  const index = indexLayout(layout);
  const parentId = index.parentOf.get(nodeId);
  const parent = parentId ? index.byId.get(parentId) : undefined;
  return parent?.type === "grid" || parent?.type === "loop";
};

const sectionKey = (type: string) => `emvb-style-sections:${type}`;

/**
 * Open the first time an element type is selected, where it has them (W-137): the sections most
 * edits need. After that the open and closed sections are remembered per type, across visits.
 */
const OPEN_FIRST: StyleSectionId[] = ["typography", "spacing", "background", "border"];

const readSections = (type: string, fallback: StyleSectionId[]): Set<StyleSectionId> => {
  try {
    const raw = localStorage.getItem(sectionKey(type));
    if (!raw) return new Set(fallback);
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed.filter((id): id is StyleSectionId => id in SECTION_LABELS));
  } catch {
    return new Set(fallback);
  }
};

const writeSections = (type: string, open: Set<StyleSectionId>) => {
  try {
    localStorage.setItem(sectionKey(type), JSON.stringify([...open]));
  } catch {
    /* private mode */
  }
};

const countSet = (type: string, style: StyleProps | undefined, section: StyleSectionId) =>
  keysFor(type, section, style).filter((key) => style?.[key] !== undefined).length;

/** Whether any state sets a key of this section (the section header's dot in Normal). */
const sectionHasStates = (type: string, states: StyleStates | undefined, section: StyleSectionId) =>
  STYLE_STATES.some((state) => countSet(type, states?.[state], section) > 0);

/** Sections where a state change moves things around (DESIGN.md § State styles). */
const JUMPY = new Set<StyleSectionId>(["layout", "size", "position"]);

/** Set on Normal only (W-089, W-101, W-237); a state's Style tab leaves them out. */
const NORMAL_ONLY_KEYS = new Set<StyleKey>([
  "transition",
  "entrance",
  "iconAnimation",
  "scrollMotion",
]);

const JUMP_HELP: Record<Exclude<StyleStateChoice, "normal">, string> = {
  hover: "Changing size or position on hover can make the page jump.",
  focus: "Changing size or position on focus can make the page jump.",
  active: "Changing size or position while active can make the page jump.",
};

/** The position in effect: the class's own when editing a class, else classes then local. */
const positionInEffect = (
  node: LayoutNode,
  design: DesignSystem,
  cls: { style?: StyleProps } | undefined,
) =>
  cls
    ? cls.style?.position
    : resolveCascade(classStylesInListOrder(design.classes, node.classes ?? []), node.style)
        .position;

/**
 * Where the panel was scrolled, per tab, for the session (W-152). A new selection or a tab switch
 * shows the tab where it was left, rather than wherever the shorter or longer content clamps it.
 */
const tabScroll: Record<string, number> = {};

function useTabScroll(ref: React.RefObject<HTMLElement | null>, tab: string, nodeId: string) {
  React.useLayoutEffect(() => {
    const scroller = ref.current?.closest<HTMLElement>(".emvb-panel");
    if (!scroller) return;
    const restore = () => {
      scroller.scrollTop = tabScroll[tab] ?? 0;
    };
    restore();
    // Sections may grow a frame later; put the position back once they have.
    const frame = requestAnimationFrame(restore);
    const save = () => {
      tabScroll[tab] = scroller.scrollTop;
    };
    scroller.addEventListener("scroll", save, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", save);
    };
  }, [ref, tab, nodeId]);
}

/** Which styles the Style sections edit (W-087): a class applied to the node, or its own. */
function useStyleTarget(node: LayoutNode, design: DesignSystem) {
  const [editing, setEditing] = React.useState<string | null>(null);
  React.useEffect(() => setEditing(null), [node.id]);
  const cls =
    editing && node.classes?.includes(editing)
      ? design.classes?.find((c) => c.id === editing)
      : undefined;
  return { cls, editing: cls ? cls.id : null, setEditing };
}

type Props = {
  node: LayoutNode;
  layout: Layout | null;
  design: DesignSystem;
  rejection: string | null;
  fetcher: Fetcher;
  onChange: (node: LayoutNode) => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  /** False when the forms plugin is not installed (W-036). */
  formsAvailable?: boolean;
  onSelect: (id: string | null) => void;
  /** The chosen style state, for the canvas preview (W-089). */
  onStyleState?: (nodeId: string, state: StyleStateChoice) => void;
  /** Tablet and mobile edit overrides. Desktop edits `style` (W-096). */
  device?: PopupDevice;
  /** Add, move and delete for Accordion items and Tabs panels (W-130). */
  items?: ItemActions;
  /** The theme part being edited, if any, for the H1 warning (W-208). */
  partType?: ThemePartType;
  /** Layout-wide changes from the panel, e.g. creating an A/B variant (W-312). */
  onArrange?: (run: (layout: Layout) => Arranged) => void;
};

/** What an item's content is, since it has no content field of its own (W-130). */
const ITEM_NOTES: Record<string, string> = {
  "accordion-item":
    "The item's content is the elements in its body. Select this item, then add elements, or drag them into its body on the canvas.",
  "tab-panel":
    "The tab's content is the elements in its panel. Select this tab, then add elements, or drag them into its panel on the canvas.",
  menu: "Add Menu items. An item that holds other elements opens a dropdown. Wide panel stretches that dropdown across the menu.",
  "menu-item":
    "The label is the link. Elements inside this item are its dropdown. Wide panel stretches the dropdown across the menu.",
};

const FORM_TYPES = new Set([
  "form",
  "text-input",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "submit",
]);

const SPACER_HEIGHT = {
  key: "height",
  kind: "number",
  label: "Height",
  message: "Height can't be negative. Enter 0 or more.",
} as const;

const TABS = [
  {
    value: "content",
    label: (
      <>
        <PencilSimpleIcon size={14} aria-hidden="true" />
        Content
      </>
    ),
  },
  {
    value: "style",
    label: (
      <>
        <PaintBrushIcon size={14} aria-hidden="true" />
        Style
      </>
    ),
  },
];

function Alert({
  children,
  ...data
}: {
  children: React.ReactNode;
  "data-emvb-forms-missing"?: "";
}) {
  return (
    <p className="emvb-inline-error" role="alert" {...data}>
      <WarningCircleIcon size={16} aria-hidden="true" />
      {children}
    </p>
  );
}

/**
 * UX-028: settings that only matter once another is set stay out of the way
 * until then. A value already stored always shows, so nothing set is ever hidden.
 */
const DEPENDS_ON: Readonly<Record<string, string>> = {
  iconPosition: "iconId",
  iconSize: "iconId",
  iconGap: "iconId",
};

/** UX-040: number pairs that read as one setting share a row (X beside Y, width beside height). */
const PAIRED: Readonly<Record<string, string>> = { focalX: "focalY", width: "height" };

function pairFields<F extends { key: string }>(fields: readonly F[]): F[][] {
  const rows: F[][] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i] as F;
    const next = fields[i + 1];
    if (next && PAIRED[field.key] === next.key) {
      rows.push([field, next]);
      i += 1;
    } else rows.push([field]);
  }
  return rows;
}

function fieldShown(key: string, node: LayoutNode): boolean {
  const parent = DEPENDS_ON[key];
  if (!parent) return true;
  const props = node.props as Record<string, unknown>;
  return props[parent] !== undefined || props[key] !== undefined;
}

/** Right panel with an element selected (IA / W-021): descriptor Content + Style sections. */
export function ElementPanel(props: Props) {
  const descriptor = ELEMENT_DESCRIPTORS.find((d) => d.type === props.node.type);
  if (!descriptor) {
    return (
      <div
        className="emvb-panel-body"
        data-emvb-panel="element"
        data-emvb-element={props.node.type}
      >
        <h2 className="emvb-panel-title">Unknown element</h2>
        <p className="emvb-helper">
          Unknown element &quot;{props.node.type}&quot;. It can be moved or deleted, but not edited.
        </p>
        {props.rejection && <Alert>{props.rejection}</Alert>}
      </div>
    );
  }
  return <KnownElementPanel {...props} descriptor={descriptor} />;
}

/** The open Style sections for an element type, remembered across visits (W-137). */
function useOpenSections(type: string, defaultOpen: StyleSectionId, nodeId: string) {
  const [open, setOpen] = React.useState(() => readSections(type, [defaultOpen, ...OPEN_FIRST]));
  React.useEffect(() => {
    setOpen(readSections(type, [defaultOpen, ...OPEN_FIRST]));
  }, [nodeId, type, defaultOpen]);
  const setSection = (id: StyleSectionId, isOpen: boolean) => {
    setOpen((current) => {
      const next = new Set(current);
      if (isOpen) next.add(id);
      else next.delete(id);
      writeSections(type, next);
      return next;
    });
  };
  return [open, setSection] as const;
}

function KnownElementPanel({
  node,
  layout,
  design,
  rejection,
  fetcher,
  formsAvailable = true,
  onChange,
  onDesignChange,
  onSelect,
  onStyleState,
  device = "desktop",
  items,
  partType,
  descriptor,
  onArrange,
}: Props & { descriptor: ElementDescriptor }) {
  const ui = STYLE_UI[node.type] ?? DEFAULT_UI;
  const [tab, setTab] = React.useState(descriptor.defaultTab);
  const [openSections, setSection] = useOpenSections(node.type, ui.defaultOpen, node.id);
  const { cls, editing, setEditing } = useStyleTarget(node, design);
  const [designError, setDesignError] = React.useState<string | null>(null);
  const [styleState, setStyleState] = React.useState<StyleStateChoice>("normal");
  React.useEffect(() => setStyleState("normal"), [node.id]);
  React.useEffect(() => {
    onStyleState?.(node.id, tab === "style" ? styleState : "normal");
  }, [node.id, styleState, tab, onStyleState]);
  const normal = cls ? cls.style : node.style;
  const states = cls ? cls.states : node.states;
  const responsive: ResponsiveDevice | null = device === "desktop" ? null : device;
  const ownerDevices = cls ? cls.devices : node.devices;
  const style = responsive
    ? ownerDevices?.[responsive]
    : styleState === "normal"
      ? normal
      : states?.[styleState];
  const ownInherited = responsive
    ? {
        ...normal,
        ...(responsive === "mobile" ? ownerDevices?.tablet : undefined),
      }
    : styleState === "normal"
      ? undefined
      : normal;
  // W-318: an element's own styles sit on its classes and its tag's Site styles default, so the
  // controls show what those give as the inherited value.
  const fromBelow = cls ? undefined : inheritedStyle(node, design, device, styleState);
  const inherited =
    fromBelow && Object.keys(fromBelow).length > 0
      ? { ...fromBelow, ...ownInherited }
      : ownInherited;
  const position = positionInEffect(node, design, cls);
  const inGrid = inGridParent(layout, node.id);
  const iconSvg =
    node.type === "icon" && typeof node.props.iconSvg === "string" ? node.props.iconSvg : undefined;
  const strokeAdjustable = React.useMemo(
    () => (node.type === "icon" && !cls ? iconHasAdjustableStroke(iconSvg) : true),
    [node.type, cls, iconSvg],
  );
  const ownColors = React.useMemo(
    () => node.type === "icon" && iconHasOwnColors(iconSvg),
    [node.type, iconSvg],
  );
  const singleColorOffered =
    node.type === "icon" &&
    !cls &&
    !responsive &&
    styleState === "normal" &&
    (node.props.singleColor === true || ownColors);
  // W-296: elsewhere (Hover, Focus, a device) Colour does nothing on such an SVG until Force single
  // colour is on, and that switch only lives in Normal on Desktop, so say so there.
  const colorIgnoredHere =
    node.type === "icon" &&
    !cls &&
    !singleColorOffered &&
    node.props.singleColor !== true &&
    ownColors;
  const patchStyle = (patch: Partial<StyleProps>) => {
    const written = applyStylePatch({
      node,
      design,
      classId: cls ? cls.id : null,
      device,
      state: styleState,
      patch,
    });
    if (written.kind === "node") {
      onChange(written.node);
      return;
    }
    setDesignError(null);
    onDesignChange(written.design).catch((error: unknown) =>
      setDesignError(
        error instanceof Error ? error.message : "Couldn't save the class. Try again.",
      ),
    );
  };
  React.useEffect(() => {
    setTab(descriptor.defaultTab);
  }, [node.id, node.type, descriptor.defaultTab]);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  useTabScroll(bodyRef, tab, node.id);

  const Icon = elementIcon(node.type);
  const crumbs = breadcrumb(layout, node.id);
  const section = (
    id: StyleSectionId,
    count: number,
    children: React.ReactNode,
    stateMark = false,
  ) => (
    <Section
      key={id}
      id={id}
      open={openSections.has(id)}
      count={count}
      stateMark={stateMark}
      onOpenChange={(open) => setSection(id, open)}
    >
      {children}
    </Section>
  );

  return (
    <div
      ref={bodyRef}
      className="emvb-panel-body"
      data-emvb-panel="element"
      data-emvb-element={node.type}
    >
      <div className="emvb-element-header">
        <Icon size={16} aria-hidden="true" />
        <h2 className="emvb-panel-title">{descriptor.name}</h2>
      </div>
      {crumbs.length > 0 && (
        <nav className="emvb-breadcrumb" aria-label="Element path">
          {crumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id ?? "page"}>
              {index > 0 && <span aria-hidden="true"> › </span>}
              {index === crumbs.length - 1 ? (
                // UX-065: the element being edited is where you are, not a link back to itself.
                <span className="emvb-breadcrumb-current" aria-current="location">
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="emvb-breadcrumb-part"
                  onClick={() => onSelect(crumb.id)}
                >
                  {crumb.label}
                </button>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      {rejection && <Alert>{rejection}</Alert>}
      {!formsAvailable && FORM_TYPES.has(node.type) && (
        <Alert data-emvb-forms-missing="">
          The forms plugin is not installed. Form elements can&apos;t submit until it is added.
        </Alert>
      )}
      <Tabs
        variant="underline"
        className="emvb-tabs"
        tabs={TABS}
        value={tab}
        onValueChange={(value) => setTab(value === "style" ? "style" : "content")}
      />
      {tab === "content" && (
        <div className="emvb-panel-body" data-emvb-tab="content">
          {hasItemList(node.type) ? (
            <ItemList node={node} onChange={onChange} onSelect={onSelect} actions={items} />
          ) : descriptor.fields.length === 0 ? (
            <p className="emvb-helper">
              {node.type === "container"
                ? "A container holds other elements. Arrange them in Style."
                : "This element has no content settings."}
            </p>
          ) : (
            pairFields(descriptor.fields.filter((field) => fieldShown(field.key, node))).map(
              (row) => {
                const controls = row.map((field) => (
                  <FieldControl
                    key={field.key}
                    field={field}
                    node={node}
                    onChange={onChange}
                    fetcher={fetcher}
                    parentFormId={layout ? enclosingFormId(layout, node.id) : undefined}
                    duplicateName={
                      field.key === "field" && layout ? duplicateFieldName(layout, node.id) : false
                    }
                    device={device}
                  />
                ));
                return row.length === 2 ? (
                  <div className="emvb-field-pair" key={row[0]?.key} data-emvb-field-pair="">
                    {controls}
                  </div>
                ) : (
                  controls
                );
              },
            )
          )}
          <BindingsEditor node={node} onChange={onChange} post={SAMPLE_POST} />
          <AudienceEditor node={node} isRoot={layout?.root.id === node.id} onChange={onChange} />
          <VariantEditor
            node={node}
            isRoot={layout?.root.id === node.id}
            lone={Boolean(layout && node.variant && loneAbTests(layout).has(node.variant.test))}
            onChange={onChange}
            onArrange={onArrange}
          />
          {ITEM_NOTES[node.type] && <p className="emvb-helper">{ITEM_NOTES[node.type]}</p>}
          {svgImagesLeftOut(node) > 0 && (
            <p className="emvb-helper" data-emvb-svg-images>
              {svgImagesNotice(svgImagesLeftOut(node))}
            </p>
          )}
          {sharedPartH1(node, partType) && (
            <p className="emvb-helper" data-emvb-shared-h1>
              This part shows on pages that already have their own H1, so they would get two. Use H2
              or lower here unless this part is the page's only main heading.
            </p>
          )}
          {buttonUrlNote(node) && (
            <p className="emvb-helper" data-emvb-button-url>
              {buttonUrlNote(node)}
            </p>
          )}
          {loopContextNote(node, partType) && (
            <p className="emvb-helper" data-emvb-loop-note>
              {loopContextNote(node, partType)}
            </p>
          )}
          {imageAltNote(node) && (
            <p className="emvb-helper" data-emvb-alt-note>
              {imageAltNote(node)}
            </p>
          )}
          {boxLinkHeldBack(node) && (
            <p className="emvb-helper" data-emvb-held-back-link>
              {HELD_BACK_BOX_LINK_NOTE}
            </p>
          )}
          {unnamedBoxLink(node) && (
            <p className="emvb-helper" data-emvb-unnamed-link>
              {UNNAMED_BOX_LINK_NOTE}
            </p>
          )}
        </div>
      )}
      {tab === "style" && (
        <div className="emvb-panel-body" data-emvb-tab="style">
          <ClassChipInput
            applied={node.classes}
            design={design}
            editing={editing}
            onEdit={setEditing}
            onChange={(classes) => onChange({ ...node, classes })}
            onDesignChange={onDesignChange}
            onSaveLocal={
              editing === null && hasLocalStyles(node)
                ? async (name) => {
                    const refusal = localToClassRefusal(design, node);
                    if (refusal) throw new Error(refusal);
                    const moved = localStylesToClass(design, node, name);
                    if (!moved) throw new Error("Couldn't save the class. Try again.");
                    await onDesignChange(moved.design);
                    onChange(moved.node);
                  }
                : undefined
            }
          />
          {device === "desktop" ? (
            <StateSwitcher
              value={styleState}
              states={states}
              className={cls ? cls.name : null}
              onChange={setStyleState}
            />
          ) : (
            // UX-063: say which device is being edited, as states say "Editing Hover".
            <p className="emvb-helper" data-emvb-device-note={device}>
              {device === "mobile"
                ? "Editing Mobile. These styles override Tablet and Desktop."
                : "Editing Tablet. These styles override Desktop."}{" "}
              Hover, Focus and Active are set on Desktop and apply on every device.
            </p>
          )}
          {!cls && <StyleSources node={node} design={design} device={device} state={styleState} />}
          {designError && <Alert>{designError}</Alert>}
          {!cls && styleState === "normal" && node.type === "spacer" && (
            <FieldControl field={SPACER_HEIGHT} node={node} onChange={onChange} fetcher={fetcher} />
          )}
          {sectionsFor(ui.sections, style, node.type).map((id) => {
            if (id === "advanced") {
              if (cls || styleState !== "normal") return null;
              return section(
                id,
                (node.htmlId ? 1 : 0) + (node.attributes?.length ?? 0),
                <>
                  <HtmlIdField node={node} layout={layout} onChange={onChange} />
                  <DirectionField node={node} onChange={onChange} />
                  <ContainerQueryFields node={node} onChange={onChange} />
                  <AttributesEditor
                    attributes={node.attributes}
                    onChange={(attributes) => onChange({ ...node, attributes })}
                  />
                </>,
              );
            }
            const keys = keysFor(node.type, id, style, position).filter(
              (key) =>
                (styleState === "normal" || !NORMAL_ONLY_KEYS.has(key)) &&
                // UX-034: spans and starts only place an element inside a Grid (or a Loop's grid).
                (!GRID_ITEM_KEYS.has(key) ||
                  inGrid ||
                  (style as Record<string, unknown> | undefined)?.[key] !== undefined) &&
                // W-237: Stroke width only for stroke-drawn icons (or once set, so it can be reset).
                (key !== "iconStrokeWidth" ||
                  strokeAdjustable ||
                  style?.iconStrokeWidth !== undefined),
            );
            if (keys.length === 0) return null;
            return section(
              id,
              countSet(node.type, style, id),
              <>
                {styleState !== "normal" && JUMPY.has(id) && (
                  <p className="emvb-helper" data-emvb-jump-help="">
                    {JUMP_HELP[styleState]}
                  </p>
                )}
                {keys.map((key) => {
                  const group = boxGroupOf(key);
                  if (group) {
                    // One four-box control per group, where its first key would be (W-138).
                    if (keys.find((k) => boxGroupOf(k) === group) !== key) return null;
                    return (
                      <BoxControl
                        key={`${node.id}:${cls?.id ?? "local"}:${responsive ?? "desktop"}:${styleState}:${group.id}`}
                        group={group}
                        style={style}
                        inherited={inherited}
                        design={design}
                        onPatch={patchStyle}
                      />
                    );
                  }
                  const row = (
                    <StyleRow
                      key={`${styleState}:${key}`}
                      styleKey={key}
                      style={style}
                      inherited={inherited}
                      design={design}
                      fetcher={fetcher}
                      elementType={cls ? "container" : node.type}
                      fillScope={`${cls?.id ?? "local"}:${responsive ?? "desktop"}`}
                      onPatch={patchStyle}
                      onDesignChange={onDesignChange}
                    />
                  );
                  if (id !== "icon" || key !== "color") return row;
                  // W-238: under Colour, Force single colour (a content prop, so Normal on
                  // Desktop only) and the background Shape presets.
                  return (
                    <React.Fragment key={`${styleState}:${key}`}>
                      {row}
                      {singleColorOffered && (
                        <IconSingleColorRow
                          checked={node.props.singleColor === true}
                          onChange={(checked) => {
                            const { singleColor: _was, ...props } = node.props as Record<
                              string,
                              unknown
                            >;
                            onChange({
                              ...node,
                              props: checked ? { ...props, singleColor: true } : props,
                            } as LayoutNode);
                          }}
                        />
                      )}
                      {colorIgnoredHere && (
                        <p className="emvb-helper" data-emvb-icon-color-ignored="">
                          This SVG keeps its own colors, so this color shows only once Force single
                          color is on (Normal state, Desktop).
                        </p>
                      )}
                      {styleState === "normal" && (
                        <IconShapeRow style={style} inherited={inherited} onPatch={patchStyle} />
                      )}
                    </React.Fragment>
                  );
                })}
                {id === "position" && !offsetsApply(position) && (
                  <p className="emvb-helper" data-emvb-offsets-help="">
                    Offsets apply once Position is Relative, Absolute, Fixed or Sticky.
                  </p>
                )}
              </>,
              styleState === "normal" && sectionHasStates(node.type, states, id),
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({
  id,
  open,
  count,
  stateMark,
  onOpenChange,
  children,
}: {
  id: StyleSectionId;
  open: boolean;
  count: number;
  stateMark: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger className="emvb-section-header" data-emvb-section={id}>
        <span>
          {SECTION_LABELS[id]}
          {!open && count > 0 && <span className="emvb-count"> · {count}</span>}
          {stateMark && <StateDot />}
        </span>
        {open ? (
          <CaretDownIcon size={16} aria-hidden="true" />
        ) : (
          <CaretRightIcon size={16} aria-hidden="true" />
        )}
      </Collapsible.Trigger>
      <Collapsible.Panel className="emvb-section-body">{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}

function breadcrumb(
  layout: Layout | null,
  id: string,
): Array<{ id: string | null; label: string }> {
  if (!layout) return [];
  const index = indexLayout(layout);
  const chain: Array<{ id: string; label: string }> = [];
  let current: string | undefined = id;
  while (current) {
    const node = index.byId.get(current);
    if (!node) break;
    chain.unshift({
      id: node.id,
      label: ELEMENT_NAMES[node.type] ?? node.type,
    });
    current = index.parentOf.get(current);
  }
  return [{ id: null, label: "Page" }, ...chain];
}
