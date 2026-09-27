import { describe, expect, test } from "bun:test";
import { sanitizeHref } from "./href.ts";

describe("sanitizeHref (R-032)", () => {
  test.each([
    ["https://example.com/x", "https://example.com/x"],
    ["http://example.com", "http://example.com"],
    ["mailto:hi@example.com", "mailto:hi@example.com"],
    ["tel:+15551212", "tel:+15551212"],
    ["/pricing", "/pricing"],
    ["./here", "./here"],
    ["../up", "../up"],
    ["?q=1", "?q=1"],
    ["#section", "#section"],
    ["pricing", "pricing"],
  ])("accepts %p", (input, expected) => {
    expect(sanitizeHref(input)).toBe(expected);
  });

  test.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    " JavaScript:alert(1) ",
    "java\tscript:alert(1)",
    "data:text/html,<script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "about:blank",
    "",
    "   ",
  ])("refuses %p", (input) => {
    expect(sanitizeHref(input)).toBeUndefined();
  });
});
