/** Stable prefix used by EmVB's Add panel and drag-and-drop payloads. */
export const PROVIDER_COMPONENT_PREFIX = "provider:";

export interface ProviderComponentIdentifier {
  providerId: string;
  componentId: string;
}

const PART = /^[a-z][a-z0-9-]*$/;

export function formatProviderComponentId(providerId: string, componentId: string): string {
  if (!PART.test(providerId)) throw new Error(`Invalid provider id: ${providerId}`);
  if (!PART.test(componentId)) throw new Error(`Invalid component id: ${componentId}`);
  return `${PROVIDER_COMPONENT_PREFIX}${providerId}:${componentId}`;
}

export function parseProviderComponentId(value: string): ProviderComponentIdentifier | undefined {
  if (!value.startsWith(PROVIDER_COMPONENT_PREFIX)) return undefined;
  const parts = value.slice(PROVIDER_COMPONENT_PREFIX.length).split(":");
  if (parts.length !== 2) return undefined;
  const [providerId, componentId] = parts;
  if (!providerId || !componentId || !PART.test(providerId) || !PART.test(componentId))
    return undefined;
  return { providerId, componentId };
}
