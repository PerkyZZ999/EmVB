import { describe, expect, test } from "bun:test";
import { cssScopeToken, scopeCss } from "./scope.ts";

describe("per-render style scoping (W-112)", () => {
  test("prefixes every selector with a :where scope, inside @media too, and leaves keyframes alone", () => {
    const css =
      ".a{color:red}.b,.c:hover{margin:0}@media (max-width: 767px){.d{display:none}}" +
      "@keyframes emvb-fade{from{opacity:0}to{opacity:1}}:where(.emvb-root) h1{margin:0}";
    expect(scopeCss(css, "P1")).toBe(
      ':where([data-emvb-scope="P1"]) .a{color:red}' +
        ':where([data-emvb-scope="P1"]) .b,:where([data-emvb-scope="P1"]) .c:hover{margin:0}' +
        '@media (max-width: 767px){:where([data-emvb-scope="P1"]) .d{display:none}}' +
        "@keyframes emvb-fade{from{opacity:0}to{opacity:1}}" +
        ':where([data-emvb-scope="P1"]) :where(.emvb-root) h1{margin:0}',
    );
  });

  test("commas inside :where, :is or attribute selectors don't split a selector", () => {
    expect(scopeCss(':is(.a,.b) [x="1,2"]{gap:0}', "S")).toBe(
      ':where([data-emvb-scope="S"]) :is(.a,.b) [x="1,2"]{gap:0}',
    );
  });

  test("a scope token keeps letters, digits, - and _ and drops the rest", () => {
    expect(cssScopeToken("01JABC-x_9")).toBe("01JABC-x_9");
    expect(cssScopeToken('a"b]c')).toBe("a_b_c");
    expect(cssScopeToken("")).toBeUndefined();
  });
});
