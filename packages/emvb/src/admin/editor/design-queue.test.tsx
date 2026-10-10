import { afterEach, describe, expect, test } from "bun:test";
import * as React from "react";
import { emptyDesign, type DesignSystem } from "../../core/index.ts";
import { cleanup, mount } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import type { EditorAction, EditorState } from "./store.ts";
import { useEditorCommands } from "./useEditorCommands.ts";
import type { useSave } from "./useSave.ts";

afterEach(cleanup);

describe("site styles saves are queued (W-325)", () => {
  test("quick successive changes save one at a time, each on the revision the last one made", async () => {
    const sent: (string | null)[] = [];
    let active = 0;
    let overlap = false;
    let next = 1;
    const fetcher: Fetcher = async (input, init) => {
      if (!String(input).endsWith("/design/save")) return new Response("{}", { status: 404 });
      active += 1;
      if (active > 1) overlap = true;
      const body = JSON.parse(String(init?.body)) as { revision: string | null };
      sent.push(body.revision);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      const current = `r${next}`;
      if (body.revision !== current) {
        return Response.json({ error: { code: "CONFLICT", message: "x" } }, { status: 409 });
      }
      next += 1;
      return Response.json({ data: { revision: `r${next}` } });
    };
    const actions: EditorAction[] = [];
    let run: ((design: DesignSystem) => Promise<void>) | undefined;
    function Probe() {
      // The store never re-renders here, as when edits land faster than React updates the ref.
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
    const results = await Promise.allSettled([
      run?.(emptyDesign()),
      run?.(emptyDesign()),
      run?.(emptyDesign()),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    expect(overlap).toBe(false);
    expect(sent).toEqual(["r1", "r2", "r3"]);
    const revisions = actions.flatMap((a) => (a.type === "set-design" ? [a.revision] : []));
    expect(revisions).toEqual(["r2", "r3", "r4"]);
  });
});
