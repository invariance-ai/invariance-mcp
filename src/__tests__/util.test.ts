import { describe, expect, it } from 'vitest';
import { apiNotAvailableResult, jsonResult, parseJsonArg } from '../lib/util.js';

describe('apiNotAvailableResult', () => {
  it('returns a structured API_NOT_AVAILABLE error payload', () => {
    const result = apiNotAvailableResult('invariance_example_tool');
    const payload = JSON.parse(result.content[0].text) as {
      error?: { code?: string; retryable?: boolean; message?: string };
    };

    expect(payload.error?.code).toBe('API_NOT_AVAILABLE');
    expect(payload.error?.retryable).toBe(false);
    expect(payload.error?.message).toContain('invariance_example_tool');
  });

  it('appends the optional detail to the message', () => {
    const result = apiNotAvailableResult('invariance_example_tool', 'endpoint not deployed');
    const payload = JSON.parse(result.content[0].text) as { error?: { message?: string } };

    expect(payload.error?.message).toContain('endpoint not deployed');
  });
});

describe('jsonResult / parseJsonArg', () => {
  it('round-trips JSON through parseJsonArg and jsonResult', () => {
    const parsed = parseJsonArg('metadata', '{"a":1}');
    const result = jsonResult(parsed);

    expect(JSON.parse(result.content[0].text)).toEqual({ a: 1 });
  });

  it('throws a descriptive error on invalid JSON', () => {
    expect(() => parseJsonArg('metadata', '{not json')).toThrow(/Invalid JSON in "metadata"/);
  });
});
