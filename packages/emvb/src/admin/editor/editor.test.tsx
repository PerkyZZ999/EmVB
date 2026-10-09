import { afterEach, describe, expect, mock, test } from "bun:test";
import type * as React from "react";
import { heading, s1Page } from "../../../test/fixtures/layouts.ts";
import { XSS_CORPUS } from "../../../test/fixtures/xss.ts";
import { emptyDesign, renderPage, serialize } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { vnodeToReact } from "./canvas/vnode-react.tsx";
import { Editor } from "./Editor.tsx";
import { EditorOverlay } from "./EditorOverlay.tsx";
import { exitTarget, PAGES_URL } from "./exit.ts";
import { mount, settle, unmount } from "../../../test/dom/mount.ts";

let host: HTMLElement | undefined;

async function render(node: React.ReactNode) {
  host = await mount(node);
  await settle();
}

afterEach(unmount);

const editorRoot = () => document.querySelector<HTMLElement>("[data-emvb-editor]");
const pressModK = (init: KeyboardEventInit) =>
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", bubbles: true, cancelable: true, ...init }),
  );

describe("editor overlay layering (D-011, K13)", () => {
  test("is portaled to document.body, fixed, with z-index auto", async () => {
    await render(<EditorOverlay label="EmVB editor">content</EditorOverlay>);
    const el = editorRoot();
    expect(el?.parentElement === document.body).toBe(true);
    expect(host?.contains(el ?? null)).toBe(false);
    const style = getComputedStyle(el as HTMLElement);
    expect(style.position).toBe("fixed");
    expect(style.zIndex).toBe("auto");
  });

  test.each([{ ctrlKey: true }, { metaKey: true }, { ctrlKey: true, key: "K" }])(
    "mod+K never reaches a document listener (%o)",
    async (init) => {
      await render(<EditorOverlay label="EmVB editor">content</EditorOverlay>);
      const listener = mock(() => {});
      document.addEventListener("keydown", listener);
      pressModK(init);
      document.removeEventListener("keydown", listener);
      expect(listener).not.toHaveBeenCalled();
    },
  );

  test("other keys still reach the host, and mod+K works again after the editor closes", async () => {
    await render(<EditorOverlay label="EmVB editor">content</EditorOverlay>);
    const listener = mock(() => {});
    document.addEventListener("keydown", listener);
    pressModK({});
    pressModK({ ctrlKey: true, key: "s" });
    await unmount();
    pressModK({ ctrlKey: true });
    document.removeEventListener("keydown", listener);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  test("guards leaving only while there are unsaved changes", async () => {
    await render(
      <EditorOverlay label="EmVB editor" dirty>
        content
      </EditorOverlay>,
    );
    const dirtyLeave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyLeave);
    expect(dirtyLeave.defaultPrevented).toBe(true);
    await unmount();
    await render(<EditorOverlay label="EmVB editor">content</EditorOverlay>);
    const cleanLeave = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanLeave);
    expect(cleanLeave.defaultPrevented).toBe(false);
  });
});

describe("exit target (R-001)", () => {
  const origin = "http://127.0.0.1:4411";
  test("returns to the admin page the user came from", () => {
    expect(exitTarget(`${origin}/_emdash/admin/content/emvb_pages/01A?x=1`, origin)).toBe(
      "/_emdash/admin/content/emvb_pages/01A?x=1",
    );
  });
  test.each([
    ["no referrer", ""],
    ["another site", "https://evil.example/_emdash/admin"],
    ["a public page", `${origin}/about`],
    ["the editor itself", `${origin}/_emdash/admin/plugins/emvb/editor?entry=01A`],
    ["garbage", "not a url"],
  ])("falls back to Visual pages for %s", (_name, referrer) => {
    expect(exitTarget(referrer, origin)).toBe(PAGES_URL);
  });
});

describe("canvas markup parity (A-08, R-005)", () => {
  const normalize = (html: string) => {
    const template = document.createElement("template");
    template.innerHTML = html;
    return template.innerHTML;
  };
  const cases: [string, Parameters<typeof renderPage>[0]][] = [
    ["the S1 page", s1Page()],
    ...XSS_CORPUS.map((text, i): [string, Parameters<typeof renderPage>[0]] => [
      `hostile text ${i}`,
      {
        schemaVersion: 13,
        root: {
          id: "root0001",
          type: "container",
          props: {},
          children: [heading("head0001", text)],
        },
      },
    ]),
  ];
  test.each(cases)(
    "the canvas renders the same markup as the public HTML: %s",
    async (_n, layout) => {
      const { vnode } = renderPage(layout, emptyDesign(), { mode: "editor" });
      await render(<div id="parity">{vnodeToReact(vnode)}</div>);
      const rendered = host?.querySelector("#parity")?.innerHTML ?? "";
      expect(rendered).toBe(normalize(serialize(vnode)));
    },
  );

  test("tags and attributes outside the allowlists are dropped, never rendered", async () => {
    await render(
      <div id="parity">
        {vnodeToReact({
          tag: "div",
          attrs: { class: "ok", onclick: "alert(1)", style: "color:red" },
          children: [{ tag: "script", attrs: {}, children: ["alert(1)"] }, "text"],
        })}
      </div>,
    );
    expect(host?.querySelector("#parity")?.innerHTML).toBe('<div class="ok">text</div>');
  });
});

function fakeApi(content: { status: number; body?: unknown }) {
  const fetcher: Fetcher = async (path) => {
    if (path.startsWith("/_emdash/api/content/emvb_pages/"))
      return Response.json(content.body ?? {}, { status: content.status });
    if (path === "/_emdash/api/plugins/emvb/design/draft")
      return Response.json({ data: { design: emptyDesign(), revision: null, status: "empty" } });
    return Response.json({}, { status: 404 });
  };
  return fetcher;
}

const item = (layout: unknown) => ({
  data: {
    item: { id: "01PAGE", status: "draft", data: { title: "Pricing", layout } },
    _rev: "rev1",
  },
});

describe("editor load states", () => {
  test("a missing entry shows Page not found", async () => {
    await render(<Editor fetcher={fakeApi({ status: 404 })} entryId="01GONE" />);
    expect(editorRoot()?.textContent).toContain("Page not found");
  });

  test("a forbidden entry shows that it can't be opened", async () => {
    await render(<Editor fetcher={fakeApi({ status: 403 })} entryId="01PAGE" />);
    expect(editorRoot()?.textContent).toContain("You can't open this page");
  });

  test("an unreadable layout is an error, not a blank canvas", async () => {
    await render(
      <Editor fetcher={fakeApi({ status: 200, body: item("{not json") })} entryId="01PAGE" />,
    );
    expect(editorRoot()?.textContent).toContain("This page's layout can't be read.");
    expect(editorRoot()?.querySelector("iframe")?.outerHTML ?? null).toBeNull();
  });

  test("a readable page opens with its title and a sandboxed canvas without scripts", async () => {
    await render(
      <Editor fetcher={fakeApi({ status: 200, body: item(s1Page()) })} entryId="01PAGE" />,
    );
    expect(editorRoot()?.querySelector(".emvb-topbar-title")?.textContent).toBe("Pricing");
    const frame = editorRoot()?.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame?.hasAttribute("srcdoc")).toBe(true);
  });
});
