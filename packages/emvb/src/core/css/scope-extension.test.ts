import { describe, expect, test } from "bun:test";
import { EXTENSION_WRAPPER_CLASS, scopeExtensionCss, unprefixedGlobalVariables } from "./scope.ts";

const W = ":where(.emvb-ext--kit)";

/** The stylesheet of examples/emvb-ext-hello, which styles only its own classes. */
const HELLO_CSS = `/* emvb-ext-hello (W-1086): styles only its own hello- classes. */
.hello-card {
  border: 2px solid #6d28d9;
  border-radius: 12px;
  padding: 16px 20px;
}
.hello-title {
  color: #5b21b6;
  margin: 0;
}
/* The wave plays once, only for visitors who haven't asked for reduced motion. */
@media (prefers-reduced-motion: no-preference) {
  .hello-wave[data-hello-wave="on"] {
    animation: hello-wave 600ms ease-in-out 1;
  }
}
@keyframes hello-wave {
  50% {
    transform: rotate(-2deg);
  }
}
`;

describe("extension stylesheets are scoped to their wrapper (extensionApi 1.5)", () => {
  test("an extension that styles only its own classes gets byte-identical CSS", () => {
    expect(scopeExtensionCss(HELLO_CSS, "kit")).toBe(HELLO_CSS);
  });

  test("a bare element selector is scoped to the wrapper, with no specificity", () => {
    expect(scopeExtensionCss("h1{margin:0}", "kit")).toBe(`${W} h1{margin:0}`);
    expect(scopeExtensionCss("button,a{color:red}", "kit")).toBe(`${W} button,${W} a{color:red}`);
  });

  test("html and body map to the wrapper itself", () => {
    expect(scopeExtensionCss("html{line-height:1.5}", "kit")).toBe(`${W}{line-height:1.5}`);
    expect(scopeExtensionCss("body{margin:0}", "kit")).toBe(`${W}{margin:0}`);
  });

  test("the universal selector is scoped too", () => {
    expect(scopeExtensionCss("*,::before{box-sizing:border-box}", "kit")).toBe(
      `${W} *,${W} ::before{box-sizing:border-box}`,
    );
  });

  test("a selector with a class is left alone, even inside a list with a bare one", () => {
    expect(scopeExtensionCss(".btn{x:1}", "kit")).toBe(".btn{x:1}");
    expect(scopeExtensionCss("h2,.btn{x:1}", "kit")).toBe(`${W} h2,.btn{x:1}`);
  });

  test(":root and [data-theme] stay global, as theme variables are declared there", () => {
    expect(scopeExtensionCss(":root{--kit-x:1}", "kit")).toBe(":root{--kit-x:1}");
    expect(scopeExtensionCss("[data-theme=dark]{--kit-x:1}", "kit")).toBe(
      "[data-theme=dark]{--kit-x:1}",
    );
    expect(scopeExtensionCss(":root,:host{--kit-x:1}", "kit")).toBe(`:root,${W} :host{--kit-x:1}`);
  });

  test("grouping at-rules are scoped inside, and keyframes and font-face are copied as they are", () => {
    const css =
      "@media (min-width: 40em){h1{margin:0}}" +
      "@supports (display:grid){section{display:grid}}" +
      "@layer base{p{margin:0}}" +
      "@keyframes spin{from{opacity:0}to{opacity:1}}" +
      "@font-face{font-family:Kit;src:url(x.woff2)}";
    expect(scopeExtensionCss(css, "kit")).toBe(
      `@media (min-width: 40em){${W} h1{margin:0}}` +
        `@supports (display:grid){${W} section{display:grid}}` +
        `@layer base{${W} p{margin:0}}` +
        "@keyframes spin{from{opacity:0}to{opacity:1}}" +
        "@font-face{font-family:Kit;src:url(x.woff2)}",
    );
  });

  test("a rule that changes nothing keeps its bytes, spacing included", () => {
    const css = "\n  .a , .b {  color : red }\n@media (x){ .c{d:e} }\n";
    expect(scopeExtensionCss(css, "kit")).toBe(css);
  });

  test("a comment before a changed rule stays before it, and the rule is still scoped", () => {
    expect(scopeExtensionCss("/* head */\nh1{margin:0}", "kit")).toBe(
      `/* head */\n${W} h1{margin:0}`,
    );
  });

  test("a comma list keeps its commas when a comment sits inside it", () => {
    expect(scopeExtensionCss("h1/* c */,h2{x:1}", "kit")).toBe(`${W} h1/* c */,${W} h2{x:1}`);
  });

  test("braces and commas inside strings, urls and comments do not split a rule", () => {
    const css = 'h1::before{content:"}"}h2{background:url("a,b{c}.svg")}/* { , */h3{x:1}';
    expect(scopeExtensionCss(css, "kit")).toBe(
      `${W} h1::before{content:"}"}${W} h2{background:url("a,b{c}.svg")}/* { , */${W} h3{x:1}`,
    );
  });

  test("a class that is only inside :not(), :is() or an attribute value does not exempt the selector", () => {
    expect(scopeExtensionCss("a:not(.b){x:1}", "kit")).toBe(`${W} a:not(.b){x:1}`);
    expect(scopeExtensionCss(":is(h1,.c){x:1}", "kit")).toBe(`${W} :is(h1,.c){x:1}`);
    expect(scopeExtensionCss('a[href$=".pdf"]{x:1}', "kit")).toBe(`${W} a[href$=".pdf"]{x:1}`);
  });

  test("the element a selector styles decides: .card h2 is scoped, h2.title and .btn:hover are not", () => {
    expect(scopeExtensionCss(".card h2{x:1}", "kit")).toBe(`${W} .card h2{x:1}`);
    expect(scopeExtensionCss("h2.title{x:1}", "kit")).toBe("h2.title{x:1}");
    expect(scopeExtensionCss(".btn:hover{x:1}", "kit")).toBe(".btn:hover{x:1}");
    expect(scopeExtensionCss(".sm\\:flex{x:1}", "kit")).toBe(".sm\\:flex{x:1}");
  });

  test("a rule under :root or [data-theme] with a bare descendant is scoped after the head", () => {
    expect(scopeExtensionCss(":root h1{x:1}", "kit")).toBe(`:root ${W} h1{x:1}`);
    expect(scopeExtensionCss("[data-theme=dark] h1{x:1}", "kit")).toBe(
      `[data-theme=dark] ${W} h1{x:1}`,
    );
    expect(scopeExtensionCss("[data-theme=dark] .btn{x:1}", "kit")).toBe(
      "[data-theme=dark] .btn{x:1}",
    );
  });

  test("statement at-rules are skipped, and the rule after them is still scoped", () => {
    expect(
      scopeExtensionCss('@charset "utf-8";@import url("x.css");@layer a,b;h1{x:1}', "kit"),
    ).toBe(`@charset "utf-8";@import url("x.css");@layer a,b;${W} h1{x:1}`);
  });

  test("@starting-style is scoped inside, @property and @page are copied", () => {
    expect(scopeExtensionCss("@starting-style{h1{x:1}}@page{margin:0}", "kit")).toBe(
      `@starting-style{${W} h1{x:1}}@page{margin:0}`,
    );
  });

  test("a Tailwind preflight is scoped without touching its layers", () => {
    expect(
      scopeExtensionCss(
        "@layer theme,base;@layer base{*,::before{margin:0}html,:host{x:1}}",
        "kit",
      ),
    ).toBe(`@layer theme,base;@layer base{${W} *,${W} ::before{margin:0}${W},${W} :host{x:1}}`);
  });

  test("the wrapper class is the one the render writes on the element", () => {
    expect(EXTENSION_WRAPPER_CLASS("kit")).toBe("emvb-ext--kit");
  });
});

