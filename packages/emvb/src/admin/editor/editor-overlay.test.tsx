import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorOverlay } from "./EditorOverlay.tsx";

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  await act(async () => {
    root?.unmount();
    root = undefined;
  });
  host?.remove();
  host = undefined;
  document.getElementById("admin-root")?.remove();
  document.querySelector("[data-emvb-editor]")?.remove();
});

async function mount(shell: boolean) {
  if (shell) {
    const admin = document.createElement("div");
    admin.id = "admin-root";
    document.body.append(admin);
  }
  host = document.createElement("div");
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(
      <EditorOverlay label="EmVB editor">
        <button type="button">Inside</button>
      </EditorOverlay>,
    );
  });
}

describe("EditorOverlay (W-300)", () => {
  test("marks the EmDash admin shell inert while the editor is open", async () => {
    await mount(true);
    const shell = document.getElementById("admin-root");
    expect(shell?.inert).toBe(true);
    expect(document.querySelector('[data-emvb-editor][aria-label="EmVB editor"]')).not.toBeNull();
    await act(async () => {
      root?.unmount();
      root = undefined;
    });
    expect(shell?.inert).toBe(false);
  });

  test("hosts without #admin-root stay as they are", async () => {
    await mount(false);
    expect(document.getElementById("admin-root")).toBeNull();
    expect(document.querySelector("[data-emvb-editor]")).not.toBeNull();
  });
});
