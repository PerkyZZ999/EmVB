import type { Layout } from "../schema/layout.ts";

/** Fixture layout for the BRIEF success signal (W-039): container + heading/text/image/button + form. */
export function successSignalLayout(opts: {
  formId: string;
  colorVar: string;
  classId: string;
  imageSrc: string;
  heading: string;
}): Layout {
  return {
    schemaVersion: 1,
    root: {
      id: "root0001",
      type: "container",
      props: {},
      style: { flexDirection: "column", gap: { value: 16, unit: "px" } },
      children: [
        {
          id: "head0001",
          type: "heading",
          props: { text: opts.heading, level: 1 },
          style: { color: { var: opts.colorVar } },
          classes: [opts.classId],
        },
        {
          id: "text0001",
          type: "text",
          props: { text: "Welcome to the EmVB success page." },
        },
        {
          id: "img00001",
          type: "image",
          props: {
            src: opts.imageSrc,
            alt: "Hero",
            decorative: false,
            width: 1,
            height: 1,
          },
        },
        {
          id: "btn00001",
          type: "button",
          props: { text: "Learn more", href: "/about" },
        },
        {
          id: "form0001",
          type: "form",
          props: { formId: opts.formId },
          children: [
            {
              id: "inp00001",
              type: "text-input",
              props: { field: "email", label: "Email", placeholder: "you@example.com" },
            },
            { id: "sub00001", type: "submit", props: { label: "Send" } },
          ],
        },
      ],
    },
  };
}
