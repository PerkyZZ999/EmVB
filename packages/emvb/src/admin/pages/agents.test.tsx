import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../api.ts";
import { AgentsPage } from "./AgentsPage.tsx";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";

afterEach(cleanup);

function fakeApi(role: number, activity = true) {
  const saved: unknown[] = [];
  const fetcher: Fetcher = async (path, init) => {
    if (path === "/_emdash/api/auth/me") return Response.json({ data: { id: "u1", role } });
    if (path.endsWith("/agents/save")) {
      saved.push(JSON.parse(String(init?.body)));
      return Response.json({ data: { revision: `r${saved.length + 1}` } });
    }
    if (path.endsWith("/agents")) {
      return Response.json({
        data: {
          settings: { mcpEnabled: false, publishPages: false, publishStyles: false },
          revision: "r1",
          endpoint: "https://example.com/_emdash/api/mcp",
          activity: !activity
            ? []
            : [
                {
                  id: "a1",
                  at: "2026-10-13T12:00:00.000Z",
                  tool: "add_element",
                  target: "page",
                  pageId: "p1",
                  summary: "Added heading h1",
                  userId: "editor-1",
                },
              ],
        },
      });
    }
    return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  };
  return { fetcher, saved };
}

describe("AI agents page (W-463)", () => {
  test("admins see the switches, the snippets and recent activity", async () => {
    const api = fakeApi(50);
    const host = await mount(<AgentsPage fetcher={api.fetcher} />);
    await settle();
    await settle();
    expect(host.querySelector("[data-emvb-agents=ready]")).not.toBeNull();
    // Live MCP test: the page uses the shared title and card styles, not browser defaults.
    expect(host.querySelector("h1.emvb-page-title")?.textContent).toBe("AI agents");
    expect(host.querySelector("[data-emvb-agents=ready] style")?.textContent).toContain(
      ".emvb-agents-section",
    );
    expect(host.querySelectorAll("section.emvb-surface-card.emvb-agents-section")).toHaveLength(4);
    expect(host.textContent).toContain("Let AI agents edit EmVB pages");
    expect(host.textContent).toContain("Added heading h1");
    const stdio = host.querySelector("[data-emvb-snippet=stdio]")?.textContent ?? "";
    expect(stdio).toContain("@perkyzz/emvb-mcp");
    expect(stdio).toContain('"https://example.com"');
    expect(host.textContent).not.toContain('EMVB_TOKEN": "ec_');
    // W-477: a status pill, icon headings and an Agent badge on each activity row.
    expect(host.querySelector(".emvb-agents-status")?.textContent).toBe("Agents off");
    expect(host.querySelectorAll(".emvb-agents-icon[aria-hidden=true] svg")).toHaveLength(4);
    expect(host.querySelector(".emvb-agents-who .emvb-timeline-agent")?.textContent).toBe("Agent");
  });

  test("W-756: each setup snippet can be reached by keyboard to scroll it, and is named", async () => {
    const host = await mount(<AgentsPage fetcher={fakeApi(50).fetcher} />);
    await settle();
    await settle();
    for (const [kind, name] of [
      ["remote", "Remote setup"],
      ["stdio", "Local setup"],
    ]) {
      const pre = host.querySelector<HTMLElement>(`[data-emvb-snippet=${kind}]`);
      expect(pre?.tabIndex).toBe(0);
      expect(pre?.getAttribute("role")).toBe("group");
      expect(pre?.getAttribute("aria-label")).toBe(name);
    }
    expect(host.querySelector("[data-emvb-agents=ready] style")?.textContent).toContain(
      ".emvb-agents-section pre:focus-visible",
    );
  });

  test("W-477 no activity shows an empty state, not a bare sentence", async () => {
    const host = await mount(<AgentsPage fetcher={fakeApi(50, false).fetcher} />);
    await settle();
    await settle();
    expect(host.querySelector("[data-emvb-agents-empty]")?.textContent).toContain(
      "No agent changes yet",
    );
    expect(host.querySelector("table")).toBeNull();
  });

  test("turning on the master switch saves the settings with the last revision", async () => {
    const api = fakeApi(50);
    const host = await mount(<AgentsPage fetcher={api.fetcher} />);
    await settle();
    await settle();
    const toggle = [...host.querySelectorAll("button[role=switch]")][0] as HTMLButtonElement;
    await act(async () => toggle.click());
    await settle();
    expect(api.saved).toEqual([
      { settings: { mcpEnabled: true, publishPages: false, publishStyles: false }, revision: "r1" },
    ]);
  });

  test("editors are told only administrators can manage agents", async () => {
    const host = await mount(<AgentsPage fetcher={fakeApi(40).fetcher} />);
    await settle();
    expect(host.querySelector("[data-emvb-access=denied]")).not.toBeNull();
  });
});

