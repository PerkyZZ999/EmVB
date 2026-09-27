import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { expect, test } from "vitest";
import Harness from "./fixtures/Harness.astro";

test("the Astro container renders a component with escaped props", async () => {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Harness, { props: { label: "<b>hi</b>" } });
  expect(html).toContain("<p data-harness>&lt;b&gt;hi&lt;/b&gt;</p>");
});
