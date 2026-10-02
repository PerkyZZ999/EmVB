import { expect, test } from "bun:test";
import { defaultElement } from "./index.ts";
import { commitPlainText, isMultilineText, plainTextOf, withPlainText } from "./plain-text.ts";

test("canvas text is the stored string for headings, text, labels, links and buttons", () => {
  expect(plainTextOf(defaultElement("heading", "h0000001"))).toBe("Heading");
  expect(plainTextOf(defaultElement("text", "t0000001"))).toBe("Text");
  expect(plainTextOf(defaultElement("label", "l0000001"))).toBe("Label");
  expect(plainTextOf(defaultElement("link", "a0000001"))).toBe("Link");
  expect(plainTextOf(defaultElement("button", "b0000001"))).toBe("Button");
  expect(plainTextOf(defaultElement("image", "i0000001"))).toBeNull();
  expect(isMultilineText(defaultElement("text", "t0000001"))).toBe(true);
  expect(isMultilineText(defaultElement("heading", "h0000001"))).toBe(false);
});

test("a heading commit drops line breaks and stops at the length limit", () => {
  expect(commitPlainText("Hello\nthere", false)).toBe("Hellothere");
  expect(commitPlainText(`x${"y".repeat(2000)}`, false)).toHaveLength(2000);
  const heading = withPlainText(defaultElement("heading", "h0000001"), "Welcome");
  expect(heading.type === "heading" ? heading.props.text : "").toBe("Welcome");
  expect(withPlainText(defaultElement("image", "i0000001"), "nope").type).toBe("image");
});
