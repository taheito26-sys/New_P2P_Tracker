export function isLocalDevelopmentHost(): boolean {
  return false;
}

export function isSyntheticSandboxAccessAllowed(): boolean {
  return false;
}

export function syntheticSandboxBlockMessage(feature: string): string {
  return `${feature} is permanently disabled by governance policy. Use live or user-provided data instead.`;
}

export function assertSyntheticSandboxAccess(feature: string) {
  throw new Error(syntheticSandboxBlockMessage(feature));
}
