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

  // ── Transport config ──

  it('defaults transport to stdio', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    delete process.env.INVARIANCE_MCP_TRANSPORT;
    const config = loadConfig();
    expect(config.transport).toBe('stdio');
  });

  it('accepts sse transport', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    process.env.INVARIANCE_MCP_TRANSPORT = 'sse';
    const config = loadConfig();
    expect(config.transport).toBe('sse');
  });

  it('throws on invalid transport', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    process.env.INVARIANCE_MCP_TRANSPORT = 'websocket';
    expect(() => loadConfig()).toThrow('Invalid INVARIANCE_MCP_TRANSPORT');
  });

  it('defaults port to 3000', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    delete process.env.INVARIANCE_MCP_PORT;
    const config = loadConfig();
    expect(config.port).toBe(3000);
  });

  it('accepts custom port', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    process.env.INVARIANCE_MCP_PORT = '8080';
    const config = loadConfig();
    expect(config.port).toBe(8080);
  });

  it('throws on invalid port', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    process.env.INVARIANCE_MCP_PORT = 'abc';
    expect(() => loadConfig()).toThrow('Invalid INVARIANCE_MCP_PORT');
  });

  it('throws on port out of range', () => {
    process.env.INVARIANCE_API_KEY = 'test-key';
    process.env.INVARIANCE_MCP_PORT = '99999';
    expect(() => loadConfig()).toThrow('Invalid INVARIANCE_MCP_PORT');
  });
});
