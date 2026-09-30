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
    [" /pricing ", "/pricing"],
    ["/my file.pdf", "/my file.pdf"],
    ["/docs/a:b", "/docs/a:b"],
    ["/a//b", "/a//b"],
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
    "/a\u0000b",
    "/a\u007fb",
    '/a"onmouseover=alert(1)',
    "/a'b",
    "/a<b",
    "/a>b",
    "/a`b",
    "http://[",
  ])("refuses %p", (input) => {
    expect(sanitizeHref(input)).toBeUndefined();
  });

  test("a URL of 2 000 characters is kept and one of 2 001 is refused", () => {
    const at = `/${"a".repeat(1999)}`;
    expect(sanitizeHref(at)).toBe(at);
    expect(sanitizeHref(`${at}a`)).toBeUndefined();
  });

  test.each(["//evil.example/x", "/\\evil.example", " //evil.example", "\\\\evil.example"])(
    "refuses %p, which browsers resolve to another site (EmDash 1.0 url-field rule)",
    (input) => {
      expect(sanitizeHref(input)).toBeUndefined();
    },
  );
});
