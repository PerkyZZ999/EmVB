import type { ComponentProvider, ProviderComponentNode } from "./types.ts";
import { providerCompatibility } from "./compatibility.ts";

// The registry is heterogeneous: each provider is specialized to its own node subtype
// (for example a provider's own node interface). ComponentProvider is contravariant in its node type
// (its methods consume N), so a specialized provider is not assignable to the base. `any` here
// is the honest shape of "any provider, keyed by id"; each provider only ever receives its own
// nodes at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponentProvider = ComponentProvider<any>;

// The registry lives on globalThis so EVERY bundle in a process shares ONE map. A worker/SSR build
// can split the editor bundle, the public-render graph and the plugin module into separate copies
// of this file; a plain module-level Map would then give each its own registry, so a provider
// registered by one (e.g. the server import) would be invisible to another (the page render) and
// the component would fall back to "Unknown provider". A single globalThis-keyed map fixes that.
const REGISTRY_KEY = Symbol.for("emvb:component-providers");
const globalRegistry = globalThis as unknown as {
  [REGISTRY_KEY]?: Map<string, AnyComponentProvider>;
};
const providers: Map<string, AnyComponentProvider> =
  globalRegistry[REGISTRY_KEY] ?? (globalRegistry[REGISTRY_KEY] = new Map());

export function registerComponentProvider(provider: AnyComponentProvider): () => void {
  if (!/^[a-z][a-z0-9-]*$/.test(provider.id))
    throw new Error(`Invalid provider id: ${provider.id}`);
  const incompatible = providerCompatibility(provider)[0];
  if (incompatible) throw new Error(incompatible.message);
  const current = providers.get(provider.id);
  if (current && current !== provider)
    throw new Error(`Component provider already registered: ${provider.id}`);
  providers.set(provider.id, provider);
  return () => {
    if (providers.get(provider.id) === provider) providers.delete(provider.id);
  };
}

export const componentProvider = (
  id: string,
): ComponentProvider<ProviderComponentNode> | undefined =>
  providers.get(id) as ComponentProvider<ProviderComponentNode> | undefined;
export const componentProviders = (): readonly ComponentProvider<ProviderComponentNode>[] =>
  [...providers.values()] as ComponentProvider<ProviderComponentNode>[];

export const clearComponentProvidersForTest = (): void => providers.clear();
