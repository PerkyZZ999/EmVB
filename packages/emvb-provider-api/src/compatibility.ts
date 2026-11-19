import type { ComponentProvider, ProviderComponentNode } from "./types.ts";

export const PROVIDER_API_VERSION = 1 as const;

export type ProviderDiagnosticCode =
  | "api-version-mismatch"
  | "missing-provider"
  | "missing-component"
  | "node-version-newer"
  | "invalid-provider-version"
  | "duplicate-recipe";

export interface ProviderDiagnostic {
  code: ProviderDiagnosticCode;
  severity: "error" | "warning";
  provider: string;
  component?: string;
  nodeId?: string;
  message: string;
}

export function providerCompatibility(provider: ComponentProvider): ProviderDiagnostic[] {
  const requested = provider.providerApiVersion ?? PROVIDER_API_VERSION;
  const diagnostics: ProviderDiagnostic[] = [];
  if (requested !== PROVIDER_API_VERSION)
    diagnostics.push({
      code: "api-version-mismatch",
      severity: "error",
      provider: provider.id,
      message: `${provider.label} requires Provider API ${requested}; EmVB supports ${PROVIDER_API_VERSION}.`,
    });
  if (provider.version && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(provider.version))
    diagnostics.push({
      code: "invalid-provider-version",
      severity: "error",
      provider: provider.id,
      message: `${provider.label} has invalid semantic version "${provider.version}".`,
    });
  const recipes = new Set<string>();
  for (const recipe of provider.recipes ?? []) {
    if (recipes.has(recipe.id))
      diagnostics.push({
        code: "duplicate-recipe",
        severity: "error",
        provider: provider.id,
        message: `${provider.label} declares recipe "${recipe.id}" more than once.`,
      });
    recipes.add(recipe.id);
  }
  return diagnostics;
}

export function providerNodeDiagnostics(
  nodes: readonly ProviderComponentNode[],
  providers: readonly ComponentProvider[],
): ProviderDiagnostic[] {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const diagnostics: ProviderDiagnostic[] = providers.flatMap(providerCompatibility);
  const walk = (items: readonly ProviderComponentNode[]): void => {
    for (const node of items) {
      if (node.type === "provider") {
        const providerId =
          (node as ProviderComponentNode & { provider?: string }).provider ?? "unknown";
        const provider = byId.get(providerId);
        if (!provider)
          diagnostics.push({
            code: "missing-provider",
            severity: "error",
            provider: providerId,
            component: node.component,
            nodeId: node.id,
            message: `Provider "${providerId}" is not installed. Its saved data is preserved.`,
          });
        else if (!provider.components.has(node.component))
          diagnostics.push({
            code: "missing-component",
            severity: "error",
            provider: providerId,
            component: node.component,
            nodeId: node.id,
            message: `${provider.label} does not provide component "${node.component}". Its saved data is preserved.`,
          });
        else if (
          typeof node.providerVersion === "number" &&
          node.providerVersion > (provider.nodeVersion ?? 1)
        )
          diagnostics.push({
            code: "node-version-newer",
            severity: "warning",
            provider: providerId,
            component: node.component,
            nodeId: node.id,
            message: `Node version ${node.providerVersion} is newer than ${provider.label}'s supported version ${provider.nodeVersion ?? 1}.`,
          });
      }
      walk(node.children ?? []);
    }
  };
  walk(nodes);
  return diagnostics;
}
