export interface Config {
  apiKey: string;
  baseUrl: string;
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

  return { apiKey, baseUrl };
}
