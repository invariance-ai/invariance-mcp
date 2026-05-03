export interface Config {
  apiKey: string;
  baseUrl: string;
  transport: 'stdio' | 'http';
  port: number;
  /** Ed25519 private key (64 hex chars) used to sign run-create and node
   *  writes. Required once the agent has a registered public_key. Env-only. */
  signingKey?: string;
}

const DEFAULT_BASE_URL = 'https://api.useinvariance.com';

export function loadConfig(): Config {
  const apiKey = process.env.INVARIANCE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'INVARIANCE_API_KEY environment variable is required. ' +
        'Get your API key at https://app.useinvariance.com/settings/api-keys',
    );
  }

  const apiUrl = process.env.INVARIANCE_API_URL;
  const legacyBaseUrl = process.env.INVARIANCE_BASE_URL;
  if (legacyBaseUrl && !apiUrl) {
    process.stderr.write(
      'warning: INVARIANCE_BASE_URL is deprecated; use INVARIANCE_API_URL instead.\n',
    );
  }
  const baseUrl = (apiUrl ?? legacyBaseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');

  const rawTransport = process.env.INVARIANCE_MCP_TRANSPORT ?? 'stdio';
  // 'sse' kept as an alias for back-compat with older configs.
  const transport: Config['transport'] =
    rawTransport === 'http' || rawTransport === 'sse' ? 'http' : 'stdio';
  if (rawTransport !== 'stdio' && rawTransport !== 'http' && rawTransport !== 'sse') {
    throw new Error(
      `Invalid INVARIANCE_MCP_TRANSPORT: "${rawTransport}". Must be "stdio" or "http".`,
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

  const signingKey = process.env.INVARIANCE_SIGNING_KEY;

  return { apiKey, baseUrl, transport, port, signingKey };
}
