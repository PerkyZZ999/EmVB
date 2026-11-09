import { afterEach, describe, expect, test } from "bun:test";
import { mount, settle, unmount } from "../../../test/dom/mount.ts";
import type { Fetcher } from "../api.ts";
import { useEditorPresence } from "./presence.ts";

afterEach(unmount);

function Probe({ fetcher }: { fetcher: Fetcher }) {
  useEditorPresence(fetcher, "emvb_pages", "page-1");
  return null;
}

describe("W-929 the editor tells the site the page is open", () => {
  test("open on mount and closed on unmount, for this page", async () => {
    const sent: unknown[] = [];
    const fetcher: Fetcher = async (path, init) => {
      expect(path).toEndWith("/plugins/emvb/presence");
      sent.push(JSON.parse(String(init?.body)));
      return Response.json({ data: { leaseMs: 90_000 } });
    };
    await mount(<Probe fetcher={fetcher} />);
    await settle();
    expect(sent).toEqual([{ target: { collection: "emvb_pages", id: "page-1" }, open: true }]);
    await unmount();
    await settle();
    expect(sent.at(-1)).toEqual({
      target: { collection: "emvb_pages", id: "page-1" },
      open: false,
    });
  });

  test("leaving the page sends the closing beat with keepalive", async () => {
    const sent: RequestInit[] = [];
    const fetcher: Fetcher = async (_path, init) => {
      if (init) sent.push(init);
      return Response.json({ data: { leaseMs: 90_000 } });
    };
    await mount(<Probe fetcher={fetcher} />);
    await settle();
    window.dispatchEvent(new Event("pagehide"));
    await settle();
    const last = sent.at(-1);
    expect(last?.keepalive).toBe(true);
    expect(JSON.parse(String(last?.body))).toMatchObject({ open: false });
  });

  test("a failing heartbeat never throws into the editor", async () => {
    const fetcher: Fetcher = async () => Response.json({ error: { code: "X" } }, { status: 500 });
    await mount(<Probe fetcher={fetcher} />);
    await settle();
    await unmount();
    await settle();
  });
});
