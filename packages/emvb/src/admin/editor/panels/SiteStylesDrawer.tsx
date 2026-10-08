import { Button, Select, Tabs } from "@cloudflare/kumo";
import { deletionOf, type Deletion } from "../restore-deleted.ts";
import { WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  clearClassRefs,
  deleteVariable,
  designFromJson,
  designToJson,
  findClassUsages,
  findVariableUsages,
  findVariableUsagesInDesign,
  importLosses,
  type ImportRename,
  MAX_DESIGN_FILE_BYTES,
  removeVariable,
  DEFAULT_STYLE_TAGS,
  type DefaultStyleTag,
  type DesignSystem,
  type Layout,
  type StyleProps,
  type VariableKind,
} from "../../../core/index.ts";
import { BUTTON, SOLID_DESTRUCTIVE } from "../../ui.ts";
import { ClassesSection } from "./ClassesSection.tsx";
import { stopEditorShortcuts } from "./settings/ClassChip.tsx";
import { StyleRow } from "./settings/StyleRow.tsx";
import { FIELD } from "../../ui.ts";
import { VariableSection } from "./VariableSection.tsx";

const STYLE_NOTE = "Style changes stay unpublished until you publish styles.";

type Props = {
  design: DesignSystem;
  layout: Layout | null;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  unpublished?: boolean;
  onPublishStyles?: () => Promise<void>;
  onLayoutChange: (layout: Layout) => void;
  /** W-252: called with what a delete removes, before the page loses its uses. */
  onDeleted?: (deletion: Deletion) => void;
  onClose: () => void;
};

function InlineError({ children }: { children: string }) {
  return (
    <p className="emvb-inline-error" role="alert">
      <WarningCircleIcon size={16} aria-hidden="true" />
      {children}
    </p>
  );
}

