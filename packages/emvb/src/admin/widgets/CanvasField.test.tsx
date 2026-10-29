import { afterEach, describe, expect, mock, test } from "bun:test";
import { act } from "react";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { emptyDesign } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { CanvasField } from "./CanvasField.tsx";
import { createFieldFetcher, FIELD_ENTRY_ID } from "./field-fetcher.ts";
import { mount, settle, unmount } from "../../../test/dom/mount.ts";

afterEach(unmount);

const FIELD_PATH = `/_emdash/api/content/emvb_pages/${FIELD_ENTRY_ID}`;

function server(role: number) {
  const seen: string[] = [];
  const fetcher: Fetcher = async (path) => {
    seen.push(path);
    if (path === "/_emdash/api/auth/me") return Response.json({ data: { role } });
    if (path === "/_emdash/api/plugins/emvb/design/draft")
      return Response.json({ data: { design: emptyDesign(), revision: null, status: "empty" } });
    return Response.json({}, { status: 404 });
  };
  return { fetcher, seen };
}

async function render(value: unknown, role = 40) {
  const api = server(role);
  const onChange = mock<(value: unknown) => void>(() => {});
  const host = await mount(
    <CanvasField
      value={value}
      onChange={onChange}
      label="Canvas"
      id="field-canvas"
      fetcher={api.fetcher}
    />,
  );
  await settle();
  return { host, onChange, api };
}

const editorRoot = () => document.querySelector<HTMLElement>("[data-emvb-editor]");
const button = (root: ParentNode | null, text: string) =>
  [...(root?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === text);
const click = async (el: HTMLElement | undefined) => {
  await act(async () => el?.click());
  await settle();
};

describe("emvb:canvas field widget (W-900)", () => {
  test("an editor opens the field in EmVB; Apply writes the layout back to the form", async () => {
    const { host, onChange, api } = await render(JSON.stringify(s1Page()));
    expect(host.textContent).toContain("2 elements");
    await click(button(host, "Edit with EmVB"));
    const root = editorRoot();
    expect(root).not.toBeNull();
    expect(button(root, "Publish")).toBeUndefined();
    expect(root?.querySelector(".emvb-save-button")).toBeNull();
    await click(button(root, "Apply"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toEqual(s1Page());
    expect(editorRoot()).toBeNull();
    expect(api.seen.some((path) => path.startsWith(FIELD_PATH))).toBe(false);
  });

  test("Exit without saving leaves the field untouched", async () => {
    const { host, onChange } = await render(s1Page());
    await click(button(host, "Edit with EmVB"));
    await click(button(editorRoot(), "Exit"));
    expect(editorRoot()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("an author sees the summary but can't open the editor (D-061)", async () => {
    const { host } = await render(s1Page(), 30);
    expect(button(host, "Edit with EmVB")).toBeUndefined();
    expect(host.textContent).toContain("Only editors and administrators can change this layout.");
  });

  test("an unreadable value is reported, never rendered", async () => {
    const { host } = await render('{"schemaVersion":1,"root":"<img src=x onerror=alert(1)>"}');
    expect(host.textContent).toContain("This layout can't be read.");
    expect(host.querySelector("img")).toBeNull();
  });
});

describe("field-mode fetcher (W-900)", () => {
  test("serves the field as a draft entry and stages only valid layouts", async () => {
    const base = mock<Fetcher>(async () => Response.json({ data: {} }));
    const session = createFieldFetcher(base, { title: "Canvas", layout: null });
    const got = (await (await session.fetcher(FIELD_PATH)).json()) as {
      data: { item: { data: { title: string } } };
    };
    expect(got.data.item.data.title).toBe("Canvas");
    const put = (layout: unknown) =>
      session.fetcher(FIELD_PATH, { method: "PUT", body: JSON.stringify({ data: { layout } }) });
    expect((await put({ schemaVersion: 1, root: "nope" })).status).toBe(400);
    expect(session.saved()).toBeUndefined();
    expect((await put(s1Page())).status).toBe(200);
    expect(session.saved()).toEqual(s1Page());
    expect((await session.fetcher(`${FIELD_PATH}/publish`, { method: "POST" })).status).toBe(400);
    expect(base).not.toHaveBeenCalled();
    await session.fetcher("/_emdash/api/plugins/emvb/design/draft");
    expect(base).toHaveBeenCalledTimes(1);
  });
});
