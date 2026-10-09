import { describe, expect, test } from "bun:test";
import { emptyDesign, renderPage, serialize, type Layout } from "../../core/index.ts";
import { vnodeToReact } from "./canvas/vnode-react.tsx";
import { mount, unmount } from "../../../test/dom/mount.ts";

/** Nested 3-deep flex layout used for S2 canvas/public parity (W-023). */
export const nestedThreeDeep = (): Layout => ({
  schemaVersion: 13,
  root: {
    id: "root0001",
    type: "container",
    props: {},
    style: { flexDirection: "column", gap: { value: 8, unit: "px" } },
    children: [
      {
        id: "mid00001",
        type: "container",
        props: {},
        style: { flexDirection: "row", gap: { value: 12, unit: "px" } },
        children: [
          {
            id: "inn00001",
            type: "container",
            props: {},
            style: {
              flexDirection: "column",
              gap: { value: 4, unit: "px" },
              justifyContent: "center",
            },
            children: [{ id: "head0001", type: "heading", props: { text: "Deep", level: 2 } }],
          },
        ],
      },
    ],
  },
});

const normalize = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.innerHTML;
};

/** Editor mode adds data-emvb-id; public HTML must match once those are stripped (R-005). */
const stripEditorAttrs = (html: string) => html.replace(/\s*data-emvb-id="[^"]*"/g, "");

describe("S2 nested parity (W-023, R-005)", () => {
  test("public HTML equals the canvas HTML for a nested 3-deep flex layout", async () => {
    const layout = nestedThreeDeep();
    const design = emptyDesign();
    const pub = renderPage(layout, design, { mode: "public" });
    const editor = renderPage(layout, design, { mode: "editor" });

    try {
      const host = await mount(<div id="parity">{vnodeToReact(editor.vnode)}</div>);
      const canvas = host.querySelector("#parity")?.innerHTML ?? "";
      expect(normalize(stripEditorAttrs(canvas))).toBe(normalize(pub.html));
      expect(normalize(stripEditorAttrs(serialize(editor.vnode)))).toBe(normalize(pub.html));
    } finally {
      await unmount();
    }
  });

  test("local flex rules are emitted for each nested container", () => {
    const { css } = renderPage(nestedThreeDeep(), emptyDesign(), { mode: "public" });
    expect(css).toContain(".emvb-e-root0001{flex-direction:column;gap:8px}");
    expect(css).toContain(".emvb-e-mid00001{flex-direction:row;gap:12px}");
    expect(css).toContain(".emvb-e-inn00001{flex-direction:column;gap:4px;justify-content:center}");
  });
});
