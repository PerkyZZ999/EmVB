import type * as React from "react";
import type { DesignSystem, LayoutNode, PopupDevice } from "../../../core/index.ts";
import type { Fetcher } from "../../api.ts";
import type { EditorAction, EditorState } from "../store.ts";
import { ElementPanel } from "./ElementPanel.tsx";
import type { ItemActions } from "./settings/ItemList.tsx";
import type { StyleStateChoice } from "./settings/StateSwitcher.tsx";
import { PageSettings } from "./PageSettings.tsx";
import { SiteStylesDrawer } from "./SiteStylesDrawer.tsx";

/** The right panel: Site styles when open, else the selected element's settings, else page settings. */
export function SettingsPanel({
  state,
  latest,
  dispatch,
  selectedNode,
  siteStylesOpen,
  onCloseSiteStyles,
  onDesignChange,
  onPublishStyles,
  fetcher,
  formsAvailable,
  rejection,
  slugError,
  onSlugEdit,
  kind,
  onStyleState,
  device = "desktop",
  items,
}: {
  state: EditorState;
  latest: React.RefObject<EditorState>;
  dispatch: React.Dispatch<EditorAction>;
  selectedNode: LayoutNode | null | undefined;
  siteStylesOpen: boolean;
  onCloseSiteStyles: () => void;
  onDesignChange: (design: DesignSystem) => Promise<void>;
  onPublishStyles: () => Promise<void>;
  fetcher: Fetcher;
  formsAvailable: boolean;
  rejection: string | null;
  slugError: string | null;
  onSlugEdit: () => void;
  kind: "page" | "theme-part";
  /** The Style tab's chosen state, for the canvas preview (W-089). */
  onStyleState?: (nodeId: string, state: StyleStateChoice) => void;
  /** Which device's styles the Style tab edits (W-096). */
  device?: PopupDevice;
  /** Accordion and Tabs item actions (W-130). */
  items?: ItemActions;
}) {
  return (
    <aside
      className="emvb-panel emvb-panel-right"
      aria-label={
        siteStylesOpen ? "Site styles" : selectedNode ? "Element settings" : "Page settings"
      }
    >
      {siteStylesOpen ? (
        <SiteStylesDrawer
          design={state.design}
          layout={state.page.layout}
          onDesignChange={onDesignChange}
          unpublished={state.designUnpublished === true}
          onPublishStyles={onPublishStyles}
          onLayoutChange={(layout) =>
            dispatch({
              type: "apply-arranged",
              layout,
              selected: latest.current.selectedId ?? layout.root.id,
            })
          }
          onClose={onCloseSiteStyles}
        />
      ) : selectedNode ? (
        <ElementPanel
          key={selectedNode.id}
          node={selectedNode}
          layout={state.page.layout}
          design={state.design}
          rejection={rejection}
          fetcher={fetcher}
          formsAvailable={formsAvailable}
          onChange={(node: LayoutNode) =>
            dispatch({ type: "update-node", id: node.id, update: () => node })
          }
          onDesignChange={onDesignChange}
          onSelect={(id) => dispatch({ type: "select", id })}
          onStyleState={onStyleState}
          device={device}
          items={items}
        />
      ) : (
        <PageSettings
          page={state.page}
          slugError={slugError}
          kind={kind}
          onChange={(patch) => {
            if (patch.slug !== undefined) onSlugEdit();
            dispatch({ type: "set-page", patch });
          }}
        />
      )}
    </aside>
  );
}
