import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../api.ts";
import { slugTakenMessage } from "../editor/useSave.ts";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { NewThemePartDialog } from "./NewThemePartDialog.tsx";
import { cleanup, mount } from "../../../test/dom/mount.ts";

afterEach(cleanup);

type Sent = { path: string; body: unknown };

/** A fetcher that records each request and answers with `reply`. */
function fetcherReplying(reply: () => Response | Promise<Response>, sent: Sent[]): Fetcher {
  return async (path, init) => {
    sent.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return reply();
  };
}

const created = (id: string) => () =>
  new Response(JSON.stringify({ data: { item: { id } } }), { status: 201 });
const failed = (status: number, code: string, message: string) => () =>
  new Response(JSON.stringify({ error: { code, message } }), { status });

const input = (label: string) =>
  [...document.querySelectorAll("label")]
    .find((l) => l.textContent?.startsWith(label))
    ?.closest("div")
    ?.querySelector("input") ??
  ([...document.querySelectorAll("input")].find((i) => i.getAttribute("aria-label") === label) as
    | HTMLInputElement
    | undefined);

async function type(label: string, value: string) {
  const field = input(label) as HTMLInputElement;
  expect(field).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = document.querySelector("form[data-emvb-dialog]") as HTMLFormElement;
  await act(async () => {
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const alertText = () => document.querySelector('[role="alert"]')?.textContent ?? null;
const text = () => document.body.textContent ?? "";

const dialogs = [
  {
    name: "NewPageDialog",
    render: (fetcher: Fetcher) => <NewPageDialog fetcher={fetcher} open onOpenChange={() => {}} />,
    slugPrefix: "",
    emptyTitle: "Enter a title for the page.",
    noun: "page",
    url: (id: string) => `/_emdash/admin/plugins/emvb/editor?entry=${id}`,
  },
  {
    name: "NewThemePartDialog",
    render: (fetcher: Fetcher) => (
      <NewThemePartDialog fetcher={fetcher} open onOpenChange={() => {}} />
    ),
    slugPrefix: "header-",
    emptyTitle: "Enter a title.",
    noun: "theme part",
    url: (id: string) =>
      `/_emdash/admin/plugins/emvb/editor?entry=${id}&collection=emvb_theme_parts`,
  },
];

for (const dialog of dialogs) {
  describe(dialog.name, () => {
    test("an empty title is refused without a request", async () => {
      const sent: Sent[] = [];
      await mount(dialog.render(fetcherReplying(created("x"), sent)));
      await submit();
      expect(text()).toContain(dialog.emptyTitle);
      expect(sent.filter((item) => item.body !== undefined)).toHaveLength(0);
    });

    test("the slug follows the title until it is edited, then the page opens in the editor", async () => {
      const assign = spyOn(window.location, "assign").mockImplementation(() => {});
      const sent: Sent[] = [];
      await mount(dialog.render(fetcherReplying(created("01NEW"), sent)));
      await type("Title", "About Us");
      expect((input("Slug") as HTMLInputElement).value).toBe(`${dialog.slugPrefix}about-us`);
      await type("Slug", "Custom Slug!");
      await type("Title", "About Them");
      expect((input("Slug") as HTMLInputElement).value).toBe("Custom Slug!");
      await submit();
      const creates = sent.filter((item) => item.body !== undefined);
      expect(creates).toHaveLength(1);
      const body = creates[0]?.body as { slug: string; data: { title: string } };
      expect(body.slug).toBe("custom-slug");
      expect(body.data.title).toBe("About Them");
      expect(assign).toHaveBeenCalledWith(dialog.url("01NEW"));
      assign.mockRestore();
    });

    test("a taken slug is reported on the slug field", async () => {
      await mount(dialog.render(fetcherReplying(failed(409, "SLUG_CONFLICT", "taken"), [])));
      await type("Title", "Taken");
      await submit();
      expect(text()).toContain(slugTakenMessage(`${dialog.slugPrefix}taken`));
      expect(alertText()).toBeNull();
    });

    test("other API errors and network failures show a form-level alert", async () => {
      await mount(dialog.render(fetcherReplying(failed(500, "BOOM", "Server broke"), [])));
      await type("Title", "Oops");
      await submit();
      expect(alertText()).toBe(`Couldn't create the ${dialog.noun}. Server broke`);
      await cleanup();
      await mount(
        dialog.render(fetcherReplying(() => Promise.reject(new TypeError("Failed to fetch")), [])),
      );
      await type("Title", "Offline");
      await submit();
      expect(alertText()).toBe(
        `Couldn't create the ${dialog.noun}. Check your connection and try again.`,
      );
    });
  });
}

test("NewThemePartDialog: choosing another type re-derives an untouched slug", async () => {
  await mount(
    <NewThemePartDialog fetcher={fetcherReplying(created("x"), [])} open onOpenChange={() => {}} />,
  );
  await type("Title", "Main");
  const trigger = document.querySelector('[role="combobox"]') as HTMLElement;
  expect(trigger).toBeTruthy();
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  const footer = [...document.querySelectorAll('[role="option"]')].find(
    (o) => o.textContent === "Footer",
  ) as HTMLElement | undefined;
  expect(footer).toBeTruthy();
  await act(async () => {
    footer?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect((input("Slug") as HTMLInputElement).value).toBe("footer-main");
});
