import { expect, test } from "bun:test";

test("the happy-dom preload provides a DOM at the plugin admin URL", () => {
  const el = document.createElement("div");
  el.dataset["probe"] = "1";
  document.body.append(el);
  expect(document.querySelector("[data-probe='1']")).toBe(el);
  expect(window.location.pathname).toBe("/_emdash/admin/plugins/emvb/pages");
});
