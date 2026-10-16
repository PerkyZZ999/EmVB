import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../api.ts";
import { useEditorData } from "../editor/useEditorData.ts";
import { SetupShell } from "../pages/SetupShell.tsx";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { RequireEditor } from "./RequireEditor.tsx";

afterEach(cleanup);

const down = () =>
  Response.json({ error: { code: "INTERNAL", message: "Server down" } }, { status: 500 });

const retry = (host: HTMLElement) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent === "Retry");

test("UX-012: the access check names itself, and Retry recovers from a failed check", async () => {
  let fail = true;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  const fetcher: Fetcher = async (path) => {
    if (path !== "/_emdash/api/auth/me") return down();
    await held;
    return fail ? down() : Response.json({ data: { id: "u1", role: 40 } });
  };
  const host = await mount(
    <RequireEditor fetcher={fetcher}>{() => <p data-allowed="">Allowed</p>}</RequireEditor>,
  );
  expect(host.querySelector('[role="status"]')?.textContent ?? null).toBe("Checking your access…");
  await act(async () => release());
  await settle();
  expect(host.querySelector('[role="alert"]')?.textContent ?? "").toContain(
    "Couldn't check your access to EmVB",
  );
  fail = false;
  await act(async () => retry(host)?.click());
  await settle();
  await settle();
  expect(host.querySelector("[data-allowed]")?.textContent ?? null).toBe("Allowed");
});

test("UX-012: setup shows the list's loading card, and Retry brings Set up back after a failure", async () => {
  let fail = true;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  const fetcher: Fetcher = async () => {
    await held;
    return fail ? down() : Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  };
  const host = await mount(
    <SetupShell fetcher={fetcher} role={50} page="pages" title="Visual pages" keptNote="Kept.">
      <p>Ready</p>
    </SetupShell>,
  );
  expect(host.querySelector(".emvb-list-loading")?.getAttribute("aria-label") ?? null).toBe(
    "Loading Visual pages…",
  );
  await act(async () => release());
  await settle();
  await settle();
  expect(host.querySelector('[role="alert"]')?.textContent ?? "").toContain(
    "Couldn't load Visual pages",
  );
  fail = false;
  await act(async () => retry(host)?.click());
  await settle();
  await settle();
  const setUp = [...host.querySelectorAll("button")].find((b) => b.textContent === "Set up EmVB");
  expect(setUp ? "set up offered" : "missing").toBe("set up offered");
});

function Opener({ fetcher }: { fetcher: Fetcher }) {
  const data = useEditorData(fetcher, "page0001");
  return (
    <div data-state={data.state}>
      {data.state === "error" && (
        <button type="button" onClick={data.retry}>
          Retry
        </button>
      )}
    </div>
  );
}

test("UX-012: a page that failed to open can be loaded again without leaving the editor", async () => {
  let calls = 0;
  const fetcher: Fetcher = async () => {
    calls += 1;
    return down();
  };
  const host = await mount(<Opener fetcher={fetcher} />);
  await settle();
  await settle();
  expect(host.querySelector("[data-state]")?.getAttribute("data-state") ?? null).toBe("error");
  const before = calls;
  await act(async () => retry(host)?.click());
  await settle();
  expect(calls > before).toBe(true);
});
