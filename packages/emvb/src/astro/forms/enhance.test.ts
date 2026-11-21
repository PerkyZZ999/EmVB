import { afterEach, describe, expect, test } from "bun:test";
import { initForms } from "@emdash-cms/plugin-forms/client";
import { emptyDesign, renderPage, type Layout, type LayoutNode } from "../../core/index.ts";
import type { PublicFormDefinition } from "../../core/forms/definition.ts";
import { enhanceForms, focusFirstInvalid, syncInvalid } from "./enhance.ts";

const definition: PublicFormDefinition = {
  name: "Trip",
  slug: "trip",
  status: "active",
  settings: {},
  pages: [
    {
      fields: [
        { name: "name", type: "text", label: "Name", required: true },
        { name: "email", type: "email", label: "Email", required: true },
        { name: "guests", type: "number", label: "Guests", required: true },
      ],
    },
  ],
};

const input = (id: string, field: string): LayoutNode =>
  ({ id, type: "text-input", props: { field, label: field } }) as LayoutNode;

function mount(children: LayoutNode[]) {
  const layout: Layout = {
    schemaVersion: 18,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      children: [
        { id: "form0001", type: "form", props: { formId: "trip" }, children } as LayoutNode,
      ],
    },
  };
  const { html } = renderPage(layout, emptyDesign(), {
    formDefinitions: new Map([["trip", definition]]),
  });
  document.body.innerHTML = html;
  sessionStorage.clear();
  initForms();
  enhanceForms(document);
  const q = <T extends Element>(selector: string) => document.querySelector(selector) as T;
  return { q, form: q<HTMLFormElement>("form"), html };
}

const stepped = () =>
  mount([
    {
      id: "step0001",
      type: "form-step",
      props: { title: "You" },
      children: [input("inpt0001", "name"), input("inpt0002", "email")],
    } as LayoutNode,
    {
      id: "step0002",
      type: "form-step",
      props: {},
      children: [input("inpt0003", "guests")],
    } as LayoutNode,
    { id: "subm0001", type: "submit", props: { label: "Book" } } as LayoutNode,
  ]);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("forms enhancement (W-1065)", () => {
  test("the form skips the browser's own check, in the markup and from the forms script", () => {
    const { form, html } = stepped();
    expect(html).toContain('novalidate=""');
    expect(form.noValidate).toBe(true);
  });

  test("the forms script shows one step, Next, and hides Submit until the last step", () => {
    const { q } = stepped();
    expect(q<HTMLElement>('[data-page="0"]').hidden).toBe(false);
    expect(q<HTMLElement>('[data-page="1"]').hidden).toBe(true);
    expect(q<HTMLButtonElement>("[data-ec-next]").hidden).toBe(false);
    expect(q<HTMLButtonElement>("[data-ec-prev]").hidden).toBe(true);
    expect(q<HTMLButtonElement>(".ec-form-submit").hidden).toBe(true);
    expect(q("[data-ec-progress]").textContent).toBe("Step 1 of 2");
  });

  test("Next with an empty required field stays, marks it invalid and focuses it", () => {
    const { q } = stepped();
    q<HTMLButtonElement>("[data-ec-next]").click();
    expect(q<HTMLElement>('[data-page="1"]').hidden).toBe(true);
    const name = q<HTMLInputElement>('input[name="name"]');
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toBe("emvb-field-inpt0001-error");
    expect((q("#emvb-field-inpt0001-error").textContent ?? "").length > 0).toBe(true);
    expect(document.activeElement === name).toBe(true);
  });

  test("typing clears the message and the invalid mark", async () => {
    const { q } = stepped();
    q<HTMLButtonElement>("[data-ec-next]").click();
    const name = q<HTMLInputElement>('input[name="name"]');
    name.value = "Ada";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
    expect(q("#emvb-field-inpt0001-error").textContent).toBe("");
    expect(name.hasAttribute("aria-invalid")).toBe(false);
  });

  test("a valid step opens the next one and moves focus to it; Previous goes back", () => {
    const { q } = stepped();
    q<HTMLInputElement>('input[name="name"]').value = "Ada";
    q<HTMLInputElement>('input[name="email"]').value = "ada@example.com";
    q<HTMLButtonElement>("[data-ec-next]").click();
    const second = q<HTMLElement>('[data-page="1"]');
    expect(second.hidden).toBe(false);
    expect(document.activeElement === second).toBe(true);
    expect(q("[data-ec-progress]").textContent).toBe("Step 2 of 2");
    expect(q<HTMLButtonElement>(".ec-form-submit").hidden).toBe(false);
    q<HTMLButtonElement>("[data-ec-prev]").click();
    const first = q<HTMLElement>('[data-page="0"]');
    expect(first.hidden).toBe(false);
    expect(document.activeElement === first).toBe(true);
  });

  test("Submit with a field to fix focuses the first one", () => {
    const { q, form } = mount([
      input("inpt0001", "name"),
      input("inpt0002", "email"),
      { id: "subm0001", type: "submit", props: {} } as LayoutNode,
    ]);
    q<HTMLInputElement>('input[name="name"]').value = "Ada";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const email = q<HTMLInputElement>('input[name="email"]');
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement === email).toBe(true);
    expect(q<HTMLInputElement>('input[name="name"]').hasAttribute("aria-invalid")).toBe(false);
  });

  test("a server error written after the send marks its field and takes focus", async () => {
    const { q, form } = mount([input("inpt0001", "name"), input("inpt0002", "email")]);
    const realFetch = globalThis.fetch;
    let answer: ((value: Response) => void) | undefined;
    globalThis.fetch = (() =>
      new Promise<Response>((resolve) => (answer = resolve))) as unknown as typeof fetch;
    const settle = async () => {
      // oxlint-disable-next-line no-await-in-loop -- one macrotask at a time, in order
      for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    };
    try {
      q<HTMLInputElement>('input[name="name"]').value = "Ada";
      q<HTMLInputElement>('input[name="email"]').value = "ada@example.com";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await settle();
      expect(answer === undefined).toBe(false);
      answer?.(
        new Response(
          JSON.stringify({ data: { errors: [{ field: "email", message: "Email is taken" }] } }),
        ),
      );
      await settle();
      const email = q<HTMLInputElement>('input[name="email"]');
      expect(q("#emvb-field-inpt0002-error").textContent).toBe("Email is taken");
      expect(email.getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement === email).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("syncInvalid and focusFirstInvalid skip fields a hidden step holds", () => {
    const { q, form } = stepped();
    const slot = q("#emvb-field-inpt0003-error");
    slot.textContent = "Needed";
    syncInvalid(form);
    expect(q('input[name="guests"]').getAttribute("aria-invalid")).toBe("true");
    expect(focusFirstInvalid(form)).toBe(false);
    slot.textContent = "";
    syncInvalid(form);
    expect(q('input[name="guests"]').hasAttribute("aria-invalid")).toBe(false);
  });

  test("forms that aren't EmVB's are left alone", () => {
    document.body.innerHTML =
      '<form data-ec-form class="ec-form"><input name="a" required><span class="ec-form-error" data-error-for="a">x</span></form>';
    enhanceForms(document);
    expect(document.querySelector("input")?.hasAttribute("aria-invalid")).toBe(false);
  });
});
