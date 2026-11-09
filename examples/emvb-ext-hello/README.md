# emvb-ext-hello

Sample EmVB Extensions API v1 package (W-927). Adds:

- a **Greeting** element (`ext:emvb-ext-hello/greeting`) with a text prop
- an **About Hello** editor panel (declarative Kumo slot)
- a read-only **site-info** source with `title` and `tagline`

Register it in `astro.config`:

```js
import { emvb } from "@perkyzz/emvb";
import hello from "emvb-ext-hello";

emvb({
  canvasStyles: ["/site.css"],
  canvasCollections: ["pages"],
  extensions: [hello],
});
```

Removing the extension leaves pages that used the Greeting element valid: EmVB
shows a placeholder instead of crashing.
