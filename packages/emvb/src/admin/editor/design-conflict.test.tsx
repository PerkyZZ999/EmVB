import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { emptyDesign, type DesignSystem } from "../../core/index.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import type { EditorAction, EditorState } from "./store.ts";
import { useEditorCommands } from "./useEditorCommands.ts";
import type { useSave } from "./useSave.ts";

afterEach(cleanup);

describe("site styles saved in another tab (W-212)", () => {
  test("a refused save loads the latest styles so the next change can save", async () => {
    const fresh = {
      ...emptyDesign(),
      classes: [{ id: "card", name: "Card", style: {} }],
    } as DesignSystem;
    const fetcher: Fetcher = async (input) => {
      const url = String(input);
      if (url.endsWith("/design/save")) {
        return Response.json({ error: { code: "CONFLICT", message: "changed" } }, { status: 409 });
      }
      if (url.endsWith("/design/draft")) {
        return Response.json({
          data: { design: fresh, revision: "r2", publishedRevision: "p1", unpublished: true },
        });
      }
      return new Response("{}", { status: 404 });
    };
    const actions: EditorAction[] = [];
    let run: ((next: DesignSystem) => Promise<void>) | undefined;
    function Probe() {
      const latest = React.useRef({ designRevision: "r1" } as unknown as EditorState);
      const commands = useEditorCommands({
        fetcher,
        collection: "emvb_pages",
        latest,
        dispatch: (action) => actions.push(action),
        saver: {} as ReturnType<typeof useSave>,
        toasts: { add: () => "" } as never,
      });
      run = commands.changeDesign;
      return null;
    }
    await mount(<Probe />);
    let message = "";
    await run?.(emptyDesign()).catch((error: unknown) => {
      message = error instanceof Error ? error.message : "";
    });
    expect(message).toContain("The latest styles are loaded now");
    const loaded = actions.find((a) => a.type === "load-design");
    expect(loaded?.type === "load-design" ? loaded.revision : null).toBe("r2");
    expect(loaded?.type === "load-design" ? loaded.design.classes?.[0]?.id : null).toBe("card");
  });
});