test("a failed save keeps the page and says the save failed, not the load (W-624)", async () => {
  const api = fakeApi(50);
  const fetcher: Fetcher = async (path, init) =>
    path.endsWith("/agents/save")
      ? Response.json(
          { error: { code: "CONFLICT", message: "Changed elsewhere" } },
          { status: 409 },
        )
      : api.fetcher(path, init);
  const host = await mount(<AgentsPage fetcher={fetcher} />);
  await settle();
  await settle();
  const toggle = [...host.querySelectorAll("button[role=switch]")][0] as HTMLButtonElement;
  await act(async () => toggle.click());
  await settle();
  expect(host.querySelector("[data-emvb-agents=ready]")).not.toBeNull();
  expect(host.textContent).not.toContain("Couldn't load");
  expect(host.textContent).toContain("Couldn't save");
});

test("a conflict says the latest settings are shown, not to reload (W-634)", async () => {
  const api = fakeApi(50);
  const fetcher: Fetcher = async (path, init) =>
    path.endsWith("/agents/save")
      ? Response.json(
          { error: { code: "CONFLICT", message: "The agent settings changed somewhere else." } },
          { status: 409 },
        )
      : api.fetcher(path, init);
  const host = await mount(<AgentsPage fetcher={fetcher} />);
  await settle();
  await settle();
  const toggle = [...host.querySelectorAll("button[role=switch]")][0] as HTMLButtonElement;
  await act(async () => toggle.click());
  await settle();
  await settle();
  expect(host.textContent).toContain("The latest settings are shown now");
  expect(host.textContent).not.toContain("Reload");
});

test("after a conflict the page picks up the saved revision, so the next save works (W-630)", async () => {
  const api = fakeApi(50);
  let conflicted = false;
  const sent: unknown[] = [];
  const fetcher: Fetcher = async (path, init) => {
    if (path.endsWith("/agents/save")) {
      const body = JSON.parse(String(init?.body)) as { revision: string };
      sent.push(body.revision);
      if (body.revision !== "r9") {
        conflicted = true;
        return Response.json(
          { error: { code: "CONFLICT", message: "Changed elsewhere" } },
          { status: 409 },
        );
      }
      return Response.json({ data: { revision: "r10" } });
    }
    const res = await api.fetcher(path, init);
    if (!conflicted || !path.endsWith("/agents")) return res;
    const body = (await res.json()) as { data: Record<string, unknown> };
    return Response.json({ data: { ...body.data, revision: "r9" } });
  };
  const host = await mount(<AgentsPage fetcher={fetcher} />);
  await settle();
  await settle();
  const toggle = () => [...host.querySelectorAll("button[role=switch]")][0] as HTMLButtonElement;
  await act(async () => toggle().click());
  await settle();
  await settle();
  await act(async () => toggle().click());
  await settle();
  await settle();
  expect(sent).toEqual(["r1", "r9"]);
  expect(host.textContent).not.toContain("Couldn't save");
});

test("UX-011: loading names what is loading, and a failed load offers Retry", async () => {
  const api = fakeApi(50);
  let fail = true;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  const fetcher: Fetcher = async (path, init) => {
    if (path.endsWith("/agents")) {
      await held;
      if (fail)
        return Response.json({ error: { code: "BOOM", message: "Server down" } }, { status: 500 });
    }
    return api.fetcher(path, init);
  };
  const host = await mount(<AgentsPage fetcher={fetcher} />);
  await settle();
  const loading = host.querySelector('[role="status"].emvb-list-loading');
  expect(loading?.getAttribute("aria-label") ?? null).toBe("Loading AI agent settings…");
  await act(async () => release());
  await settle();
  await settle();
  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent ?? "").toContain("Couldn't load the AI agent settings");
  fail = false;
  const retry = [...host.querySelectorAll("button")].find((b) => b.textContent === "Retry");
  await act(async () => retry?.click());
  await settle();
  await settle();
  expect(host.querySelector("[data-emvb-agents=ready]") ? "ready" : "not ready").toBe("ready");
});

