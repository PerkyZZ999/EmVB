import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import type { Fetcher } from "../api.ts";
import { slugTakenMessage } from "../editor/useSave.ts";
import { NewPageDialog } from "./NewPageDialog.tsx";
import { NewThemePartDialog } from "./NewThemePartDialog.tsx";
import { cleanup, mount, rerender } from "../../../test/dom/mount.ts";

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

const settleTicks = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
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
    test("UX-091: the submit button names what it creates, and the slug hint has no jargon", async () => {
      await mount(dialog.render(fetcherReplying(created("x"), [])));
      const createButton = document.querySelector<HTMLButtonElement>('button[type="submit"]');
      expect(createButton?.textContent?.trim() ?? "no button").toBe(`Create ${dialog.noun}`);
      const dialogText = document.querySelector("form[data-emvb-dialog]")?.textContent ?? "";
      expect(dialogText).not.toContain("—");
      expect(dialogText).not.toContain("Internal id");
    });
    test("W-727: pending creation is announced once and unlocks after failure", async () => {
      const pending = Promise.withResolvers<Response>();
      let creates = 0;
      const fetcher: Fetcher = async (_path, init) => {
        if (!init?.body) return Response.json({ data: { items: [] } });
        creates++;
        return creates === 1 ? pending.promise : failed(503, "BUSY", "Try again shortly")();
      };
      await mount(dialog.render(fetcher));
      await type("Title", "Pending creation");
      const form = document.querySelector<HTMLFormElement>("form[data-emvb-dialog]");
      try {
        await act(async () => {
          form?.requestSubmit();
          form?.requestSubmit();
        });
        expect(creates).toBe(1);
        expect(
          document.querySelector('[role="status"][aria-label="Creation status"]')?.textContent,
        ).toBe(`Creating ${dialog.noun}…`);
        // W-826: locked (aria-disabled, read-only fields) rather than disabled, so focus stays.
        const locked = () => [
          button?.getAttribute("aria-disabled"),
          document.querySelector("fieldset")?.getAttribute("aria-disabled"),
          cancel?.getAttribute("aria-disabled"),
          String(input("Title")?.readOnly),
          String(input("Slug")?.readOnly),
        ];
        const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
        const cancel = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
          (b) => b.textContent === "Cancel",
        );
        expect(locked()).toEqual(["true", "true", "true", "true", "true"]);
        expect(button?.getAttribute("aria-busy")).toBe("true");
        await act(async () => pending.resolve(failed(503, "BUSY", "Try again shortly")()));
        expect(alertText()).toBe(`Couldn't create the ${dialog.noun}. Try again shortly`);
        expect(locked()).toEqual(["false", "false", "false", "false", "false"]);
        expect(button?.getAttribute("aria-busy")).toBe("false");
        expect(input("Title")?.value).toBe("Pending creation");
        expect(input("Slug")?.value).toBe(`${dialog.slugPrefix}pending-creation`);
        await submit();
        expect(creates).toBe(2);
      } finally {
        await act(async () => pending.resolve(failed(503, "BUSY", "Try again shortly")()));
      }
    });

    test("W-826: while creating, focus stays on Create and the failure leaves it there", async () => {
      const pending = Promise.withResolvers<Response>();
      let creates = 0;
      const fetcher: Fetcher = async (_path, init) => {
        if (!init?.body) return Response.json({ data: { items: [] } });
        creates++;
        return pending.promise;
      };
      await mount(dialog.render(fetcher));
      await type("Title", "Keep focus");
      const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
      button?.focus();
      await act(async () => button?.click());
      expect(creates).toBe(1);
      expect(button?.disabled).toBe(false);
      expect(document.querySelector("fieldset")?.disabled).toBe(false);
      expect(document.activeElement === button).toBe(true);
      await act(async () => pending.resolve(failed(503, "BUSY", "Try again shortly")()));
      await settleTicks();
      expect(alertText()).toBe(`Couldn't create the ${dialog.noun}. Try again shortly`);
      expect(document.activeElement === button).toBe(true);
    });

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

    test("W-813: a refused or taken slug moves focus to the field in error and marks it invalid", async () => {
      await mount(dialog.render(fetcherReplying(failed(409, "SLUG_CONFLICT", "taken"), [])));
      await submit();
      expect(document.activeElement).toBe(input("Title") ?? null);
      expect(input("Title")?.getAttribute("aria-invalid")).toBe("true");
      await type("Title", "Taken");
      (document.querySelector('button[type="submit"]') as HTMLButtonElement).focus();
      await submit();
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(document.activeElement).toBe(input("Slug") ?? null);
      expect(input("Slug")?.getAttribute("aria-invalid")).toBe("true");
      expect(input("Title")?.hasAttribute("aria-invalid")).toBe(false);
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

test("UX-055: New theme part starts on the type of the filter it was opened from", async () => {
  const fetcher: Fetcher = async () => new Response("{}", { status: 404 });
  const dialog = (open: boolean, startOn: "header" | "footer") => (
    <NewThemePartDialog
      fetcher={fetcher}
      open={open}
      onOpenChange={() => undefined}
      defaultType={startOn}
    />
  );
  // Opened once from Headers, closed, then opened again from the Footers filter.
  await mount(dialog(true, "header"));
  await rerender(dialog(false, "header"));
  await rerender(dialog(true, "footer"));
  const shown = [...document.querySelectorAll('[role="combobox"]')].map((c) =>
    c.textContent?.trim(),
  );
  expect(shown).toEqual(["Footer"]);
});
