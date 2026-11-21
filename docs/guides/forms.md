# Forms

EmVB forms are laid out in the editor and sent to EmDash's forms plugin
(`@emdash-cms/plugin-forms`), which stores the submissions, sends the notifications and checks the
answers again on the server. EmVB adds no submission handling of its own.

## Making a form

1. In the EmDash admin, open **Forms** and create the form: its fields, which ones are required,
   their limits, the confirmation message and the spam protection.
2. In EmVB, add a **Form** element (Add → Form) and pick that form in its settings.
3. Add a field element for each form field (**Text input**, **Textarea**, **Select**,
   **Checkbox**, **Radio**) and choose its **Field**. Add a **Submit** button.

Arrange the fields freely: in columns, inside boxes, with headings and text between them. Select
and Radio fields take their choices from the form. The editor warns when a required field has no
element, or when an element can't send what its field accepts.

The host site loads the forms plugin's script (`EmVBFormsRuntime` from
`@perkyzz/emvb/astro/forms/client`) only on pages with a form; see
[Install in a host site](install-in-a-host-site.md). Pages without a form load no form script.

## Number and date boxes

A Text input takes the type of its form field: an email field gets an email box, a number field a
number box with the field's lowest and highest values, a date field a date picker.

A plain text field can still ask for a number or a date: set **Asks for** to **A number** or
**A date** on the Text input.

- A number box takes **Lowest number**, **Highest number** and **Step** (allowed numbers go up by
  this much, such as 1 or 0.5; empty allows any number, decimals included). A number field's own
  limits in the forms plugin win over these.
- A date box takes **Earliest date** and **Latest date** (YYYY-MM-DD).

The forms plugin receives a number or date box's answer as text, exactly as from a text box, so
this needs nothing from the plugin. The limits on the element are checked in the visitor's
browser only; limits that must hold belong on the form field in the forms plugin, which checks
them again on the server. A limit that isn't a number (or a real date), or a range with nothing in
it (lowest above highest), is left off the page.

## Steps

A long form can be split into steps: add **Form step** elements inside the Form, give each a
**Title** ("Your details", "Your trip") and put that step's fields in it. Keep the Submit button
after the last step. Word the step buttons with the Form's **Next button** and **Previous button**
settings (unset: "Next" and "Previous").

What visitors get:

- One step at a time, with "Step 1 of 3" above it. **Next** checks the step's fields first; a
  step with a field to fix stays open, with the message under the field. The Submit button shows on
  the last step.
- When a step opens, keyboard focus moves to it, so screen readers read its title and Tab starts
  from its first field. The browser's Back button goes back a step.
- All steps are one form: the answers are sent together when the visitor submits, and the forms
  plugin checks every field again. Its form definition needs no pages of its own.
- Opening a step fades it in, except for visitors who prefer reduced motion.
- Without JavaScript, every step shows as one long form.

The editor canvas shows every step one after the other. The accessibility check warns about a step
with no title (screen readers would only hear "Step 2"), a step with no fields, and a field left
outside the steps (it would show on every step and not be checked before Next).

## Messages next to the fields

When an answer is missing or doesn't fit (a required field left empty, an email without an `@`,
a number above the highest), the message appears under that field, not in a pop-up:

- The field is marked invalid (`aria-invalid`) and its message is part of its description
  (`aria-describedby`), so a screen reader reads the message with the field, and the field's border
  turns red.
- Submit (or Next) moves keyboard focus to the first field to fix.
- Messages from the server (the forms plugin's own checks) appear the same way, and focus moves to
  the first such field.
- Typing in the field clears its message.

The messages are the browser's own wording for its checks, in the visitor's language, and the
forms plugin's wording for the server's.

## Limits

- Steps are EmVB's layout. The forms plugin's Forms screen edits single-page forms, and its own
  page titles and Next/Previous labels aren't read by EmVB; set them on the Form element.
- One Next and one Previous label serve every step.
- Sending needs the forms plugin's script: its submit route takes the answers as JSON, so a form
  sent without JavaScript isn't received. Without the script the form still shows, every step at
  once.
- Pages exported as HTML show the form, but sending needs a server with the forms plugin.

## Importing

An Elementor form keeps its fields, their names and types. Its Step fields become Form steps (the
fields after each Step field go into that step), with the first step's button labels on the Form.
Number fields keep their lowest and highest values, date fields their earliest and latest dates.
The import can also create the matching form in EmDash Forms (fields, types, options and success
message) and connect it; otherwise connect it yourself in the Form's settings. See
[Import from Elementor](elementor-import.md#forms).

## Agents

Over MCP, `list_element_types` describes `form-step` and the Text input's `inputType`, `min`,
`max`, `step`, `minDate` and `maxDate`; `add_element` can add a whole form with its steps. See
[MCP](mcp.md).