describe("unprefixed global variables are reported (extensionApi 1.5)", () => {
  test("a variable on :root or [data-theme] without the prefix is reported once", () => {
    const css =
      ":root{--color-primary:red;--daisy-value:1}[data-theme=dark]{--color-primary:blue;--color-primary:blue}";
    expect(unprefixedGlobalVariables(css, "daisy-")).toEqual(["--color-primary"]);
  });

  test("a prefixed variable and a variable inside a component are not reported", () => {
    expect(
      unprefixedGlobalVariables(":root{--daisy-x:1}.card{--color-primary:red}", "daisy-"),
    ).toEqual([]);
  });

  test("inside @media and @layer, global variables are still checked", () => {
    expect(unprefixedGlobalVariables("@layer base{@media (x){:root{--bad:1}}}", "kit-")).toEqual([
      "--bad",
    ]);
  });

  test("a variable in a rule with a class, or in a string or comment, is not a global declaration", () => {
    expect(
      unprefixedGlobalVariables(
        '.a{--x:1}/* :root{--y:1} */h1::after{content:":root{--z:1}"}',
        "k-",
      ),
    ).toEqual([]);
  });

  test("a statement at-rule before the rules does not hide them", () => {
    expect(unprefixedGlobalVariables("@layer a,b;:root{--bad:1}", "k-")).toEqual(["--bad"]);
  });

  test("with no prefix declared, every global variable is reported", () => {
    expect(unprefixedGlobalVariables(":root{--anything:1}", undefined)).toEqual(["--anything"]);
  });
});
