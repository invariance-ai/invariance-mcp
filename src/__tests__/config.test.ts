import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../lib/config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when INVARIANCE_API_KEY is not set', () => {
    delete process.env.INVARIANCE_API_KEY;
    expect(() => loadConfig()).toThrow('INVARIANCE_API_KEY');
  });

  it('returns config with default base URL', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    delete process.env.INVARIANCE_BASE_URL;
    const config = loadConfig();
    expect(config.apiKey).toBe('test-key');
    expect(config.baseUrl).toBe('https://api.invariance.ai');
  });

  it('uses custom base URL when set', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    process.env.INVARIANCE_BASE_URL = 'https://custom.api.example.com';
    const config = loadConfig();
    expect(config.baseUrl).toBe('https://custom.api.example.com');
  });

  it('strips trailing slashes from base URL', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    process.env.INVARIANCE_BASE_URL = 'https://api.example.com///';
    const config = loadConfig();
    expect(config.baseUrl).toBe('https://api.example.com');
  });
});
