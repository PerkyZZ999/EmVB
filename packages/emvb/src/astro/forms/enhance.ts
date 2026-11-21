/**
 * W-1065: inline validation messages and steps that screen reader and keyboard users can follow,
 * on top of the forms plugin's own script (`initForms`), which checks the fields, writes each
 * message into the field's `[data-error-for]` slot and pages through `[data-page]` steps. This
 * adds what that script leaves out, on EmVB forms only:
 *
 * - a field whose slot holds a message is `aria-invalid="true"` until the message goes (the
 *   control already names the slot in `aria-describedby`, W-780);
 * - Submit or Next with a field to fix moves focus to the first one, as the browser does on its
 *   own when no script runs; a server answer with field errors does the same;
 * - a step that opens takes focus, so its legend is read out and Tab starts from it.
 *
 * Loaded with `initForms` by the forms runtime, which renders only on pages with a form.
 */
const FORM = "form.emvb-form[data-ec-form]";
const SLOT = ".ec-form-error[data-error-for]";

/** The controls a message slot speaks for: the field's inputs with the slot's name. */
function controlsOf(slot: Element): HTMLElement[] {
  const name = slot.getAttribute("data-error-for") ?? "";
  const field = slot.closest(".emvb-form-field") ?? slot.parentElement;
  if (!field || !name) return [];
  return [...field.querySelectorAll<HTMLElement>("input, select, textarea")].filter(
    (control) => control.getAttribute("name") === name,
  );
}

/** Marks each field with a message invalid, and unmarks the rest. */
export function syncInvalid(form: Element): void {
  for (const slot of form.querySelectorAll(SLOT)) {
    const invalid = (slot.textContent ?? "").trim() !== "";
    for (const control of controlsOf(slot)) {
      if (invalid) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
    }
  }
}

/** Shown: not inside a step the forms script hid, nor a field a condition hid. */
const shown = (el: Element) => !el.closest("[hidden]") && !(el as HTMLInputElement).disabled;

/** Focuses the first field with a message; true when there was one. */
export function focusFirstInvalid(form: Element): boolean {
  const first = [...form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')].find(shown);
  if (!first) return false;
  first.focus();
  return true;
}

/** The step the visitor is on, in a form with steps. */
const openStep = (form: Element) =>
  [...form.querySelectorAll<HTMLElement>("[data-page]")].find((step) => !step.hidden);

/** Waiting for the server's answer to a send that passed the checks here. */
const sending = new WeakSet<Element>();
const watched = new WeakSet<Element>();
const listening = new WeakSet<Document>();

function watch(form: Element): void {
  if (watched.has(form)) return;
  watched.add(form);
  syncInvalid(form);
  const view = form.ownerDocument.defaultView;
  if (!view?.MutationObserver) return;
  new view.MutationObserver(() => {
    syncInvalid(form);
    if (!sending.has(form)) return;
    // The server's field errors arrive after the send; focus goes to the first, as it would have
    // for a check that failed here. A status message (sent, or a network error) ends the wait.
    if (focusFirstInvalid(form)) sending.delete(form);
    else if (form.querySelector("[data-form-status]")?.textContent?.trim()) sending.delete(form);
  }).observe(form, { subtree: true, childList: true, characterData: true });
}

function onSubmit(event: Event): void {
  const form = (event.target as Element | null)?.closest?.(FORM);
  if (!form) return;
  watch(form);
  syncInvalid(form);
  if (focusFirstInvalid(form)) sending.delete(form);
  else sending.add(form);
}

function onClick(event: Event): void {
  const target = event.target as Element | null;
  const button = target?.closest?.("[data-ec-next], [data-ec-prev]");
  const form = button?.closest(FORM);
  if (!form) return;
  watch(form);
  syncInvalid(form);
  // The forms script has already run: a step with a field to fix stayed open with its message.
  if (focusFirstInvalid(form)) return;
  openStep(form)?.focus();
}

/** Wires every EmVB form on the page. Call after `initForms`, so these listeners run after its. */
export function enhanceForms(doc: Document = document): void {
  for (const form of doc.querySelectorAll(FORM)) watch(form);
  if (listening.has(doc)) return;
  listening.add(doc);
  doc.addEventListener("submit", onSubmit);
  doc.addEventListener("click", onClick);
  // Astro's ClientRouter swaps the page without a load; the forms script starts again there too.
  doc.addEventListener("astro:page-load", () => {
    for (const form of doc.querySelectorAll(FORM)) watch(form);
  });
}
