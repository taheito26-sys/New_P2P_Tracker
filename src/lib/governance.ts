const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function currentHostname(): string | null {
  if (typeof window === 'undefined') return null;
  return window.location.hostname;
}

export function isLocalDevelopmentHost(hostname = currentHostname()): boolean {
  return hostname ? LOCAL_HOSTNAMES.has(hostname) : false;
}

export function isSyntheticSandboxAccessAllowed(options?: { sandboxEnabled?: boolean; demoEnabled?: boolean; hostname?: string | null }): boolean {
  const sandboxEnabled = options?.sandboxEnabled ?? false;
  const demoEnabled = options?.demoEnabled ?? false;
  const hostname = options?.hostname ?? currentHostname();
  return sandboxEnabled && demoEnabled && isLocalDevelopmentHost(hostname);
}

export function syntheticSandboxBlockMessage(feature: string): string {
  return `${feature} is disabled by governance policy. Use live or user-provided data instead.`;
}

export function assertSyntheticSandboxAccess(feature: string, options?: { sandboxEnabled?: boolean; demoEnabled?: boolean; hostname?: string | null }) {
  if (!isSyntheticSandboxAccessAllowed(options)) {
    throw new Error(syntheticSandboxBlockMessage(feature));
  }
}
