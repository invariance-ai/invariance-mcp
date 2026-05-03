import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../lib/config.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  it('normalizes the deprecated sse transport alias to http', () => {
    process.env.INVARIANCE_API_KEY = 'inv_test_key';
    process.env.INVARIANCE_MCP_TRANSPORT = 'sse';

    expect(loadConfig().transport).toBe('http');
  });

  it('mentions the sse alias when transport validation fails', () => {
    process.env.INVARIANCE_API_KEY = 'inv_test_key';
    process.env.INVARIANCE_MCP_TRANSPORT = 'websocket';

    expect(() => loadConfig()).toThrow(/sse.*deprecated alias/);
  });
});