function exportDesign(design: DesignSystem) {
  const blob = new Blob([designToJson(design)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "emvb-design.json";
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Site styles drawer — Variables Manager and Classes Manager (W-032 / W-071).
 * Elementor v4–inspired workflow on EmVB tokens; saves via CAS (D-013 / D-EV4-03).
 */
export function SiteStylesDrawer({
  design,
  layout,
  onDesignChange,
  unpublished = false,
  onPublishStyles,
  onLayoutChange,
  onDeleted,
  onClose,
}: Props) {
  const [tab, setTab] = React.useState<"variables" | "classes" | "defaults">("variables");
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<
    | { kind: "variable"; variableKind: VariableKind; id: string; name: string }
    | { kind: "class"; id: string; name: string }
    | null
  >(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = React.useState<{
    name: string;
    design: DesignSystem;
    renamed: ImportRename[];
  } | null>(null);

  const save = async (next: DesignSystem) => {
    setError(null);
    try {
      await onDesignChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save site styles. Try again.");
    }
  };

  const publish = async () => {
    if (!onPublishStyles) return;
    setError(null);
    try {
      await onPublishStyles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish site styles. Try again.");
    }
  };

  // W-214: Import replaces every class and variable, so it reads a sane size and asks first.
  const importDesign = async (file: File) => {
    setError(null);
    setPendingImport(null);
    if (file.size > MAX_DESIGN_FILE_BYTES) {
      setError("That file is too big to be an EmVB design (over 1 MB).");
      return;
    }
    const text = await file.text();
    const result = designFromJson(text);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPendingImport({ name: file.name, design: result.design, renamed: result.renamed });
  };

  return (
    <div
      className="emvb-panel-body emvb-site-styles"
      data-emvb-site-styles=""
      onKeyDown={stopEditorShortcuts}
    >
      <div className="emvb-site-styles-head">
        <div className="emvb-site-styles-titles">
          <h2 className="emvb-panel-title">Site styles</h2>
          <p className="emvb-helper emvb-site-styles-subtitle" data-emvb-manager-label="">
            {tab === "variables"
              ? "Variables Manager"
              : tab === "classes"
                ? "Classes Manager"
                : "Defaults"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          shape="square"
          className="emvb-icon-btn"
          aria-label="Close site styles"
          icon={<XIcon aria-hidden="true" />}
          onClick={onClose}
        />
      </div>
      {/* W-115: the actions get their own wrapping row, so the title is never squeezed. */}
      <div
        className="emvb-site-styles-actions"
        role="group"
        aria-label="Site styles actions"
        data-emvb-site-styles-actions=""
      >
        {unpublished && (
          <Button type="button" variant="primary" size="sm" onClick={() => void publish()}>
            Publish styles
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={() => exportDesign(design)}>
          Export
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          data-emvb-design-import=""
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void importDesign(file);
          }}
        />
      </div>
      <Tabs
        variant="underline"
        className="emvb-tabs"
        tabs={[
          { value: "variables", label: "Variables" },
          { value: "classes", label: "Classes" },
          { value: "defaults", label: "Defaults" },
        ]}
        value={tab}
        onValueChange={(value) =>
          setTab(value === "classes" ? "classes" : value === "defaults" ? "defaults" : "variables")
        }
      />
      {error && <InlineError>{error}</InlineError>}
      {tab === "variables" && (
        <div data-emvb-site-tab="variables" className="emvb-site-styles-body">
          <VariableSection
            title="Colors"
            kind="color"
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) =>
              setConfirm({ kind: "variable", variableKind: "color", id, name })
            }
          />
          <VariableSection
            title="Fonts"
            kind="font"
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) =>
              setConfirm({ kind: "variable", variableKind: "font", id, name })
            }
          />
          <VariableSection
            title="Font sizes"
            kind="fontSize"
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) =>
              setConfirm({ kind: "variable", variableKind: "fontSize", id, name })
            }
          />
          <VariableSection
            title="Spacing"
            kind="spacing"
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) =>
              setConfirm({ kind: "variable", variableKind: "spacing", id, name })
            }
          />
        </div>
      )}
      {tab === "classes" && (
        <div data-emvb-site-tab="classes" className="emvb-site-styles-body">
          <ClassesSection
            design={design}
            layout={layout}
            onSave={save}
            onAskDelete={(id, name) => setConfirm({ kind: "class", id, name })}
          />
        </div>
      )}
      {tab === "defaults" && (
        <div data-emvb-site-tab="defaults" className="emvb-site-styles-body">
          <DirectionSelect design={design} onSave={save} />
          <DefaultsSection design={design} onSave={save} />
        </div>
      )}
      <p className="emvb-helper emvb-site-styles-footer">{STYLE_NOTE}</p>
      {pendingImport && (
        <ImportConfirm
          name={pendingImport.name}
          renamed={pendingImport.renamed}
          losses={importLosses(design, pendingImport.design, layout)}
          onCancel={() => setPendingImport(null)}
          onConfirm={async () => {
            const next = pendingImport.design;
            setPendingImport(null);
            await save(next);
          }}
        />
      )}
      {confirm && (
        <DeleteConfirm
          confirm={confirm}
          design={design}
          layout={layout}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if (layout) {
              const deletion = deletionOf(
                design,
                layout,
                confirm.kind === "variable"
                  ? { kind: "variable", id: confirm.id, variableKind: confirm.variableKind }
                  : { kind: "class", id: confirm.id },
              );
              if (deletion) onDeleted?.(deletion);
            }
            if (confirm.kind === "variable") {
              if (layout) {
                const result = deleteVariable(design, layout, confirm.id, confirm.variableKind);
                onLayoutChange(result.layout);
                await save(result.design);
              } else {
                await save(removeVariable(design, confirm.id, confirm.variableKind));
              }
            } else {
              const classes = (design.classes ?? []).filter((c) => c.id !== confirm.id);
              if (layout) onLayoutChange(clearClassRefs(layout, confirm.id));
              await save({ ...design, classes });
            }
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * W-251: only this page and the design are checked; other pages and theme parts that use the
 * class or variable lose that styling, so the dialog says so instead of implying it is unused.
 */
const NOT_CHECKED =
  "Other pages and theme parts aren't checked; any that use it lose that styling.";

/** "2 places on this page and 1 class", or null when nothing uses it. */
function usedIn(pageUses: number, classUses: number): string | null {
  const parts = [
    pageUses > 0 ? `${plural(pageUses, "place", "places")} on this page` : "",
    classUses > 0 ? plural(classUses, "class", "classes") : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" and ") : null;
}

function DeleteConfirm({
  confirm,
  design,
  layout,
  onCancel,
  onConfirm,
}: {
  confirm:
    | { kind: "variable"; variableKind: VariableKind; id: string; name: string }
    | { kind: "class"; id: string; name: string };
  design: DesignSystem;
  layout: Layout | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const variable = confirm.kind === "variable";
  const pageUses = !layout
    ? 0
    : variable
      ? findVariableUsages(layout, confirm.id, confirm.variableKind).length
      : findClassUsages(layout, confirm.id).length;
  const classUses = variable
    ? new Set(
        findVariableUsagesInDesign(design, confirm.id, confirm.variableKind).map((u) => u.classId),
      ).size
    : 0;
  const where = usedIn(pageUses, classUses);
  return (
    <div className="emvb-site-confirm" data-emvb-site-confirm="" role="alertdialog">
      <p className="emvb-field-label">Delete {confirm.name}?</p>
      <p className="emvb-helper">
        {where
          ? `In use in ${where}. Deleting drops those bindings.`
          : variable
            ? "Not used on this page or by any class."
            : "Not used on this page."}{" "}
        {NOT_CHECKED}
      </p>
      <div className="emvb-dialog-actions">
        <Button type="button" variant="secondary" className={BUTTON} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          className={BUTTON}
          style={SOLID_DESTRUCTIVE}
          onClick={onConfirm}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

const DEFAULT_KEYS = ["color", "fontSize", "fontWeight", "textAlign"] as const;

function DefaultsSection({
  design,
  onSave,
}: {
  design: DesignSystem;
  onSave: (design: DesignSystem) => Promise<void>;
}) {
  const [tag, setTag] = React.useState<DefaultStyleTag>("p");
  const style = design.defaults?.[tag];
  const patch = (partial: Partial<StyleProps>) => {
    const next: StyleProps = { ...style, ...partial };
    for (const key of Object.keys(partial) as (keyof StyleProps)[]) {
      if (partial[key] === undefined) delete next[key];
    }
    const defaults = {
      ...design.defaults,
      [tag]: Object.keys(next).length > 0 ? next : undefined,
    };
    void onSave({ ...design, defaults });
  };
  return (
    <>
      <p className="emvb-helper">
        Elements of this tag start here. A class or a local style still wins.
      </p>
      <Select
        label="Tag"
        className={FIELD}
        value={tag}
        onValueChange={(value) => setTag(value as DefaultStyleTag)}
      >
        {DEFAULT_STYLE_TAGS.map((item) => (
          <Select.Option key={item} value={item}>
            {item}
          </Select.Option>
        ))}
      </Select>
      {DEFAULT_KEYS.map((key) => (
        <StyleRow
          key={`${tag}:${key}`}
          styleKey={key}
          style={style}
          design={design}
          onPatch={patch}
          onDesignChange={onSave}
        />
      ))}
    </>
  );
}

/** W-214: confirms an Import, which replaces the whole design (there is no revision history). */
/** W-283: how many renamed names the Import confirm lists before "and N more". */
const MAX_RENAMES_LISTED = 5;

function ImportConfirm({
  name,
  renamed,
  losses,
  onCancel,
  onConfirm,
}: {
  name: string;
  renamed: ImportRename[];
  losses: ReturnType<typeof importLosses>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const lost = [
    losses.classes > 0 ? plural(losses.classes, "class", "classes") : "",
    losses.variables > 0 ? plural(losses.variables, "variable", "variables") : "",
  ].filter(Boolean);
  return (
    <div className="emvb-site-confirm" data-emvb-import-confirm="" role="alertdialog">
      <p className="emvb-field-label">Replace site styles with {name}?</p>
      <p className="emvb-helper">
        {lost.length > 0
          ? `${lost.join(" and ")} that the file doesn't have will be removed. `
          : "Every class and variable is replaced by the file's. "}
        {losses.usedOnPage > 0 &&
          `This page uses ${losses.usedOnPage} of them, so those elements lose that styling. `}
        Export first to keep a copy.
      </p>
      {renamed.length > 0 && (
        <p className="emvb-helper" data-emvb-import-renamed="">
          {`The file repeats some names, so ${renamed.length === 1 ? "one is" : "these are"} renamed: `}
          {renamed
            .slice(0, MAX_RENAMES_LISTED)
            .map((r) => `${r.from} → ${r.to}`)
            .join(", ")}
          {renamed.length > MAX_RENAMES_LISTED
            ? ` and ${renamed.length - MAX_RENAMES_LISTED} more.`
            : "."}
        </p>
      )}
      <div className="emvb-dialog-actions">
        <Button type="button" variant="secondary" className={BUTTON} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          className={BUTTON}
          style={SOLID_DESTRUCTIVE}
          onClick={onConfirm}
        >
          Replace
        </Button>
      </div>
    </div>
  );
}

const DIRECTIONS = [
  { value: "ltr", label: "Left to right" },
  { value: "rtl", label: "Right to left" },
  { value: "auto", label: "From the content" },
] as const;

/** Site text direction (W-230): `dir` on every EmVB root and the host's `<html>`. */
function DirectionSelect({
  design,
  onSave,
}: {
  design: DesignSystem;
  onSave: (next: DesignSystem) => Promise<unknown> | void;
}) {
  return (
    <div data-emvb-site-direction="">
      <Select
        label="Text direction"
        className={FIELD}
        value={design.direction ?? "ltr"}
        renderValue={(v: unknown) =>
          DIRECTIONS.find((item) => item.value === String(v))?.label ?? String(v)
        }
        onValueChange={(value) => {
          const { direction: _old, ...rest } = design;
          // Left to right is the default, so it is stored as no setting.
          const next: DesignSystem =
            value === "rtl" || value === "auto" ? { ...rest, direction: value } : rest;
          if ((next.direction ?? "ltr") !== (design.direction ?? "ltr")) void onSave(next);
        }}
      >
        {DIRECTIONS.map((item) => (
          <Select.Option key={item.value} value={item.value}>
            {item.label}
          </Select.Option>
        ))}
      </Select>
      <p className="emvb-helper">
        Right to left mirrors the layout for Arabic, Hebrew and other right-to-left sites.
      </p>
    </div>
  );
}
