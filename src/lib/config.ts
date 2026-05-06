export interface Config {
  apiKey: string;
  baseUrl: string;
  transport: 'stdio' | 'http';
  port: number;
}

const DEFAULT_BASE_URL = 'https://api.useinvariance.com';

export interface LoadConfigOptions {
  /**
   * When false, the loader does not require INVARIANCE_API_KEY in the
   * environment. The HTTP transport sets this so it can bind per-request
   * bearer tokens to per-session server instances instead of a process-wide
   * env key.
   */
  requireApiKey?: boolean;
}

export function loadConfig(options: LoadConfigOptions = {}): Config {
  const requireApiKey = options.requireApiKey ?? true;
  const apiKey = process.env.INVARIANCE_API_KEY ?? '';
  if (requireApiKey && !apiKey) {
    throw new Error(
      'INVARIANCE_API_KEY environment variable is required. ' +
        'Get your API key at https://app.useinvariance.com/settings/api-keys',
    );
  }

  const apiUrl = process.env.INVARIANCE_API_URL;
  const legacyBaseUrl = process.env.INVARIANCE_BASE_URL;
  if (legacyBaseUrl && !apiUrl) {
    process.stderr.write(
      'warning: INVARIANCE_BASE_URL is deprecated; use INVARIANCE_API_URL instead. ' +
        'Support for INVARIANCE_BASE_URL will be removed on 2026-08-01.\n',
    );
  }
  const baseUrl = (apiUrl ?? legacyBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');

  const rawTransport = process.env.INVARIANCE_MCP_TRANSPORT ?? 'stdio';
  // 'sse' kept as an alias for back-compat with older configs.
  const transport: Config['transport'] =
    rawTransport === 'http' || rawTransport === 'sse' ? 'http' : 'stdio';
  if (rawTransport !== 'stdio' && rawTransport !== 'http' && rawTransport !== 'sse') {
    throw new Error(
      `Invalid INVARIANCE_MCP_TRANSPORT: "${rawTransport}". Must be "stdio" or "http" ("sse" is accepted as a deprecated alias for "http").`,
    );
  }

  let port = 3000;
  const portEnv = process.env.INVARIANCE_MCP_PORT;
  if (portEnv) {
    const parsed = Number(portEnv);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(
        `Invalid INVARIANCE_MCP_PORT: "${portEnv}". Must be an integer between 1 and 65535.`,
      );
    }
    port = parsed;
  }

  return { apiKey, baseUrl, transport, port };
}
