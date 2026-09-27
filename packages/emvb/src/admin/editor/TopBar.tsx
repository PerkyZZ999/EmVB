import { Button } from "@cloudflare/kumo";
import type * as React from "react";
import {
  ArrowSquareOutIcon,
  KeyboardIcon,
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
  onPreview,
  onSave,
  onPublish,
}: {
  page: TopBarPage | null;
  dirty: boolean;
  status: SaveStatus;
  busy: "save" | "publish" | null;
  onExit: () => void;
  onShortcuts: () => void;
  onPreview: () => void;
  onSave: () => void;
  onPublish: () => void;
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
      <div className="emvb-topbar-end">
        <Button
          variant="ghost"
          shape="square"
          className="emvb-icon-btn"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
          icon={<KeyboardIcon aria-hidden="true" />}
          onClick={onShortcuts}
        />
        {page && (
          <>
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
              className={BUTTON}
              style={SOLID_PRIMARY}
              loading={busy === "publish"}
              disabled={busy !== null}
              onClick={onPublish}
            >
              Publish
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
