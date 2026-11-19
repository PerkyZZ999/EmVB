# @perkyzz/emvb-provider-api

Framework-neutral contracts and process-local registry for external EmVB component providers. This package must not depend on EmVB, React, Astro, Tailwind CSS, or any provider implementation.

## What a provider is

A provider is a package that adds components to EmVB without changing core. It declares:

- `id`, `label` and `nodeType` (the stored node type it owns, usually `provider`).
- `components`: a map of component name to a `ProviderComponent` with its `createNode`, `render` and editor fields.
- `recipes`, `metaFields` and `collections` (optional): ready-made sections, per-node metadata and data lists.
- `cssEntryPoints` and `runtimeEntryPoints` (optional): assets loaded only when a page uses the provider.

Core stores a provider's element as a generic `provider` node, with `provider` (the id), `component`, `props` and optional `providerMeta`. Core validates the node shape and renders it through the provider's `render`. Core names no provider.

## Registering a provider

A provider module calls `registerComponentProvider(provider)` once when it loads. The call returns a function that unregisters it. The registry lives on `globalThis`, so the server render and the editor share one copy.

The host site lists provider modules in EmVB's `providers` option, and points `adminEntry` at a wrapper that imports the provider before re-exporting `@perkyzz/emvb/admin`, so the editor sees it too.

## Compatibility

`providerApiVersion` and `nodeVersion` are checked on registration. An incompatible provider is refused with the reason in its error message. A stored `provider` node whose provider is not registered is kept in the layout. On the page it renders as an empty `emvb-unknown` box marked `data-emvb-missing-provider`, and the stored props stay intact until the provider loads.
