import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { s1Page } from "../../../test/fixtures/layouts.ts";
import { emptyDesign, validateLayout, type Layout } from "../../core/index.ts";
import type { Fetcher } from "../api.ts";
import { Editor } from "./Editor.tsx";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

function fakeServer() {
  const server = {
    rev: 1,
    data: { title: "Pricing", layout: s1Page() } as Record<string, unknown>,
    puts: [] as Record<string, unknown>[],
  };
  const envelope = () => ({
    data: {
      item: { id: "01PAGE", slug: "pricing", status: "draft", data: server.data, seo: null },
      _rev: `rev${server.rev}`,
    },
  });
  const fetcher: Fetcher = async (path, init) => {
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    if (path === "/_emdash/api/content/emvb_pages/01PAGE" && method === "GET")
      return Response.json(envelope());
    if (path === "/_emdash/api/content/emvb_pages/01PAGE" && method === "PUT") {
      server.rev += 1;
      server.data = body?.["data"] as Record<string, unknown>;
      server.puts.push(server.data);
      return Response.json(envelope());
    }
    if (path === "/_emdash/api/plugins/emvb/design/draft")
      return Response.json({ data: { design: emptyDesign(), revision: "d1" } });
    return Response.json({}, { status: 404 });
  };
  return { server, fetcher };
}

async function render() {
  const { server, fetcher } = fakeServer();
  await mount(<Editor fetcher={fetcher} entryId="01PAGE" />);
  for (let i = 0; i < 200 && !document.querySelector(".emvb-save-status"); i++) {
    // oxlint-disable-next-line no-await-in-loop
    await settle();
  }
  return server;
}

afterEach(async () => {
  await cleanup();
});

async function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
  });
  await settle();
  return event.defaultPrevented;
}

async function selectHeading() {
  const row = document.querySelector<HTMLElement>(
    '[data-emvb-layer="head0001"] .emvb-layer-select',
  );
  if (!row) {
    const layers = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      (el.textContent ?? "").includes("Layers"),
    );
    await act(async () => (layers as HTMLElement).click());
    await settle();
  }
  const heading = document.querySelector<HTMLElement>(
    '[data-emvb-layer="head0001"] .emvb-layer-select',
  );
  await act(async () => heading?.click());
  await settle();
}

describe("undo shortcut (W-095)", () => {
  test("Ctrl+Z puts a deleted element back, and Ctrl+Shift+Z removes it again", async () => {
    const server = await render();
    await selectHeading();
    expect(await press("Delete")).toBe(true);
    expect(await press("z", { ctrlKey: true })).toBe(true);
    await press("s", { ctrlKey: true });
    const layout = server.puts.at(-1)?.["layout"] as Layout;
    expect(validateLayout(layout).ok).toBe(true);
    expect(layout.root.children.some((node) => node.id === "head0001")).toBe(true);
    expect(await press("y", { ctrlKey: true })).toBe(true);
    await press("s", { ctrlKey: true });
    const afterY = server.puts.at(-1)?.["layout"] as Layout;
    expect(afterY.root.children.some((node) => node.id === "head0001")).toBe(false);
    expect(await press("z", { ctrlKey: true })).toBe(true);
    expect(await press("z", { ctrlKey: true, shiftKey: true })).toBe(true);
    await press("s", { ctrlKey: true });
    const redone = server.puts.at(-1)?.["layout"] as Layout;
    expect(redone.root.children.some((node) => node.id === "head0001")).toBe(false);
  });

  test("Ctrl+Z inside a text field is left to the field", async () => {
    await render();
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    expect(await press("z", { ctrlKey: true }, field)).toBe(false);
  });
});
