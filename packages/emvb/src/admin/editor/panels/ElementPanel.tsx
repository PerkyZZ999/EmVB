import { Collapsible, Input, Tabs } from "@cloudflare/kumo";
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
import {
  ELEMENT_DESCRIPTORS,
  findNode,
  isFormNode,
  parentOf,
  type DesignSystem,
  type ElementDescriptor,
  type Layout,
  type LayoutNode,
  patchClassStyle,
  resolveCascade,
  type StyleProps,
} from "../../../core/index.ts";
import { FIELD } from "../../ui.ts";
import { FieldControl } from "./settings/FieldControl.tsx";
import { StyleRow } from "./settings/StyleRow.tsx";
import { ClassChipInput } from "./settings/ClassChipInput.tsx";
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

/** The position in effect: the class's own when editing a class, else classes then local. */
const positionInEffect = (
  node: LayoutNode,
  design: DesignSystem,
  cls: { style?: StyleProps } | undefined,
) =>
  cls
    ? cls.style?.position
    : resolveCascade(
        (node.classes ?? []).map((id) => design.classes?.find((c) => c.id === id)?.style),
        node.style,
      ).position;

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
  descriptor,
}: Props & { descriptor: ElementDescriptor }) {
  const ui = STYLE_UI[node.type] ?? DEFAULT_UI;
  const [tab, setTab] = React.useState(descriptor.defaultTab);
  const [openSections, setSection] = useOpenSections(node.type, ui.defaultOpen, node.id);
  const { cls, editing, setEditing } = useStyleTarget(node, design);
  const [designError, setDesignError] = React.useState<string | null>(null);
  const style = cls ? cls.style : node.style;
  const position = positionInEffect(node, design, cls);
  const patchStyle = (patch: Partial<StyleProps>) => {
    if (!cls) {
      onChange(withStyle(node, patch));
      return;
    }
    setDesignError(null);
    onDesignChange(patchClassStyle(design, cls.id, patch)).catch((error: unknown) =>
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
  const section = (id: StyleSectionId, count: number, children: React.ReactNode) => (
    <Section
      key={id}
      id={id}
      open={openSections.has(id)}
      count={count}
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
          {descriptor.fields.length === 0 ? (
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
          />
          {designError && <Alert>{designError}</Alert>}
          {!cls && node.type === "spacer" && (
            <FieldControl field={SPACER_HEIGHT} node={node} onChange={onChange} fetcher={fetcher} />
          )}
          {sectionsFor(ui.sections, style).map((id) => {
            if (id === "advanced") {
              if (cls) return null;
              return section(
                id,
                node.htmlId ? 1 : 0,
                <Input
                  label="CSS id"
                  className={`${FIELD} emvb-mono`}
                  value={node.htmlId ?? ""}
                  onChange={(event) => {
                    const next = event.target.value.trim();
                    onChange({ ...node, htmlId: next === "" ? undefined : next });
                  }}
                />,
              );
            }
            const keys = keysFor(node.type, id, style, position);
            if (keys.length === 0) return null;
            return section(
              id,
              countSet(node.type, style, id),
              <>
                {keys.map((key) => (
                  <StyleRow
                    key={key}
                    styleKey={key}
                    style={style}
                    design={design}
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
  onOpenChange,
  children,
}: {
  id: StyleSectionId;
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger className="emvb-section-header" data-emvb-section={id}>
        <span>
          {SECTION_LABELS[id]}
          {!open && count > 0 && <span className="emvb-count"> · {count}</span>}
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
