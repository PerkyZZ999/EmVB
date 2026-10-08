import { afterEach, describe, expect, test } from "bun:test";
import type { Fetcher } from "../api.ts";
import { mount, settle, unmount } from "../../../test/dom/mount.ts";
import { Editor } from "./Editor.tsx";
import { EditorHostContext, type EditorHost } from "./host.ts";
import { SmallScreenNotice } from "./SmallScreenNotice.tsx";

afterEach(unmount);

// The playground on emvb.dev embeds the real editor outside the EmDash admin, so where Exit and
// "Back to …" go is the host's to say. Without a host, they go where they always went.

function recordingHost() {
  const calls: string[] = [];
  const host: EditorHost = {
    exit: () => calls.push("exit"),
    back: { label: "emvb.dev", go: () => calls.push("back") },
  };
  return { host, calls };
}

const buttonNamed = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);

const missing: Fetcher = async (path) =>
  path.includes("/auth/me")
    ? Response.json({ data: { role: 50 } })
    : Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });

describe("editor host", () => {
  test("by default the small-screen notice goes back to Visual pages", async () => {
    await mount(<SmallScreenNotice />);
    expect(buttonNamed("Back to Visual pages")).toBeDefined();
  });

  test("a host names and handles the way back from the small-screen notice", async () => {
    const { host, calls } = recordingHost();
    await mount(
      <EditorHostContext.Provider value={host}>
        <SmallScreenNotice />
      </EditorHostContext.Provider>,
    );
    expect(buttonNamed("Back to Visual pages")).toBeUndefined();
    buttonNamed("Back to emvb.dev")?.click();
    expect(calls).toEqual(["back"]);
  });

  test("a missing page offers the host's way back, and Exit calls the host", async () => {
    const { host, calls } = recordingHost();
    await mount(
      <EditorHostContext.Provider value={host}>
        <Editor fetcher={missing} entryId="01GONE" />
      </EditorHostContext.Provider>,
    );
    await settle();
    const root = document.querySelector("[data-emvb-editor]");
    expect(root?.textContent).toContain("Choose another page from emvb.dev.");
    buttonNamed("Go to emvb.dev")?.click();
    [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Exit"))?.click();
    expect(calls).toEqual(["back", "exit"]);
  });
});
