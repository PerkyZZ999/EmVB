# Third-party notices

EmVB (<https://emvb.dev>) is MIT licensed. It includes or depends on the projects below, which keep their own licenses, copied in full in [`licenses/`](licenses/): the icon sets (Lucide, Font Awesome Free, Tabler, Remix) and the image editor's engine (photocn and the code photocn includes: mini-photo-editor, glfx.js and exif-js; and its dependency fflate).

The editor's **Icon library** (`@perkyzz/emvb-icons`, the JSON sets) contains icons from the projects below. They keep their own licenses, copied in full in [`licenses/`](licenses/). `scripts/build-icon-sets.ts` in the EmVB repository builds the set files from the pinned npm packages. It refuses to build when a package's license file changes.

Changes made to every set: the SVG markup is reformatted into compact JSON, and only elements and attributes in EmVB's SVG allowlist are kept. Class attributes and comments are removed. Shared presentation attributes (stroke or fill, viewBox) move to the root `<svg>`. Set-specific changes are listed with each set.

When an editor picks an icon, its SVG is stored with the page and shown inline on the public site. No icon library is loaded there.

## Lucide

- Package: `lucide-static` 1.61.0, <https://lucide.dev>
- License: ISC, Copyright (c) 2026 Lucide Icons and Contributors. Icons derived from Feather: MIT, Copyright (c) 2013-present Cole Bemis. Full text: [`licenses/lucide-static.LICENSE`](licenses/lucide-static.LICENSE).
- The 26 icons EmVB bundled before the library (`src/core/icons/catalog.ts`) are also Lucide icons, under the same license.

## Font Awesome Free

- Package: `@fortawesome/fontawesome-free` 7.3.1, <https://fontawesome.com>
- Icons: Font Awesome Free by Fonticons, Inc., licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Full text: [`licenses/fontawesome-free.LICENSE`](licenses/fontawesome-free.LICENSE).
- Changes: the attribution comment in each SVG file is removed by EmVB's sanitizer, so this notice carries the attribution. Each path's `fill="currentColor"` moves to the root `<svg>`.
- Brand icons are trademarks of their owners. Use them only to represent the company, product or service they refer to.

## Tabler Icons

- Package: `@tabler/icons` 3.49.0, <https://tabler.io/icons>
- License: MIT, Copyright (c) 2020-2026 Paweł Kuna. Full text: [`licenses/tabler-icons.LICENSE`](licenses/tabler-icons.LICENSE).
- Changes: the invisible 24×24 bounding path (`M0 0h24v24H0z`) is left out.

## Remix Icon

- Package: `remixicon` 4.8.0, <https://remixicon.com>. 4.8.0 is the last release under Apache-2.0; 4.9.0 moved to the custom "Remix Icon License v1.0", which forbids competing icon libraries, so EmVB stays on 4.8.0.
- License: Apache License 2.0, Copyright (c) Remix Design. Full text: [`licenses/remixicon.LICENSE`](licenses/remixicon.LICENSE).
- Changes (Apache-2.0 §4(b)): path coordinates are rounded to two decimals. All Remix paths use absolute commands, so the error stays under 0.005 units on the 24-unit grid. The icon files are not otherwise modified.

## photocn

- Package: `photocn` 0.1.2 (the image editor's engine, loaded only when the image editor opens), <https://photocn.dev>, <https://github.com/rbbydotdev/photocn>
- License: MIT, Copyright (c) 2026 rbbydotdev. Full text: [`licenses/photocn.LICENSE`](licenses/photocn.LICENSE).
- The image editor's layout and interactions are ported from photocn's shadcn editor components (`apps/www/src/registry/image-editor`: the editor, desktop and compact layouts, toolbar, canvas, crop overlay, crop panel, adjustments, filters, curves and blur panels, blur center overlay, panel header, histogram, the perspective icon, the export dialog and the metadata panel). Changes: rebuilt with Kumo components, Phosphor icons and EmVB's CSS tokens instead of shadcn/ui, Tailwind and Lucide; opening files and recipes left out; typed slider values, curve-point Input/Output fields and keyboard control of curve points and the blur spot added; the export dialog gets EmVB defaults (WebP 85 %, a 2560 px cap, removing a JPEG's GPS location) and saves to the media library. Each ported file names its source.
- The quarter-turn icons in the crop panel are Lucide's `rotate-ccw-square` and `rotate-cw-square` (ISC, see Lucide above).

### Included in photocn

photocn's own [`THIRD_PARTY_NOTICES.md`](https://github.com/rbbydotdev/photocn) lists code it carries from these MIT projects. EmVB ships them only inside the lazy image editor chunk and its worker; published pages never load them.

- **mini-photo-editor**, <https://github.com/xdadda/mini-photo-editor>: photocn's WebGL renderer and filters, EXIF/ICC reading and the filter LUT textures, and the perspective "adjust corners" icon EmVB uses (`parts.tsx`). MIT, Copyright (c) 2025 xdadda. Full text: [`licenses/mini-photo-editor.LICENSE`](licenses/mini-photo-editor.LICENSE).
- **glfx.js**, <https://github.com/evanw/glfx.js>: the texture and shader core of photocn's renderer (via mini-photo-editor). MIT, Copyright (C) 2011 by Evan Wallace. Full text: [`licenses/glfx.js.LICENSE`](licenses/glfx.js.LICENSE).
- **exif-js**, <https://github.com/exif-js/exif-js>: EXIF parsing (via mini-photo-editor), shown in the Metadata tool. MIT, Copyright (c) 2008 Jacob Seidelin. Full text: [`licenses/exif-js.LICENSE`](licenses/exif-js.LICENSE).

### fflate

- Package: `fflate` 0.8.3 (a dependency of photocn, installed with it), <https://github.com/101arrowz/fflate>
- License: MIT, Copyright (c) 2026 Arjun Barrett. Full text: [`licenses/fflate.LICENSE`](licenses/fflate.LICENSE).
