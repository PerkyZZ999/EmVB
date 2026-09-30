import { describe, expect, test } from "bun:test";
import { applyStatePreview } from "./state-preview.ts";

const doc = () => {
  const d = document.implementation.createHTMLDocument("canvas");
  d.body.innerHTML =
    '<div data-emvb-id="root0001"><a data-emvb-id="btn00001">Go</a><a data-emvb-id="btn00002">Two</a></div>';
  return d;
};
const stateOf = (d: Document, id: string) =>
  d.querySelector(`[data-emvb-id="${id}"]`)?.getAttribute("data-emvb-state") ?? null;

describe("canvas state preview (W-089)", () => {
  test("marks only the selected element with the chosen state", () => {
    const d = doc();
    applyStatePreview(d, { id: "btn00001", state: "hover" });
    expect(stateOf(d, "btn00001")).toBe("hover");
    expect(d.querySelectorAll("[data-emvb-state]")).toHaveLength(1);
    applyStatePreview(d, { id: "btn00001", state: "active" });
    expect(stateOf(d, "btn00001")).toBe("active");
  });

  test("moving to another element or back to Normal clears the old mark", () => {
    const d = doc();
    applyStatePreview(d, { id: "btn00001", state: "focus" });
    applyStatePreview(d, { id: "btn00002", state: "focus" });
    expect(stateOf(d, "btn00001")).toBeNull();
    expect(stateOf(d, "btn00002")).toBe("focus");
    applyStatePreview(d, null);
    expect(d.querySelectorAll("[data-emvb-state]")).toHaveLength(0);
  });
});
