import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { Config } from './config.js';
import { PublicSource } from './public-source.js';
import { createMcpServer } from './tools.js';

function send(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

export function validateRequest(req: IncomingMessage, config: Config): boolean {
  const counts = { host: 0, origin: 0 };
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i]?.toLowerCase();
    if (name === 'host' || name === 'origin') counts[name]++;
  }
  if (counts.host !== 1 || counts.origin > 1) return false;
  if (!req.headers.host || !config.allowedHosts.includes(req.headers.host)) return false;
  // Absent Origin is expected for server-to-server ChatGPT/Codex requests.
  const origin = req.headers.origin;
  return origin === undefined || config.allowedOrigins.includes(origin);
}

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) { failed = true; chunks.length = 0; reject(new Error('too_large')); }
      else if (!failed) chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', () => reject(new Error('invalid_json')));
    req.on('aborted', () => reject(new Error('invalid_json')));
  });
}

export function createHttpServer(config: Config, source = new PublicSource(config)) {
  const http = createServer({ maxHeaderSize: 8192, headersTimeout: 10000, requestTimeout: 30000 }, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    void (async () => {
      if (!validateRequest(req, config)) { send(res, 403, 'Host ou Origin não permitido.'); return; }
      if (req.url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"status":"ok"}'); return;
      }
      if (req.url !== '/mcp') { send(res, 404, 'Endpoint não encontrado.'); return; }
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, MCP-Protocol-Version, MCP-Session-Id, Accept');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      // This read-only stateless server has no background SSE streams or sessions to delete.
      // MCP permits 405 for these optional methods; all protocol messages use POST.
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); send(res, 405, 'Método não permitido.'); return; }
      let parsed: unknown;
      if (req.method === 'POST') {
        if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') {
          send(res, 415, 'Content-Type deve ser application/json.'); return;
        }
        try { parsed = await body(req); }
        catch (error) { send(res, error instanceof Error && error.message === 'too_large' ? 413 : 400, 'Corpo inválido ou excessivo.'); return; }
      }
      const server = createMcpServer(source);
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const close = () => { void server.close().catch(() => {}); };
      res.once('close', close);
      try { await server.connect(transport); await transport.handleRequest(req, res, parsed); }
      catch { if (!res.headersSent) send(res, 500, 'Falha interna ao processar MCP.'); else if (!res.writableEnded) res.end(); }
    })().catch(() => { if (!res.headersSent) send(res, 500, 'Falha interna.'); else if (!res.writableEnded) res.end(); });
  });
  http.maxRequestsPerSocket = 100;
  return http;
}
