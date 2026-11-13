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
});
