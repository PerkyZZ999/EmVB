import { describe, expect, test } from "bun:test";
import { initAlerts } from "./alerts.ts";

function fixture() {
  document.body.innerHTML = `
    <a href="#before" id="before">Before</a>
    <div class="emvb-alert" role="note">
      <div class="emvb-alert-body"><p>Saved.</p><a href="#inside">Inside</a></div>
      <button type="button" class="emvb-alert-dismiss" data-emvb-alert-dismiss aria-label="Dismiss"></button>
    </div>
    <button type="button" id="after">After</button>
  `;
  return {
    alert: document.querySelector<HTMLElement>(".emvb-alert") as HTMLElement,
    button: document.querySelector<HTMLButtonElement>(
      "[data-emvb-alert-dismiss]",
    ) as HTMLButtonElement,
  };
}

describe("alerts runtime (W-1025)", () => {
  test("shows the close button; pressing it hides the Alert and focuses what comes next", () => {
    const { alert, button } = fixture();
    expect(button.dataset["emvbReady"]).toBeUndefined();
    initAlerts(document);
    expect(button.dataset["emvbReady"]).toBe("");
    button.focus();
    button.click();
    expect(alert.hidden).toBe(true);
    expect(document.activeElement?.id).toBe("after");
  });

  test("with nothing after it, focus goes to what came before", () => {
    const { alert, button } = fixture();
    document.querySelector("#after")?.remove();
    initAlerts(document);
    button.click();
    expect(alert.hidden).toBe(true);
    expect(document.activeElement?.id).toBe("before");
  });

  test("running twice wires each button once", () => {
    const { button } = fixture();
    initAlerts(document);
    initAlerts(document);
    let clicks = 0;
    button.addEventListener("click", () => clicks++);
    button.click();
    expect(clicks).toBe(1);
    expect(document.querySelector<HTMLElement>(".emvb-alert")?.hidden).toBe(true);
  });

  test("before enhanced Tabs, focus goes to the selected tab, not its hidden radio (W-1054)", () => {
    document.body.innerHTML = `
      <div class="emvb-alert" role="note">
        <p>Saved.</p>
        <button type="button" data-emvb-alert-dismiss aria-label="Dismiss"></button>
      </div>
      <div class="emvb-tabs">
        <input type="radio" class="emvb-tab-input" tabindex="-1" aria-hidden="true" checked>
        <input type="radio" class="emvb-tab-input" tabindex="-1" aria-hidden="true">
        <div class="emvb-tab-list" role="tablist">
          <label role="tab" id="first" tabindex="0" aria-selected="true">One</label>
          <label role="tab" id="second" tabindex="-1">Two</label>
        </div>
      </div>`;
    initAlerts(document);
    const button = document.querySelector<HTMLButtonElement>("[data-emvb-alert-dismiss]");
    button?.focus();
    button?.click();
    expect(document.activeElement?.id).toBe("first");
  });

  /** An Alert, then `between`, then a button that should get the focus. */
  const dismissBefore = (between: string) => {
    document.body.innerHTML = `
      <div class="emvb-alert" role="note">
        <p>Saved.</p>
        <button type="button" data-emvb-alert-dismiss aria-label="Dismiss"></button>
      </div>
      ${between}
      <button type="button" id="next">Next</button>`;
    initAlerts(document);
    const button = document.querySelector<HTMLButtonElement>("[data-emvb-alert-dismiss]");
    button?.focus();
    button?.click();
    return document.activeElement?.id;
  };

  test("skips an element taken out of the Tab order (W-1054)", () => {
    expect(dismissBefore('<a id="skipped" href="#x" tabindex="-1">Out of order</a>')).toBe("next");
  });

  test("skips an element inside an inert region (W-1054)", () => {
    expect(dismissBefore('<div inert><a id="skipped" href="#x">Inert</a></div>')).toBe("next");
  });

  test("skips an element hidden from assistive tech (W-1054)", () => {
    expect(
      dismissBefore('<div aria-hidden="true"><a id="skipped" href="#x">Hidden</a></div>'),
    ).toBe("next");
  });

  test("skips an element hidden by CSS on this device, so focus doesn't fall to the page (W-1054)", () => {
    expect(
      dismissBefore(
        '<style>.hidden-here{display:none}</style><div class="hidden-here"><a id="skipped" href="#x">Desktop only</a></div>',
      ),
    ).toBe("next");
  });
});
