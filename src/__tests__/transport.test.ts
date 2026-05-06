import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer as createHttpServer, type Server } from 'node:http';
import { connectHttp } from '../transport.js';
import { createServer } from '../server.js';

const API_URL = 'https://api.test';

interface RecordedFetch {
  authHeader: string | null;
  path: string;
  method: string;
}

let originalEnv: typeof process.env;
let recorded: RecordedFetch[];

beforeEach(() => {
  originalEnv = { ...process.env };
  process.env.INVARIANCE_API_URL = API_URL;
  delete process.env.INVARIANCE_API_KEY;
  delete process.env.INVARIANCE_BASE_URL;
  delete process.env.INVARIANCE_MCP_TRANSPORT;
  recorded = [];

  // Only intercept outbound calls to the platform API. Loopback calls to
  // our own HTTP transport must reach the actual server.
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      return realFetch(input as RequestInfo, init);
    }
    recorded.push({
      authHeader: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
      path: url.pathname,
      method: init?.method ?? 'GET',
    });
    return new Response(JSON.stringify({ agent: { id: 'a', name: 'a', public_key: null, project_id: 'p', created_at: 'x' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

async function startTestHttpServer(): Promise<{ port: number; close: () => Promise<void> }> {
  // We need a free port. The transport's connectHttp doesn't return the
  // server handle for shutdown, so we replicate its surface inline using
  // the real connectHttp and a port discovered via a probe socket.
  const probe = createHttpServer();
  await new Promise<void>((r) => probe.listen(0, () => r()));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((r) => probe.close(() => r()));

  await connectHttp((apiKey) => createServer({ apiKey }), port);

  return {
    port,
    close: async () => {
      // The transport keeps the http server alive forever; for tests we just
      // leak it — vitest test runs end the process. If we needed clean
      // shutdown we'd export the server handle from connectHttp. Leaving as
      // is to avoid a behavior-only-for-tests refactor.
    },
  };
}

interface JsonRpcInit {
  method: 'initialize';
  jsonrpc: '2.0';
  id: number;
  params: { protocolVersion: string; capabilities: Record<string, unknown>; clientInfo: { name: string; version: string } };
}

function initializePayload(): JsonRpcInit {
  return {
    method: 'initialize',
    jsonrpc: '2.0',
    id: 1,
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    },
  };
}

describe('HTTP transport auth', () => {
  let port: number;
  beforeEach(async () => {
    ({ port } = await startTestHttpServer());
  });

  it('rejects initialize without Authorization header (401)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify(initializePayload()),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/);
    const body = await res.json();
    expect(body.error.message).toMatch(/Bearer/);
  });

  it('rejects initialize with non-Bearer Authorization (401)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Basic abc',
      },
      body: JSON.stringify(initializePayload()),
    });
    expect(res.status).toBe(401);
  });

  it('accepts initialize with Bearer and binds the token to the session', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer inv_test_session_one',
      },
      body: JSON.stringify(initializePayload()),
    });
    expect(res.status).toBe(200);
    const sid = res.headers.get('mcp-session-id');
    expect(sid).toBeTruthy();
  });

  it('rejects request to existing session if mismatched bearer is sent', async () => {
    // First, initialize a session bound to TOKEN_A
    const init = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer TOKEN_A',
      },
      body: JSON.stringify(initializePayload()),
    });
    const sid = init.headers.get('mcp-session-id');
    expect(sid).toBeTruthy();

    // Now send a follow-up with a DIFFERENT bearer for the same session id.
    const bad = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': sid!,
        Authorization: 'Bearer TOKEN_B',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    expect(bad.status).toBe(401);
  });

  it('refuses non-initialize POST without session id', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer x',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(400);
  });
});
