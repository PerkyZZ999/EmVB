import { formatProviderComponentId, type ComponentProvider } from "@perkyzz/emvb-provider-api";

export interface ProviderPaletteDescriptor {
  type: string;
  name: string;
  group: string;
  providerId: string;
  providerLabel: string;
  category: string;
  verified: boolean;
  icon?: string;
  keywords: readonly string[];
  order: number;
}

export interface ProviderPaletteGroup {
  id: string;
  label: string;
}

export function providerPaletteDescriptors(
  providers: readonly ComponentProvider[],
): ProviderPaletteDescriptor[] {
  return providers
    .flatMap((provider) =>
      [...provider.components.values()].map((generated) => {
        const category = generated.descriptor.category ?? "Components";
        return {
          type: formatProviderComponentId(provider.id, generated.descriptor.component),
          name:
            generated.descriptor.support === "experimental"
              ? `${generated.descriptor.name} (experimental)`
              : generated.descriptor.name,
          group: `provider:${provider.id}:${category}`,
          providerId: provider.id,
          providerLabel: provider.label,
          category,
          verified: generated.descriptor.support !== "experimental",
          icon: generated.descriptor.icon,
          keywords: generated.descriptor.keywords ?? [],
          order: generated.descriptor.order ?? 999,
        };
      }),
    )
    .toSorted(
      (left, right) =>
        Number(right.verified) - Number(left.verified) ||
        left.order - right.order ||
        left.name.localeCompare(right.name),
    );
}

export function providerPaletteGroups(
  descriptors: readonly ProviderPaletteDescriptor[],
): ProviderPaletteGroup[] {
  return [
    ...new Map(
      descriptors.map((descriptor) => [
        descriptor.group,
        { id: descriptor.group, label: `${descriptor.providerLabel} · ${descriptor.category}` },
      ]),
    ).values(),
  ];
}
