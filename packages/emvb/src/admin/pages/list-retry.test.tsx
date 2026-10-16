import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../api.ts";
import { cleanup, mount, rerender, settle } from "../../../test/dom/mount.ts";
import { PageList } from "./PageList.tsx";
import { ThemePartList } from "./ThemePartList.tsx";

afterEach(cleanup);

const response = (id: string) =>
  Response.json({
    data: { items: [{ id, slug: id, status: "draft", data: { title: id, part_type: "header" } }] },
  });
const failed = () =>
  Response.json({ error: { message: "Temporarily unavailable" } }, { status: 503 });

async function retry() {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === "Retry",
  );
  if (!button) throw new Error("List load failed without a Retry button");
  await act(async () => button.click());
}

for (const [name, View] of [
  ["pages", PageList],
  ["theme parts", ThemePartList],
] as const) {
  test(`W-709: ${name} can retry a failed load without reloading the admin`, async () => {
    let calls = 0;
    let answer: (value: Response) => void = () => {
      throw new Error("Retry request has not started");
    };
    const pending = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const fetcher: Fetcher = async () => (++calls === 1 ? failed() : pending);
    await mount(<View fetcher={fetcher} />);
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Temporarily unavailable",
    );
    await retry();
    expect(calls).toBe(2);
    expect(document.querySelector('[role="alert"]') === null).toBe(true);
    await act(async () => {
      answer(response("recovered"));
    });
    await settle();
    expect(document.querySelector('[data-emvb-row="recovered"]') !== null).toBe(true);
    expect(document.body.textContent?.includes("Temporarily unavailable")).toBe(false);
  });

  test(`W-723: ${name} show named loading feedback before initial and retried results`, async () => {
    const initial = Promise.withResolvers<Response>();
    const retried = Promise.withResolvers<Response>();
    let calls = 0;
    const fetcher: Fetcher = async () => (++calls === 1 ? initial.promise : retried.promise);
    const checkLoading = () => {
      const status = document.querySelector('[role="status"]');
      expect(status?.getAttribute("aria-label")).toBe(`Loading ${name}…`);
      expect(status?.textContent).toContain(`Loading ${name}…`);
      expect(document.querySelectorAll(".emvb-list-skeleton-row").length).toBe(3);
      expect(document.querySelector(".emvb-list-skeleton-rows")?.getAttribute("aria-hidden")).toBe(
        "true",
      );
      expect(document.querySelector(".emvb-empty-shell") === null).toBe(true);
    };
    try {
      await mount(<View fetcher={fetcher} />);
      checkLoading();
      await act(async () => initial.resolve(failed()));
      await settle();
      expect(document.querySelector('[role="status"]')?.textContent ?? null).toBeNull();
      await retry();
      checkLoading();
      await act(async () => retried.resolve(Response.json({ data: { items: [] } })));
      await settle();
      expect(document.querySelector('[role="status"]')?.textContent ?? null).toBeNull();
      expect(document.querySelector(".emvb-empty-shell") !== null).toBe(true);
      expect(document.body.textContent).toContain(name === "pages" ? "New page" : "New theme part");
    } finally {
      await act(async () => {
        initial.resolve(failed());
        retried.resolve(Response.json({ data: { items: [] } }));
      });
    }
  });
}

test("W-709: an older retry cannot replace a newer list load", async () => {
  let calls = 0;
  let answer: (value: Response) => void = () => {
    throw new Error("Retry request has not started");
  };
  const pending = new Promise<Response>((resolve) => {
    answer = resolve;
  });
  const first: Fetcher = async () => (++calls === 1 ? failed() : pending);
  const second: Fetcher = async () => response("newer");
  await mount(<PageList fetcher={first} />);
  await settle();
  await retry();
  await rerender(<PageList fetcher={second} />);
  await settle();
  expect(document.querySelector('[data-emvb-row="newer"]') !== null).toBe(true);
  await act(async () => {
    answer(response("older"));
  });
  await settle();
  expect(document.querySelector('[data-emvb-row="newer"]') !== null).toBe(true);
  expect(document.querySelector('[data-emvb-row="older"]') === null).toBe(true);
});
