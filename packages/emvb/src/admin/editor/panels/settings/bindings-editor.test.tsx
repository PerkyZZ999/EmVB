import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { cleanup, mount } from "../../../../../test/dom/mount.ts";
import { pickOption } from "../../../../../test/dom/select.ts";
import type { LayoutNode } from "../../../../core/index.ts";
import { LiveDataContext } from "../../live-data.tsx";
import { BindingsEditor } from "./BindingsEditor.tsx";

afterEach(cleanup);

const heading: LayoutNode = { id: "head0001", type: "heading", props: { text: "Hi", level: 2 } };

async function editor(node: LayoutNode, params: Record<string, string> = {}) {
  let latest = node;
  const host = await mount(
    <LiveDataContext.Provider
      value={{ site: { title: "Acme" }, params, query: "", setQuery: () => undefined }}
    >
      <BindingsEditor node={node} onChange={(next) => (latest = next)} />
    </LiveDataContext.Provider>,
  );
  return { host, latest: () => latest };
}

const source = (host: HTMLElement, field: string) =>
  host.querySelector(`[data-emvb-bind-source="${field}"]`);

describe("Dynamic data panel (W-307)", () => {
  test("lists the element's bindable fields and binds one to a site setting", async () => {
    const { host, latest } = await editor(heading);
    const rows = [...host.querySelectorAll("[data-emvb-bind-field]")].map((r) =>
      r.getAttribute("data-emvb-bind-field"),
    );
    expect(rows).toEqual(["text", "href"]);
    await pickOption(source(host, "text"), "site");
    expect(latest().bind).toEqual({ text: { source: "site", key: "title" } });
  });

  test("W-307 its controls never share a name with the field they bind", async () => {
    const both = {
      ...heading,
      bind: {
        text: { source: "param" as const, key: "name" },
        href: { source: "param" as const, key: "next" },
      },
    };
    const { host } = await editor(both);
    const labels = [...host.querySelectorAll("label.emvb-bind-label")].map((l) => l.textContent);
    expect(labels).toEqual(["Text source", "Link source"]);
    const named = [...host.querySelectorAll('[role="combobox"]')].map(
      (box) => document.getElementById(box.getAttribute("aria-labelledby") ?? "")?.textContent,
    );
    expect(named).toEqual(["Text source", "Link source"]);
    const keys = [...host.querySelectorAll("input.emvb-native-input[aria-label]")].map((i) =>
      i.getAttribute("aria-label"),
    );
    expect(keys).toEqual(["Text parameter name", "Link parameter name"]);
  });

  test("W-307 a URL-parameter link offers Allow outside sites, with a phishing warning", async () => {
    const link: LayoutNode = {
      id: "link0001",
      type: "link",
      props: { text: "Go", href: "/" },
      bind: { href: { source: "param", key: "next" } },
    };
    const { host, latest } = await editor(link, { next: "https://evil.test/login" });
    const row = host.querySelector('[data-emvb-bind-field="href"]');
    expect(row?.querySelector("[data-emvb-bind-live]")?.textContent).toContain(
      "Not a link on this site",
    );
    const box = row?.querySelector<HTMLInputElement>(
      '[data-emvb-bind-outside] input[type="checkbox"]',
    );
    if (!box) throw new Error("no Allow outside sites checkbox");
    expect(box.checked).toBe(false);
    expect(row?.querySelector(".emvb-bind-warning")).toBeNull();
    await act(async () => box.click());
    expect(latest().bind?.["href"]).toEqual({ source: "param", key: "next", outside: true });

    const allowed = await editor(latest(), { next: "https://evil.test/login" });
    const allowedRow = allowed.host.querySelector('[data-emvb-bind-field="href"]');
    expect(allowedRow?.querySelector(".emvb-bind-warning")?.textContent).toContain("Phishing");
    expect(allowedRow?.querySelector("[data-emvb-bind-live]")?.textContent).toBe(
      "Live: https://evil.test/login",
    );
    // Text fields and other sources never offer it.
    expect(
      allowed.host.querySelector('[data-emvb-bind-field="text"] [data-emvb-bind-outside]'),
    ).toBeNull();
  });

  test("shows the live value, or says the typed value is used", async () => {
    const bound = { ...heading, bind: { text: { source: "param" as const, key: "name" } } };
    const live = await editor(bound, { name: "Ada" });
    expect(live.host.querySelector("[data-emvb-bind-live]")?.textContent).toBe("Live: Ada");
    expect(live.host.querySelector("[data-emvb-preview-query]")).not.toBeNull();
    const none = await editor(bound, {});
    expect(none.host.querySelector("[data-emvb-bind-live]")?.textContent).toContain(
      "typed value shows",
    );
  });

  test("Typed value removes the binding; elements without bindable fields show nothing", async () => {
    const bound = { ...heading, bind: { text: { source: "site" as const, key: "title" } } };
    const { host, latest } = await editor(bound);
    await pickOption(source(host, "text"), "static");
    expect("bind" in latest()).toBe(false);
    const spacer: LayoutNode = {
      id: "spac0001",
      type: "spacer",
      props: { height: { value: 8, unit: "px" } },
    };
    const empty = await editor(spacer);
    expect(empty.host.querySelector("[data-emvb-bindings]")).toBeNull();
  });
});

test("UX-039: an unbound source select is the last item in its row, so it spans the panel", async () => {
  const bound = { ...heading, bind: { href: { source: "site" as const, key: "url" } } };
  const { host } = await editor(bound);
  const last = (field: string) =>
    host.querySelector(`[data-emvb-bind-field="${field}"]`)?.lastElementChild?.className ?? "";
  expect(last("text")).toBe("emvb-panel-select");
  expect(last("href")).not.toBe("emvb-panel-select");
});
