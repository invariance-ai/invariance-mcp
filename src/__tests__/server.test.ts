import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from '../server.js';

describe('createServer', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, INVARIANCE_API_KEY: 'test-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates a server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });

  it('throws without API key', () => {
    delete process.env.INVARIANCE_API_KEY;
    expect(() => createServer()).toThrow('INVARIANCE_API_KEY');
  });
});
