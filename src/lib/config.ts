export interface Config {
  apiKey: string;
  baseUrl: string;
  transport: 'stdio' | 'sse';
  port: number;
}

export function loadConfig(): Config {
  const apiKey = process.env.INVARIANCE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'INVARIANCE_API_KEY environment variable is required. ' +
        'Get your API key at https://app.invariance.ai/settings/api-keys',
    );
  }

  const baseUrl = (
    process.env.INVARIANCE_BASE_URL ?? 'https://api.invariance.ai'
  ).replace(/\/+$/, '');

  const transportEnv = process.env.INVARIANCE_MCP_TRANSPORT ?? 'stdio';
  if (transportEnv !== 'stdio' && transportEnv !== 'sse') {
    throw new Error(
      `Invalid INVARIANCE_MCP_TRANSPORT: "${transportEnv}". Must be "stdio" or "sse".`,
    );
  }
  const transport = transportEnv;

  const portEnv = process.env.INVARIANCE_MCP_PORT;
  let port = 3000;
  if (portEnv) {
    const parsed = Number(portEnv);
    if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(
        `Invalid INVARIANCE_MCP_PORT: "${portEnv}". Must be a number between 1 and 65535.`,
      );
    }
    port = parsed;
  }

  return { apiKey, baseUrl, transport, port };
}
