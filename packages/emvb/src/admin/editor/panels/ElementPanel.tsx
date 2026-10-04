import { Button, Collapsible, Input, Tabs } from "@cloudflare/kumo";
import type { Fetcher } from "../../api.ts";
import {
  CaretDownIcon,
  CaretRightIcon,
  ImageIcon,
  PaintBrushIcon,
  PencilSimpleIcon,
  StarIcon,
  YoutubeLogoIcon,
  SquaresFourIcon,
  TextHIcon,
  WarningCircleIcon,
  TextboxIcon,
  CheckSquareIcon,
  RadioButtonIcon,
  PaperPlaneTiltIcon,
  ClipboardTextIcon,
  NotePencilIcon,
} from "@phosphor-icons/react";
import * as React from "react";
import { hasItemList, ItemList, type ItemActions } from "./settings/ItemList.tsx";
import {
  ELEMENT_DESCRIPTORS,
  findNode,
  hasLocalStyles,
  localStylesToClass,
  localToClassRefusal,
  isFormNode,
  parentOf,
  type DesignSystem,
  type ElementDescriptor,
  type Layout,
  type LayoutNode,
  patchClassDevices,
  patchClassState,
  patchClassStyle,
  patchDeviceStyle,
  patchStates,
  type DeviceStyles,
  type PopupDevice,
  type ResponsiveDevice,
  classStylesInListOrder,
  resolveCascade,
  STYLE_STATES,
  type StyleProps,
  type StyleStates,
} from "../../../core/index.ts";
import { BUTTON, FIELD } from "../../ui.ts";
import { FieldControl } from "./settings/FieldControl.tsx";
import { StyleRow } from "./settings/StyleRow.tsx";
import { ClassChipInput } from "./settings/ClassChipInput.tsx";
import { StateDot, StateSwitcher, type StyleStateChoice } from "./settings/StateSwitcher.tsx";
import {
  DEFAULT_UI,
  keysFor,
  offsetsApply,
  SECTION_LABELS,
  sectionsFor,
  STYLE_UI,
  type StyleSectionId,
} from "./settings/style-sections.ts";

export const ELEMENT_NAMES: Record<string, string> = Object.fromEntries(
  ELEMENT_DESCRIPTORS.map((d) => [d.type, d.name]),
);

const enclosingFormId = (layout: Layout, nodeId: string): string | undefined => {
  let current = parentOf(layout, nodeId);
  while (current) {
    const node = findNode(layout, current);
    if (node && isFormNode(node)) return node.props.formId || undefined;
    current = parentOf(layout, current);
  }
  return undefined;
};

const ICONS: Record<string, typeof TextHIcon> = {
  heading: TextHIcon,
  container: SquaresFourIcon,
  "div-block": SquaresFourIcon,
  flexbox: SquaresFourIcon,
  image: ImageIcon,
  icon: StarIcon,
  svg: StarIcon,
  tabs: SquaresFourIcon,
  "tab-panel": SquaresFourIcon,
  video: YoutubeLogoIcon,
  form: ClipboardTextIcon,
  "text-input": TextboxIcon,
  textarea: NotePencilIcon,
  select: TextboxIcon,
  checkbox: CheckSquareIcon,
  radio: RadioButtonIcon,
  submit: PaperPlaneTiltIcon,
};

const withStyle = (node: LayoutNode, patch: Partial<StyleProps>): LayoutNode => {
  const style: Record<string, unknown> = { ...node.style, ...patch };
  for (const key of Object.keys(style)) if (style[key] === undefined) delete style[key];
  return {
    ...node,
    style: Object.keys(style).length > 0 ? (style as StyleProps) : undefined,
  };
};

const withDevices = (node: LayoutNode, devices: DeviceStyles | undefined): LayoutNode => {
  const { devices: _old, ...rest } = node;
  return (devices ? { ...rest, devices } : rest) as LayoutNode;
};

const withStates = (node: LayoutNode, states: StyleStates | undefined): LayoutNode => {
  const { states: _old, ...rest } = node;
  return (states ? { ...rest, states } : rest) as LayoutNode;
};

const sessionSectionKey = (type: string) => `emvb-style-sections:${type}`;

const readSections = (type: string, fallback: StyleSectionId[]): Set<StyleSectionId> => {
  try {
    const raw = sessionStorage.getItem(sessionSectionKey(type));
    if (!raw) return new Set(fallback);
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed.filter((id): id is StyleSectionId => id in SECTION_LABELS));
  } catch {
    return new Set(fallback);
  }
};

const writeSections = (type: string, open: Set<StyleSectionId>) => {
  try {
    sessionStorage.setItem(sessionSectionKey(type), JSON.stringify([...open]));
  } catch {
    /* private mode */
  }
};

const countSet = (type: string, style: StyleProps | undefined, section: StyleSectionId) =>
  keysFor(type, section, style).filter((key) => style?.[key] !== undefined).length;

/** Whether any state sets a key of this section (the section header's dot in Normal). */
const sectionHasStates = (type: string, states: StyleStates | undefined, section: StyleSectionId) =>
  STYLE_STATES.some((state) => countSet(type, states?.[state], section) > 0);

/** Sections where a state change moves things around. */
const JUMPY = new Set<StyleSectionId>(["layout", "size", "position"]);

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
};

