import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../api.ts";
import { cleanup, mount, settle } from "../../../test/dom/mount.ts";
import { SetupShell } from "./SetupShell.tsx";

afterEach(cleanup);

test("W-830: Set up EmVB keeps keyboard focus while setup runs and ignores a repeat press", async () => {
  let writes = 0;
  const held = Promise.withResolvers<Response>();
  const fetcher: Fetcher = async (_path, init) => {
    if ((init?.method ?? "GET") === "GET") {
      return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    }
    writes++;
    return held.promise;
  };
  const host = await mount(
    <SetupShell fetcher={fetcher} role={50} page="pages" title="Visual pages" keptNote="Kept.">
      <p>Ready</p>
    </SetupShell>,
  );
  await settle();
  await settle();
  const setUp = [...host.querySelectorAll("button")].find((b) => b.textContent === "Set up EmVB");
  if (!setUp) throw new Error("no Set up EmVB button");
  setUp.focus();
  await act(async () => setUp.click());
  await settle();
  const first = writes;
  expect(first).toBeGreaterThan(0);
  expect(setUp.disabled).toBe(false);
  expect(setUp.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement === setUp).toBe(true);
  await act(async () => setUp.click());
  await settle();
  expect(writes).toBe(first);
  held.resolve(Response.json({ error: { code: "INTERNAL", message: "stop" } }, { status: 500 }));
  await settle();
});
