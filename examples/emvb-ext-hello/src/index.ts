import { defineExtension, type ExtensionOutputNode } from "@perkyzz/emvb";
import { newNodeId } from "@perkyzz/emvb/core";

/**
 * Sample Extensions API v1 package (W-927): one element, one panel, one source. W-1086 adds a
 * class allowlist, a stylesheet and a small runtime that honours reduced motion.
 */
const hello = defineExtension({
  id: "emvb-ext-hello",
  label: "Hello",
  // Lets EmVB bundle this package into the server build and find the files below.
  module: import.meta.url,
  classes: { prefix: "hello-", allow: ["hello-card", "hello-title", "hello-wave"] },
  css: "./hello.css",
  runtime: "./hello-runtime.js",
  elements: [
    {
      name: "greeting",
      label: "Greeting",
      group: "content",
      schema: {
        type: "object",
        properties: {
          text: { type: "string", maxLength: 200, default: "Hello from an extension" },
        },
        required: ["text"],
      },
      fields: [{ key: "text", kind: "text", label: "Greeting text" }],
      defaults: () => ({ text: "Hello from an extension" }),
      render: (props, ctx) => {
        const fromSource = ctx.sources["site-info"]?.title;
        const text =
          typeof props.text === "string" && props.text.trim()
            ? props.text
            : fromSource
              ? `Hello, ${fromSource}`
              : "Hello from an extension";
        const title: ExtensionOutputNode = {
          id: newNodeId(),
          type: "heading",
          props: { text, level: 2 },
          extClasses: ["hello-title", "hello-wave"],
        };
        return {
          id: newNodeId(),
          type: "div-block",
          props: {},
          extClasses: ["hello-card"],
          children: [title],
        };
      },
    },
  ],
  panels: [
    {
      name: "about",
      label: "About Hello",
      description:
        "This panel comes from the emvb-ext-hello sample. It cannot inject global admin CSS.",
      source: "site-info",
    },
  ],
  sources: [
    {
      name: "site-info",
      label: "Hello site info",
      capabilities: ["text"],
      resolve: () => ({
        title: "EmVB",
        tagline: "Extensions API sample",
      }),
    },
  ],
});

export default hello;