/** What an item's content is, since it has no content field of its own (W-130). */
const ITEM_NOTES: Record<string, string> = {
  "accordion-item":
    "The item's content is the elements in its body. Select this item, then add elements, or drag them into its body on the canvas.",
  "tab-panel":
    "The tab's content is the elements in its panel. Select this tab, then add elements, or drag them into its panel on the canvas.",
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

/** The open Style sections for an element type, remembered for the session. */
function useOpenSections(type: string, defaultOpen: StyleSectionId, nodeId: string) {
  const [open, setOpen] = React.useState(() => readSections(type, [defaultOpen]));
  React.useEffect(() => {
    setOpen(readSections(type, [defaultOpen]));
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
  descriptor,
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
  const inherited = responsive
    ? {
        ...normal,
        ...(responsive === "mobile" ? ownerDevices?.tablet : undefined),
      }
    : styleState === "normal"
      ? undefined
      : normal;
  const position = positionInEffect(node, design, cls);
  const patchStyle = (patch: Partial<StyleProps>) => {
    if (responsive) {
      if (!cls) {
        onChange(withDevices(node, patchDeviceStyle(node.devices, responsive, patch)));
        return;
      }
      setDesignError(null);
      onDesignChange(patchClassDevices(design, cls.id, responsive, patch)).catch((error: unknown) =>
        setDesignError(
          error instanceof Error ? error.message : "Couldn't save the class. Try again.",
        ),
      );
      return;
    }
    const state = styleState;
    if (!cls) {
      onChange(
        state === "normal"
          ? withStyle(node, patch)
          : withStates(node, patchStates(node.states, state, patch)),
      );
      return;
    }
    setDesignError(null);
    const next =
      state === "normal"
        ? patchClassStyle(design, cls.id, patch)
        : patchClassState(design, cls.id, state, patch);
    onDesignChange(next).catch((error: unknown) =>
      setDesignError(
        error instanceof Error ? error.message : "Couldn't save the class. Try again.",
      ),
    );
  };
  React.useEffect(() => {
    setTab(descriptor.defaultTab);
  }, [node.id, node.type, descriptor.defaultTab]);

  const Icon = ICONS[node.type] ?? SquaresFourIcon;
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
    <div className="emvb-panel-body" data-emvb-panel="element" data-emvb-element={node.type}>
      <div className="emvb-element-header">
        <Icon size={16} aria-hidden="true" />
        <h2 className="emvb-panel-title">{descriptor.name}</h2>
      </div>
      {crumbs.length > 0 && (
        <nav className="emvb-breadcrumb" aria-label="Element path">
          {crumbs.map((crumb, index) => (
            <React.Fragment key={crumb.id ?? "page"}>
              {index > 0 && <span aria-hidden="true"> › </span>}
              <button
                type="button"
                className="emvb-breadcrumb-part"
                onClick={() => onSelect(crumb.id)}
              >
                {crumb.label}
              </button>
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
            descriptor.fields.map((field) => (
              <FieldControl
                key={field.key}
                field={field}
                node={node}
                onChange={onChange}
                fetcher={fetcher}
                parentFormId={layout ? enclosingFormId(layout, node.id) : undefined}
              />
            ))
          )}
          {ITEM_NOTES[node.type] && <p className="emvb-helper">{ITEM_NOTES[node.type]}</p>}
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
            <p className="emvb-helper">
              These override Desktop. State styles apply on every device.
            </p>
          )}
          {designError && <Alert>{designError}</Alert>}
          {!cls && styleState === "normal" && node.type === "spacer" && (
            <FieldControl field={SPACER_HEIGHT} node={node} onChange={onChange} fetcher={fetcher} />
          )}
          {sectionsFor(ui.sections, style).map((id) => {
            if (id === "advanced") {
              if (cls || styleState !== "normal") return null;
              return section(
                id,
                (node.htmlId ? 1 : 0) + (node.attributes?.length ?? 0),
                <>
                  <Input
                    label="CSS id"
                    className={`${FIELD} emvb-mono`}
                    value={node.htmlId ?? ""}
                    onChange={(event) => {
                      const next = event.target.value.trim();
                      onChange({ ...node, htmlId: next === "" ? undefined : next });
                    }}
                  />
                  <AttributesEditor
                    attributes={node.attributes}
                    onChange={(attributes) => onChange({ ...node, attributes })}
                  />
                </>,
              );
            }
            const keys = keysFor(node.type, id, style, position).filter(
              (key) => styleState === "normal" || (key !== "transition" && key !== "entrance"),
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
                {keys.map((key) => (
                  <StyleRow
                    key={`${styleState}:${key}`}
                    styleKey={key}
                    style={style}
                    inherited={inherited}
                    design={design}
                    fetcher={fetcher}
                    onPatch={patchStyle}
                    onDesignChange={onDesignChange}
                  />
                ))}
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
  const chain: Array<{ id: string; label: string }> = [];
  let current: string | undefined = id;
  while (current) {
    const node = findNode(layout, current);
    if (!node) break;
    chain.unshift({
      id: node.id,
      label: ELEMENT_NAMES[node.type] ?? node.type,
    });
    current = parentOf(layout, current);
  }
  return [{ id: null, label: "Page" }, ...chain];
}

function AttributesEditor({
  attributes,
  onChange,
}: {
  attributes: LayoutNode["attributes"];
  onChange: (next: LayoutNode["attributes"]) => void;
}) {
  const list = attributes ?? [];
  const update = (index: number, patch: { name?: string; value?: string }) => {
    const next = list.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  };
  return (
    <div className="emvb-field-group" data-emvb-attributes="">
      <span className="emvb-var-field-label">Attributes</span>
      {list.map((item, index) => (
        <div key={index} className="emvb-style-row">
          <Input
            label="Name"
            className={`${FIELD} emvb-mono`}
            value={item.name}
            onChange={(event) => update(index, { name: event.target.value.trim() })}
          />
          <Input
            label="Value"
            className={FIELD}
            value={item.value}
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(list.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        className={BUTTON}
        onClick={() => onChange([...list, { name: "data-", value: "" }])}
      >
        Add attribute
      </Button>
      <p className="emvb-helper">data-* and aria-* names only. Event handlers are refused.</p>
    </div>
  );
}
