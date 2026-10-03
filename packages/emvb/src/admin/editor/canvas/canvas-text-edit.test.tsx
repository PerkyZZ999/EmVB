import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { CanvasTextEdit } from "./CanvasTextEdit.tsx";
import { cleanup, mount } from "../../../../test/dom/mount.ts";

afterEach(async () => {
  await cleanup();
  document.head.querySelector("style[data-test-canvas]")?.remove();
});

const BOX = { top: 40, left: 10, width: 300, height: 60 };

async function editHeading() {
  const style = document.createElement("style");
  style.setAttribute("data-test-canvas", "");
  // The canvas hides the element's own text while it is edited (CanvasFrame's editor CSS).
  style.textContent =
    "h1.t{color:rgb(18, 52, 86);font-size:40px}[data-emvb-editing]{color:transparent !important}";
  document.head.append(style);
  const heading = document.createElement("h1");
  heading.className = "t";
  heading.textContent = "Walk the edges";
  document.body.append(heading);
  await mount(
    <CanvasTextEdit
      element={heading}
      box={BOX}
      text="Walk the edges"
      multiline={false}
      onCommit={() => undefined}
      onCancel={() => undefined}
    />,
  );
  const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit text"]');
  return { heading, field };
}

async function type(field: HTMLTextAreaElement | null, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(field, value);
    field?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("canvas text editing (W-097, W-117)", () => {
  test("the field keeps the element's text colour while the element's own text is hidden", async () => {
    const { heading, field } = await editHeading();
    expect(heading.hasAttribute("data-emvb-editing")).toBe(true);
    expect(field?.style.color).toBe("rgb(18, 52, 86)");
    await type(field, "Walk the wild edges");
    expect(field?.value).toBe("Walk the wild edges");
    expect(field?.style.color).toBe("rgb(18, 52, 86)");
    expect(field?.style.fontSize || field?.style.font).toContain("40px");
    heading.remove();
  });

  test("opening the field clears the word the double-click selected on the canvas", async () => {
    const heading = document.createElement("h1");
    heading.textContent = "Walk the edges";
    document.body.append(heading);
    const range = document.createRange();
    range.selectNodeContents(heading);
    document.getSelection()?.addRange(range);
    expect(document.getSelection()?.toString()).toBe("Walk the edges");
    await mount(
      <CanvasTextEdit
        element={heading}
        box={BOX}
        text="Walk the edges"
        multiline={false}
        onCommit={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(document.getSelection()?.rangeCount).toBe(0);
    heading.remove();
  });
});
