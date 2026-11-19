import type { ComponentProvider, ProviderComponentNode } from "./types.ts";

export function layoutUsesProvider(
  nodes: readonly ProviderComponentNode[],
  providerId: string,
): boolean {
  return nodes.some(
    (node) =>
      (node.type === "provider" &&
        (node as ProviderComponentNode & { provider?: string }).provider === providerId) ||
      layoutUsesProvider(node.children ?? [], providerId),
  );
}

export function providerStyleEntries(
  nodes: readonly ProviderComponentNode[],
  providers: readonly ComponentProvider[],
): string[] {
  const entries = new Set<string>();
  for (const provider of providers)
    if (layoutUsesProvider(nodes, provider.id))
      for (const css of provider.cssEntryPoints) entries.add(css);
  return [...entries].toSorted();
}

export interface ProviderAssetEntries {
  styles: string[];
  runtimes: string[];
}

export function providerAssetEntries(
  nodes: readonly ProviderComponentNode[],
  providers: readonly ComponentProvider[],
): ProviderAssetEntries {
  const styles = new Set<string>();
  const runtimes = new Set<string>();
  const walk = (items: readonly ProviderComponentNode[]): void => {
    for (const node of items) {
      if (node.type === "provider") {
        const providerId = (node as ProviderComponentNode & { provider?: string }).provider;
        const provider = providers.find((candidate) => candidate.id === providerId);
        if (provider) {
          for (const entry of provider.cssEntryPoints) styles.add(entry);
          if (provider.needsRuntime?.(node))
            for (const entry of provider.runtimeEntryPoints ?? []) runtimes.add(entry);
        }
      }
      walk(node.children ?? []);
    }
  };
  walk(nodes);
  return { styles: [...styles].toSorted(), runtimes: [...runtimes].toSorted() };
}
