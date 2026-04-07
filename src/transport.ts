import { Buffer } from 'node:buffer';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
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

export async function connectHttp(
  createServer: () => McpServer,
  port: number,
): Promise<void> {
  const transports = new Map<
    string,
    { server: McpServer; transport: StreamableHTTPServerTransport }
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
            const existing = transports.get(sessionId);
            if (!existing) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32001, message: 'Unknown MCP session' },
                id: null,
              }));
              return;
            }

            await existing.transport.handleRequest(req, res, parsedBody);
            return;
          }

          if (!isInitializeRequest(parsedBody)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Missing MCP session for non-initialize request' },
              id: null,
            }));
            return;
          }

          const server = createServer();
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (initializedSessionId) => {
              transports.set(initializedSessionId, { server, transport });
            },
          });

          transport.onclose = () => {
            const activeSessionId = transport.sessionId;
            if (activeSessionId) {
              transports.delete(activeSessionId);
            }
          };

          await server.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        if (req.method === 'GET' || req.method === 'DELETE') {
          const sessionId = getSessionId(req);
          if (!sessionId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Missing MCP session header' },
              id: null,
            }));
            return;
          }

          const existing = transports.get(sessionId);
          if (!existing) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32001, message: 'Unknown MCP session' },
              id: null,
            }));
            return;
          }

          await existing.transport.handleRequest(req, res);
          return;
        }

        res.writeHead(405);
        res.end('Method not allowed');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid request';
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message },
          id: null,
        }));
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
