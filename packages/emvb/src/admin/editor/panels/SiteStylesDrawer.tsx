import { Button, Tabs } from "@cloudflare/kumo";
import { WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  clearClassRefs,
  deleteVariable,
  findClassUsages,
  findVariableUsages,
  findVariableUsagesInDesign,
  removeVariable,
  type DesignSystem,
  type Layout,
  type VariableKind,
} from "../../../core/index.ts";
import { BUTTON, SOLID_DESTRUCTIVE } from "../../ui.ts";
import { ClassesSection } from "./ClassesSection.tsx";
import { stopEditorShortcuts } from "./settings/ClassChip.tsx";
import { VariableSection } from "./VariableSection.tsx";

type Props = {
  design: DesignSystem;
  layout: Layout | null;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  onLayoutChange: (layout: Layout) => void;
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

/**
 * Site styles drawer — Variables Manager and Classes Manager (W-032 / W-071).
 * Elementor v4–inspired workflow on EmVB tokens; saves via CAS (D-013 / D-EV4-03).
 */
export function SiteStylesDrawer({
  design,
  layout,
  onDesignChange,
  onLayoutChange,
  onClose,
}: Props) {
  const [tab, setTab] = React.useState<"variables" | "classes">("variables");
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<
    | { kind: "variable"; variableKind: VariableKind; id: string; name: string }
    | { kind: "class"; id: string; name: string }
    | null
  >(null);

  const save = async (next: DesignSystem) => {
    setError(null);
    try {
      await onDesignChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save site styles. Try again.");
    }
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
            {tab === "variables" ? "Variables Manager" : "Classes Manager"}
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
      <Tabs
        variant="underline"
        className="emvb-tabs"
        tabs={[
          { value: "variables", label: "Variables" },
          { value: "classes", label: "Classes" },
        ]}
        value={tab}
        onValueChange={(value) => setTab(value === "classes" ? "classes" : "variables")}
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
      <p className="emvb-helper emvb-site-styles-footer">
        Changes to site styles apply to all pages immediately.
      </p>
      {confirm && (
        <DeleteConfirm
          confirm={confirm}
          design={design}
          layout={layout}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
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
  const usages =
    confirm.kind === "variable"
      ? [
          ...(layout ? findVariableUsages(layout, confirm.id, confirm.variableKind) : []),
          ...findVariableUsagesInDesign(design, confirm.id, confirm.variableKind),
        ]
      : layout
        ? findClassUsages(layout, confirm.id)
        : [];
  return (
    <div className="emvb-site-confirm" data-emvb-site-confirm="" role="alertdialog">
      <p className="emvb-field-label">Delete {confirm.name}?</p>
      {usages.length > 0 ? (
        <p className="emvb-helper">
          In use on {usages.length} {usages.length === 1 ? "place" : "places"} on this page.
          Deleting drops those bindings.
        </p>
      ) : (
        <p className="emvb-helper">Not used on this page.</p>
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
          Delete
        </Button>
      </div>
    </div>
  );
}
