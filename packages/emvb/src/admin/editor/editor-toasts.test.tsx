import { afterEach, expect, test } from "bun:test";
import { createKumoToastManager } from "@cloudflare/kumo";
import { act } from "react";
import { cleanup, mount, unmount } from "../../../test/dom/mount.ts";
import { EditorOverlay } from "./EditorOverlay.tsx";
import { EditorToasts } from "./EditorToasts.tsx";

afterEach(cleanup);

test("W-733: owned toast portals follow the editor and clean up without removing host UI", async () => {
  const host = document.createElement("div");
  host.textContent = "Host notification";
  document.body.append(host);
  const manager = createKumoToastManager();
  await mount(
    <EditorOverlay label="Toast ownership">
      <EditorToasts toastManager={manager}>
        <button type="button">Editor content</button>
      </EditorToasts>
    </EditorOverlay>,
  );
  await act(async () => {
    manager.add({ title: "Owned notification", timeout: 0 });
  });
  const owner = document.querySelector("[data-emvb-toasts]");
  const editor = document.querySelector("[data-emvb-editor]");
  expect(owner?.parentElement === document.body).toBe(true);
  expect(Boolean(owner?.textContent?.includes("Owned notification"))).toBe(true);
  expect(owner?.closest("[data-emvb-editor]") === null).toBe(true);
  expect(
    Boolean(
      editor && owner && editor.compareDocumentPosition(owner) & Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  ).toBe(true);
  await unmount();
  expect(document.querySelector("[data-emvb-toasts]") === null).toBe(true);
  expect(host.isConnected).toBe(true);
});
