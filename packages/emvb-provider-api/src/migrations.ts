import type { ComponentProvider, ProviderComponentNode } from "./types.ts";

export interface ProviderMigrationContext {
  fromVersion: number;
  toVersion: number;
}

export interface ProviderMigrationResult<N extends ProviderComponentNode = ProviderComponentNode> {
  node: N;
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
}

export function migrateProviderNode<N extends ProviderComponentNode>(
  node: N,
  provider: ComponentProvider<N>,
): ProviderMigrationResult<N> {
  const fromVersion = node.providerVersion ?? 1;
  const toVersion = provider.nodeVersion ?? 1;
  if (fromVersion > toVersion)
    throw new Error(
      `Cannot downgrade ${provider.id} node ${node.id} from ${fromVersion} to ${toVersion}.`,
    );
  let current = structuredClone(node);
  if (fromVersion < toVersion) {
    if (!provider.migrateNode)
      throw new Error(
        `${provider.label} cannot migrate node ${node.id} from ${fromVersion} to ${toVersion}.`,
      );
    current = provider.migrateNode(current, { fromVersion, toVersion });
    if (current.id !== node.id)
      throw new Error(`${provider.label} migration changed node id ${node.id}.`);
    current = { ...current, providerVersion: toVersion };
  }
  if (current.children)
    current = {
      ...current,
      children: current.children.map((child) => migrateProviderNode(child as N, provider).node),
    };
  return { node: current, migrated: fromVersion < toVersion, fromVersion, toVersion };
}
