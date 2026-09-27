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
  type Layout,
  type LayoutNode,
  type StyleProps,
} from "../../../core/index.ts";
import { FIELD } from "../../ui.ts";
import { FieldControl } from "./settings/FieldControl.tsx";
import { StyleRow } from "./settings/StyleRow.tsx";
import { ClassPicker } from "./settings/ClassPicker.tsx";
import {
  keysFor,
  SECTION_LABELS,
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
  image: ImageIcon,
  icon: StarIcon,
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

const countSet = (node: LayoutNode, section: StyleSectionId) =>
  keysFor(node.type, section).filter((key) => node.style?.[key] !== undefined).length;

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

/** Right panel with an element selected (IA / W-021): descriptor Content + Style sections. */
export function ElementPanel({
  node,
  layout,
  design,
  rejection,
  fetcher,
  formsAvailable = true,
  onChange,
  onDesignChange,
  onSelect,
}: Props) {
  const known = ELEMENT_DESCRIPTORS.some((d) => d.type === node.type);
  if (!known) {
    return (
      <div className="emvb-panel-body" data-emvb-panel="element" data-emvb-element={node.type}>
        <h2 className="emvb-panel-title">Unknown element</h2>
        <p className="emvb-helper">
          Unknown element &quot;{node.type}&quot;. It can be moved or deleted, but not edited.
        </p>
        {rejection && (
          <p className="emvb-inline-error" role="alert">
            <WarningCircleIcon size={16} aria-hidden="true" />
            {rejection}
          </p>
        )}
      </div>
    );
  }

  const descriptor =
    ELEMENT_DESCRIPTORS.find((d) => d.type === node.type) ??
    ({
      type: node.type,
      name: ELEMENT_NAMES[node.type] ?? node.type,
      group: "content" as const,
      defaultTab: "content" as const,
      fields: [],
    } as const);
  const ui = STYLE_UI[node.type] ?? {
    sections: [
      "layout",
      "spacing",
      "typography",
      "background",
      "border",
      "advanced",
    ] as StyleSectionId[],
    defaultOpen: "layout" as StyleSectionId,
  };
  const [tab, setTab] = React.useState(descriptor.defaultTab);
  const [openSections, setOpenSections] = React.useState(() =>
    readSections(node.type, [ui.defaultOpen]),
  );

  React.useEffect(() => {
    setTab(descriptor.defaultTab);
    setOpenSections(readSections(node.type, [ui.defaultOpen]));
  }, [node.id, node.type, descriptor.defaultTab, ui.defaultOpen]);

  const setSection = (id: StyleSectionId, open: boolean) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      writeSections(node.type, next);
      return next;
    });
  };

  const Icon = ICONS[node.type] ?? SquaresFourIcon;
  const crumbs = breadcrumb(layout, node.id);

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
      {rejection && (
        <p className="emvb-inline-error" role="alert">
          <WarningCircleIcon size={16} aria-hidden="true" />
          {rejection}
        </p>
      )}
      {!formsAvailable &&
        (node.type === "form" ||
          node.type === "text-input" ||
          node.type === "textarea" ||
          node.type === "select" ||
          node.type === "checkbox" ||
          node.type === "radio" ||
          node.type === "submit") && (
          <p className="emvb-inline-error" role="alert" data-emvb-forms-missing="">
            <WarningCircleIcon size={16} aria-hidden="true" />
            The forms plugin is not installed. Form elements can&apos;t submit until it is added.
          </p>
        )}
      <Tabs
        variant="underline"
        className="emvb-tabs"
        tabs={[
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
        ]}
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
          <ClassPicker
            applied={node.classes}
            design={design}
            onChange={(classes) => onChange({ ...node, classes })}
          />
          {node.type === "spacer" && (
            <FieldControl
              field={{
                key: "height",
                kind: "number",
                label: "Height",
                message: "Height can't be negative. Enter 0 or more.",
              }}
              node={node}
              onChange={onChange}
              fetcher={fetcher}
            />
          )}
          {ui.sections.map((section) => {
            if (section === "advanced") {
              return (
                <Section
                  key={section}
                  id={section}
                  open={openSections.has(section)}
                  count={node.htmlId ? 1 : 0}
                  onOpenChange={(open) => setSection(section, open)}
                >
                  <Input
                    label="CSS id"
                    className={`${FIELD} emvb-mono`}
                    value={node.htmlId ?? ""}
                    onChange={(event) => {
                      const next = event.target.value.trim();
                      onChange({
                        ...node,
                        htmlId: next === "" ? undefined : next,
                      });
                    }}
                  />
                </Section>
              );
            }
            const keys = keysFor(node.type, section);
            if (keys.length === 0) return null;
            return (
              <Section
                key={section}
                id={section}
                open={openSections.has(section)}
                count={countSet(node, section)}
                onOpenChange={(open) => setSection(section, open)}
              >
                {keys.map((key) => (
                  <StyleRow
                    key={key}
                    styleKey={key}
                    style={node.style}
                    design={design}
                    onPatch={(patch) => onChange(withStyle(node, patch))}
                    onDesignChange={onDesignChange}
                  />
                ))}
              </Section>
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
