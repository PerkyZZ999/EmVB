import {
  providerCompatibility,
  providerNodeDiagnostics,
  type ProviderDiagnostic,
} from "./compatibility.ts";
import type { ComponentProvider, ProviderComponentNode } from "./types.ts";
export interface ProviderHealth {
  id: string;
  label: string;
  version: string;
  apiVersion: number;
  nodeVersion: number;
  components: number;
  recipes: number;
  styles: number;
  runtimes: number;
  nodesInUse: number;
  diagnostics: ProviderDiagnostic[];
  status: "ok" | "warning" | "error";
}
export function providerHealthInventory(
  nodes: readonly ProviderComponentNode[],
  providers: readonly ComponentProvider[],
): ProviderHealth[] {
  const diagnostics = providerNodeDiagnostics(nodes, providers);
  const counts = new Map<string, number>();
  const walk = (items: readonly ProviderComponentNode[]) => {
    for (const node of items) {
      if (node.type === "provider") {
        const id = (node as ProviderComponentNode & { provider?: string }).provider ?? "unknown";
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      walk(node.children ?? []);
    }
  };
  walk(nodes);
  return providers.map((provider) => {
    const own = [
      ...providerCompatibility(provider),
      ...diagnostics.filter((item) => item.provider === provider.id),
    ];
    return {
      id: provider.id,
      label: provider.label,
      version: provider.version ?? "unversioned",
      apiVersion: provider.providerApiVersion ?? 1,
      nodeVersion: provider.nodeVersion ?? 1,
      components: provider.components.size,
      recipes: provider.recipes?.length ?? 0,
      styles: provider.cssEntryPoints.length,
      runtimes: provider.runtimeEntryPoints?.length ?? 0,
      nodesInUse: counts.get(provider.id) ?? 0,
      diagnostics: own,
      status: own.some((item) => item.severity === "error")
        ? "error"
        : own.length
          ? "warning"
          : "ok",
    };
  });
}
