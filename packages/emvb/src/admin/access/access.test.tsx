import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Fetcher } from "../api.ts";
import { EditorPage } from "../pages/EditorPage.tsx";
import { PagesPage } from "../pages/PagesPage.tsx";
import { RequireEditor } from "./RequireEditor.tsx";
import { canUseEmvb, readRole } from "./role.ts";
import { applySidebarShim, installSidebarShim } from "./sidebar-shim.ts";

const LOWER_ROLES = [10, 20, 30];
const EMVB_ROLES = [40, 50];
const PAGES_HREF = "/_emdash/admin/plugins/emvb/pages";

function fakeApi(role: number | "fail") {
  const calls: string[] = [];
  const fetcher: Fetcher = async (path) => {
    calls.push(path);
    if (role === "fail") return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    if (path === "/_emdash/api/auth/me") return Response.json({ data: { id: "u1", role } });
    return Response.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  };
  return { fetcher, calls };
}

const initialUrl = window.location.href;
let root: Root | undefined;
let host: HTMLElement | undefined;

async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  // Let the role request and the state update after it settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return host;
}

function sidebar() {
  const nav = document.createElement("nav");
  nav.className = "emdash-sidebar";
  const link = document.createElement("a");
  link.href = PAGES_HREF;
  link.textContent = "Visual pages";
  nav.append(link);
  document.body.append(nav);
  return link;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  document.getElementById("emvb-sidebar-shim")?.remove();
  for (const nav of document.querySelectorAll(".emdash-sidebar")) nav.remove();
  window.history.replaceState(null, "", initialUrl);
});

describe("role line (D-020)", () => {
  test.each(LOWER_ROLES)("role %i cannot use EmVB", (role) => {
    expect(canUseEmvb(role)).toBe(false);
  });
  test.each(EMVB_ROLES)("role %i can use EmVB", (role) => {
    expect(canUseEmvb(role)).toBe(true);
  });

  test("a missing or malformed role counts as no role", async () => {
    const fetcher: Fetcher = async () => Response.json({ data: { role: "50" } });
    expect(await readRole(fetcher)).toBe(0);
  });
});

describe("sidebar shim (D-024 b)", () => {
  test.each(LOWER_ROLES)("hides the Visual pages link for role %i", async (role) => {
    const link = sidebar();
    await installSidebarShim(document, fakeApi(role).fetcher);
    expect(getComputedStyle(link).display).toBe("none");
  });

  test.each(EMVB_ROLES)("shows the Visual pages link for role %i", async (role) => {
    const link = sidebar();
    await installSidebarShim(document, fakeApi(role).fetcher);
    expect(document.getElementById("emvb-sidebar-shim")).toBeNull();
    expect(getComputedStyle(link).display).not.toBe("none");
  });

  test("keeps the link hidden while the role is unknown, so it never flashes", () => {
    const link = sidebar();
    applySidebarShim(document, null);
    expect(getComputedStyle(link).display).toBe("none");
  });

  test("shows the link again if the role can't be read, so editors don't lose it", async () => {
    const link = sidebar();
    await installSidebarShim(document, fakeApi("fail").fetcher);
    expect(getComputedStyle(link).display).not.toBe("none");
  });

  test("only targets the EmVB link inside the admin sidebar", async () => {
    const link = sidebar();
    const other = document.createElement("a");
    other.href = "/_emdash/admin/plugins/forms/pages";
    link.parentElement?.append(other);
    const outside = document.createElement("a");
    outside.href = PAGES_HREF;
    document.body.append(outside);
    await installSidebarShim(document, fakeApi(10).fetcher);
    expect(getComputedStyle(other).display).not.toBe("none");
    expect(getComputedStyle(outside).display).not.toBe("none");
    outside.remove();
  });
});

describe("no access state (D-020)", () => {
  test.each(LOWER_ROLES)("role %i sees no access instead of the content", async (role) => {
    const el = await render(
      <RequireEditor fetcher={fakeApi(role).fetcher}>
        {() => <p id="secret">Editor</p>}
      </RequireEditor>,
    );
    expect(el.querySelector('[data-emvb-access="denied"]')?.textContent).toContain(
      "You don't have access to EmVB",
    );
    expect(el.querySelector("#secret")).toBeNull();
  });

  test.each(EMVB_ROLES)("role %i gets the content", async (role) => {
    const el = await render(
      <RequireEditor fetcher={fakeApi(role).fetcher}>
        {(r) => <p id="ok">Role {r}</p>}
      </RequireEditor>,
    );
    expect(el.querySelector("#ok")?.textContent).toBe(`Role ${role}`);
    expect(el.querySelector('[data-emvb-access="denied"]')).toBeNull();
  });

  test("a failed role check is an error, not access", async () => {
    const el = await render(
      <RequireEditor fetcher={fakeApi("fail").fetcher}>
        {() => <p id="secret">Editor</p>}
      </RequireEditor>,
    );
    expect(el.textContent).toContain("Couldn't check your access to EmVB");
    expect(el.querySelector("#secret")).toBeNull();
  });

  test("Visual pages below editor never asks for the schema", async () => {
    const api = fakeApi(30);
    const el = await render(<PagesPage fetcher={api.fetcher} />);
    expect(el.querySelector('[data-emvb-access="denied"]')).not.toBeNull();
    expect(api.calls).toEqual(["/_emdash/api/auth/me"]);
  });

  test("the editor page shows no access below editor, even with an entry", async () => {
    window.history.replaceState(null, "", "/_emdash/admin/plugins/emvb/editor?entry=01ABC");
    const el = await render(<EditorPage fetcher={fakeApi(20).fetcher} />);
    expect(el.querySelector('[data-emvb-access="denied"]')).not.toBeNull();
    expect(el.querySelector("[data-emvb-entry]")).toBeNull();
  });
});

describe("editor page by URL (D-024)", () => {
  test("opens the entry from ?entry=", async () => {
    window.history.replaceState(null, "", "/_emdash/admin/plugins/emvb/editor?entry=01ABC");
    const el = await render(<EditorPage fetcher={fakeApi(40).fetcher} />);
    expect(el.querySelector("[data-emvb-entry]")?.getAttribute("data-emvb-entry")).toBe("01ABC");
  });

  test("without an entry, points back to Visual pages", async () => {
    window.history.replaceState(null, "", "/_emdash/admin/plugins/emvb/editor?entry=%20");
    const el = await render(<EditorPage fetcher={fakeApi(50).fetcher} />);
    expect(el.textContent).toContain("No page selected");
    expect(el.querySelector("a")?.getAttribute("href")).toBe(PAGES_HREF);
  });
});