test("UX-011: a settings change says Saving… and then Saved.", async () => {
  let release: () => void = () => undefined;
  const api = fakeApi(50);
  const fetcher: Fetcher = async (path, init) => {
    if (path.endsWith("/agents/save")) await new Promise<void>((resolve) => (release = resolve));
    return api.fetcher(path, init);
  };
  const host = await mount(<AgentsPage fetcher={fetcher} />);
  await settle();
  await settle();
  const status = () => host.querySelector("[data-emvb-agents-save]");
  expect(status()?.getAttribute("role") ?? null).toBe("status");
  expect(status()?.textContent ?? null).toBe("");
  const master = host.querySelector<HTMLElement>('[role="switch"]');
  await act(async () => master?.click());
  await settle();
  expect(status()?.textContent ?? null).toBe("Saving…");
  await act(async () => release());
  await settle();
  await settle();
  expect(status()?.textContent ?? null).toBe("Saved.");
});

test("UX-089: each setup snippet copies its JSON in one click", async () => {
  const written: string[] = [];
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text: string) => void written.push(text) },
  });
  try {
    const host = await mount(<AgentsPage fetcher={fakeApi(50).fetcher} />);
    await settle();
    await settle();
    const button = host.querySelector<HTMLButtonElement>('[data-emvb-copy-snippet="local setup"]');
    expect(button?.getAttribute("aria-label") ?? "no button").toBe("Copy local setup");
    await act(async () => button?.click());
    await settle();
    expect(written).toEqual([
      host.querySelector("[data-emvb-snippet=stdio]")?.textContent ?? "none",
    ]);
    expect(button?.textContent ?? "no button").toBe("Copied");
    expect(button?.nextElementSibling?.textContent ?? "no status").toBe("Copied");
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  }
});

test("W-777: a failed copy shows on screen and stays until the next click", async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => Promise.reject(new Error("denied")) },
  });
  try {
    const host = await mount(<AgentsPage fetcher={fakeApi(50).fetcher} />);
    await settle();
    await settle();
    const button = host.querySelector<HTMLButtonElement>('[data-emvb-copy-snippet="local setup"]');
    await act(async () => button?.click());
    await settle();
    expect(button?.textContent ?? "no button").toBe("Couldn't copy");
    const status = button?.nextElementSibling;
    expect(status?.textContent ?? "no status").toBe("Couldn't copy. Select the text instead.");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 2100)));
    expect(button?.textContent ?? "no button").toBe("Couldn't copy");
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else delete (navigator as { clipboard?: unknown }).clipboard;
  }
});

test("W-812: the endpoint copy button says it copies the endpoint URL", async () => {
  const host = await mount(<AgentsPage fetcher={fakeApi(50).fetcher} />);
  await settle();
  await settle();
  const names = [...host.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));
  expect(names).toContain("Copy endpoint URL");
  expect(names).not.toContain("Copy to clipboard");
});

test("W-814: a switch stays enabled while saving, so keyboard focus stays on it", async () => {
  let release: () => void = () => undefined;
  const api = fakeApi(50);
  const fetcher: Fetcher = async (path, init) => {
    if (path.endsWith("/agents/save")) await new Promise<void>((resolve) => (release = resolve));
    return api.fetcher(path, init);
  };
  const host = await mount(<AgentsPage fetcher={fetcher} />);
  await settle();
  await settle();
  const master = host.querySelector<HTMLElement>('[role="switch"]');
  master?.focus();
  await act(async () => master?.click());
  await settle();
  expect(host.querySelector("[data-emvb-agents-save]")?.textContent ?? null).toBe("Saving…");
  expect(master?.hasAttribute("disabled")).toBe(false);
  expect(master?.hasAttribute("data-disabled")).toBe(false);
  expect(document.activeElement).toBe(master ?? null);
  // A second change mid-save is ignored, not sent.
  await act(async () => master?.click());
  await settle();
  await act(async () => release());
  await settle();
  await settle();
  expect(api.saved).toHaveLength(1);
});

test("W-815: the activity table, which scrolls sideways on phones, can be reached by keyboard", async () => {
  const host = await mount(<AgentsPage fetcher={fakeApi(50).fetcher} />);
  await settle();
  await settle();
  const table = host.querySelector<HTMLElement>(".emvb-agents-table");
  expect(table?.tabIndex).toBe(0);
  expect(table?.getAttribute("role") ?? null).toBe("group");
  expect(table?.getAttribute("aria-label") ?? null).toBe("Recent agent activity");
});
