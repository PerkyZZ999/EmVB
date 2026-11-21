# Extensions

Extensions let a site owner add custom elements, editor panels and read-only data sources to EmVB.
They are installed in code, at build time, never from the admin.

## Add one

Install the package and list it in `emvb()`:

```js
import { emvb } from "@perkyzz/emvb";
import hello from "emvb-ext-hello";

emvb({ canvasStyles: ["/site.css"], extensions: [hello] });
```

Its elements appear in the editor's **Add** panel and its panels in the left panel. Pages store
them as `ext:<package>/<name>`.

An extension may bring its own stylesheet and a small script. EmVB adds them only to pages that
show one of its elements (the stylesheet also to the editor canvas), and the HTML export copies
them. The script is the extension's own code: check that the package handles keyboard use, screen
readers and reduced motion, because EmVB's accessibility check can't see inside it.

## Remove one

Pages keep the extension's elements. Without the extension they show a short placeholder in the
editor and nothing on the public page; put the extension back and they render again. Agents can't
add or change an element whose extension isn't installed.

## Write one

Start from [`examples/emvb-ext-hello`](../../examples/emvb-ext-hello) (an element, a panel and a
data source). The [Extensions API](../EXTENSIONS.md) describes the contract: the element schema,
Kumo inspector fields, rendering to EmVB nodes (never raw HTML), panels, sources, limits, and the
1.x freeze and deprecation policy. Extension data is validated and its output sanitized like any
other element.
