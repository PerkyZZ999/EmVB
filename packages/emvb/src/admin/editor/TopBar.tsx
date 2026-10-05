import { Button } from "@cloudflare/kumo";
import type * as React from "react";
import {
  ArrowSquareOutIcon,
  KeyboardIcon,
  PaintBrushIcon,
  SignOutIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { BUTTON, SOLID_PRIMARY } from "../ui.ts";
import type { SaveStatus } from "./useSave.ts";

export type TopBarPage = { title: string; status: string };

function SaveStatusText({
  status,
  dirty,
  onRetry,
}: {
  status: SaveStatus;
  dirty: boolean;
  onRetry: () => void;
}) {
  let content: React.ReactNode = null;
  if (status.kind === "saving") content = "Saving…";
  else if (status.kind === "error") {
    content = (
      <>
        <WarningCircleIcon size={16} aria-hidden="true" className="emvb-danger-icon" />
        {status.message}
        {status.retry && (
          <button type="button" className="emvb-link-button" onClick={onRetry}>
            Retry
          </button>
        )}
      </>
    );
  } else if (dirty) content = "Unsaved changes";
  else if (status.kind === "saved") content = "Saved";
  return (
    <div className="emvb-save-status" role="status" aria-live="polite" data-emvb-save={status.kind}>
      {content}
    </div>
  );
}

/** Top bar (IA): Exit, page, status | save status | shortcuts, Preview, Save draft, Publish. */
export function TopBar({
  page,
  dirty,
  status,
  busy,
  onExit,
  onShortcuts,
  onSiteStyles,
  onPreview,
  onSave,
  onPublish,
  stylesUnpublished = false,
}: {
  page: TopBarPage | null;
  dirty: boolean;
  status: SaveStatus;
  busy: "save" | "publish" | null;
  onExit: () => void;
  onShortcuts: () => void;
  onSiteStyles?: () => void;
  onPreview: () => void;
  onSave: () => void;
  onPublish: () => void;
  /** Site styles have unpublished changes (W-153): the Publish button carries a dot. */
  stylesUnpublished?: boolean;
}) {
  return (
    <header className="emvb-topbar">
      <div className="emvb-topbar-start">
        <Button
          variant="ghost"
          className={BUTTON}
          icon={<SignOutIcon aria-hidden="true" />}
          onClick={onExit}
        >
          Exit
        </Button>
        {page && (
          <>
            <span className="emvb-topbar-title">{page.title || "Untitled page"}</span>
            <span className="emvb-status" data-status={page.status}>
              <span className="emvb-status-dot" aria-hidden="true" />
              {page.status === "published" ? "Published" : "Draft"}
            </span>
          </>
        )}
      </div>
      {page ? <SaveStatusText status={status} dirty={dirty} onRetry={onSave} /> : <div />}
      <div
        className="emvb-topbar-end"
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          alignItems: "center",
          gap: 6,
        }}
      >
        <div
          className="emvb-topbar-tools"
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "nowrap",
            alignItems: "center",
            gap: 2,
          }}
        >
          <Button
            variant="ghost"
            shape="square"
            className="emvb-icon-btn"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            icon={<KeyboardIcon aria-hidden="true" />}
            onClick={onShortcuts}
          />
          {page && onSiteStyles && (
            <Button
              variant="ghost"
              shape="square"
              className="emvb-icon-btn"
              aria-label="Site styles"
              title="Site styles"
              icon={<PaintBrushIcon aria-hidden="true" />}
              onClick={onSiteStyles}
            />
          )}
        </div>
        {page && (
          <div
            className="emvb-topbar-actions"
            style={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "nowrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Button
              variant="secondary"
              className={BUTTON}
              icon={<ArrowSquareOutIcon aria-hidden="true" />}
              onClick={onPreview}
            >
              Preview
            </Button>
            <Button
              variant="secondary"
              className={`${BUTTON} emvb-save-button`}
              loading={busy === "save"}
              disabled={busy !== null}
              aria-label={dirty ? "Save draft (unsaved changes)" : "Save draft"}
              onClick={onSave}
            >
              Save draft
              {dirty && <span className="emvb-unsaved-dot" aria-hidden="true" />}
            </Button>
            <Button
              variant="primary"
              className={`${BUTTON} emvb-publish-button`}
              style={SOLID_PRIMARY}
              loading={busy === "publish"}
              disabled={busy !== null}
              aria-label={stylesUnpublished ? "Publish (site styles unpublished)" : undefined}
              title={
                stylesUnpublished
                  ? "Site styles have unpublished changes. After publishing the page, you can publish them too."
                  : undefined
              }
              data-emvb-styles-pending={stylesUnpublished ? "true" : undefined}
              onClick={onPublish}
            >
              Publish
              {stylesUnpublished && <span className="emvb-styles-dot" aria-hidden="true" />}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
