import { Buffer } from 'node:buffer';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

export async function connectStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown | undefined> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const body = Buffer.concat(chunks).toString('utf8').trim();
  if (!body) {
    return undefined;
  }

  return JSON.parse(body);
}

function getSessionId(req: IncomingMessage): string | undefined {
  const header = req.headers['mcp-session-id'];
  return typeof header === 'string' ? header : undefined;
}

function getBearerToken(req: IncomingMessage): string | undefined {
  const raw = req.headers['authorization'];
  if (typeof raw !== 'string') return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : undefined;
}

function jsonError(res: ServerResponse, status: number, code: number, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  }));
}

/**
 * HTTP transport.
 *
 * Each MCP session is bound to the bearer token from the initialize request.
 * That token is passed through to `createServer(apiKey)` so the underlying
 * InvarianceClient calls land as the requesting tenant rather than as a
 * shared process-wide env key. This is what lets a hosted MCP serve multiple
 * customers without leaking writes across them.
 *
 * Token rules:
 *   - Initialize POST (no `mcp-session-id`): must carry `Authorization: Bearer …`.
 *   - Subsequent requests: identified by `mcp-session-id`; the bearer header
 *     is not re-checked (the session id is the capability), but if it IS sent
 *     it must match the token bound to that session.
 */
export async function connectHttp(
  createServer: (apiKey: string) => McpServer,
  port: number,
): Promise<void> {
  const sessions = new Map<
    string,
    { server: McpServer; transport: StreamableHTTPServerTransport; apiKey: string }
  >();

  const httpServer = createHttpServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/mcp' || req.url?.startsWith('/mcp?')) {
      try {
        if (req.method === 'POST') {
          const parsedBody = await readJsonBody(req);
          const sessionId = getSessionId(req);

          if (sessionId) {
            const existing = sessions.get(sessionId);
            if (!existing) {
              jsonError(res, 404, -32001, 'Unknown MCP session');
              return;
            }
            // Optional defense-in-depth: if the client re-sends a bearer,
            // verify it matches the one bound at initialize. Missing header
            // is fine — the session id itself is the capability.
            const tok = getBearerToken(req);
            if (tok !== undefined && tok !== existing.apiKey) {
              jsonError(res, 401, -32002, 'Bearer does not match MCP session');
              return;
            }
            await existing.transport.handleRequest(req, res, parsedBody);
            return;
          }

          if (!isInitializeRequest(parsedBody)) {
            jsonError(res, 400, -32000, 'Missing MCP session for non-initialize request');
            return;
          }

          const apiKey = getBearerToken(req);
          if (!apiKey) {
            res.setHeader('WWW-Authenticate', 'Bearer realm="invariance-mcp"');
            jsonError(res, 401, -32002, 'Missing Authorization: Bearer <api-key> header');
            return;
          }

          const server = createServer(apiKey);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (initializedSessionId) => {
              sessions.set(initializedSessionId, { server, transport, apiKey });
            },
          });

          transport.onclose = () => {
            const activeSessionId = transport.sessionId;
            if (activeSessionId) {
              sessions.delete(activeSessionId);
            }
          };

          await server.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        if (req.method === 'GET' || req.method === 'DELETE') {
          const sessionId = getSessionId(req);
          if (!sessionId) {
            jsonError(res, 400, -32000, 'Missing MCP session header');
            return;
          }

          const existing = sessions.get(sessionId);
          if (!existing) {
            jsonError(res, 404, -32001, 'Unknown MCP session');
            return;
          }

          await existing.transport.handleRequest(req, res);
          return;
        }

        res.writeHead(405);
        res.end('Method not allowed');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        jsonError(res, 400, -32700, message);
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      console.error(`Invariance MCP server listening on http://127.0.0.1:${port}/mcp`);
      resolve();
    });
  });
}
