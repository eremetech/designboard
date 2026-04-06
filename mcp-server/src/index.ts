#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';
import { registerPrompts } from './prompts.js';
import { logger } from './logger.js';
import { SessionManager } from './sessions.js';
import { getCategories } from './utils.js';

const SERVER_INFO = {
  name: 'design-vocabulary-board',
  version: '1.0.0',
} as const;

const SERVER_OPTIONS = {
  instructions: [
    'Design Vocabulary Board MCP Server.',
    'Browse 500+ UI design patterns across 39 categories.',
    'Each pattern includes a textual design prompt, HTML/CSS implementation, and React/TSX component.',
    '',
    'Quick start:',
    '  1. Call list_categories to see all available categories',
    '  2. Call search_patterns with a query to find relevant patterns',
    '  3. Call get_pattern_prompt or get_implementation to get code and design guidance',
    '',
    'Resources are also available for browsing:',
    '  - designboard://catalog          — category index',
    '  - designboard://categories/{slug} — all patterns in a category',
    '  - designboard://patterns/{slug}   — single pattern with all prompts',
  ].join('\n'),
} as const;

function createServer(): McpServer {
  const server = new McpServer(SERVER_INFO, SERVER_OPTIONS);
  registerResources(server);
  registerTools(server);
  registerPrompts(server);
  return server;
}

// ── Transport selection ──────────────────────────────────────────────

const args = process.argv.slice(2);
const transportFlag = args.find(a => a.startsWith('--transport='))?.split('=')[1];
const useStdio = transportFlag === 'stdio';

if (useStdio) {
  startStdio();
} else {
  startHttp();
}

// ── stdio ────────────────────────────────────────────────────────────

function startStdio() {
  logger.info('starting', { transport: 'stdio', server: SERVER_INFO.name, version: SERVER_INFO.version });
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).then(() => {
    logger.info('connected', { transport: 'stdio' });
  }).catch((error) => {
    logger.error('fatal startup error', { transport: 'stdio', error: String(error) });
    process.exit(1);
  });
}

// ── Streamable HTTP ──────────────────────────────────────────────────

function startHttp() {
  const portArg = args.find(a => a.startsWith('--port='))?.split('=')[1];
  const port = portArg ? parseInt(portArg, 10) : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3001);

  logger.info('starting', { transport: 'http', port, server: SERVER_INFO.name, version: SERVER_INFO.version });

  const app = createMcpExpressApp();
  const sessions = new SessionManager();
  const startedAt = Date.now();

  const categories = getCategories();
  const categoryCount = categories.length;
  const patternCount = categories.reduce((sum, c) => sum + c.patterns.length, 0);

  app.get('/health', (_req, res) => {
    const heap = process.memoryUsage();
    const sessionStats = sessions.getStats();

    res.json({
      status: 'ok',
      version: SERVER_INFO.version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      data: { categories: categoryCount, patterns: patternCount },
      sessions: {
        active: sessionStats.activeCount,
        oldestAgeMs: sessionStats.oldestAgeMs,
      },
      heap: {
        usedMb: Math.round(heap.heapUsed / 1024 / 1024 * 100) / 100,
        totalMb: Math.round(heap.heapTotal / 1024 / 1024 * 100) / 100,
        rssMb: Math.round(heap.rss / 1024 / 1024 * 100) / 100,
      },
    });
  });

  // POST /mcp — main JSON-RPC endpoint
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      if (sessionId && sessions.has(sessionId)) {
        sessions.touch(sessionId);
        await sessions.get(sessionId)!.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.add(sid, transport);
            logger.info('session created', { sessionId: sid });
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions.has(sid)) {
            sessions.remove(sid);
            logger.info('session closed', { sessionId: sid });
          }
        };

        const server = createServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null
      });
    } catch (error) {
      logger.error('request error', { sessionId: sessionId ?? null, error: String(error) });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  });

  // GET /mcp — SSE stream for server-initiated messages
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    sessions.streamStart(sessionId);
    res.on('close', () => sessions.streamEnd(sessionId));
    await sessions.get(sessionId)!.handleRequest(req, res);
  });

  // DELETE /mcp — session termination
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = sessions.get(sessionId)!;
    sessions.remove(sessionId);
    logger.info('session terminated by client', { sessionId });
    await transport.handleRequest(req, res);
  });

  app.listen(port, () => {
    logger.info('listening', { transport: 'http', url: `http://localhost:${port}/mcp` });
  });

  process.on('SIGINT', async () => {
    const stats = sessions.getStats();
    logger.info('shutting down', { activeSessions: stats.activeCount });
    sessions.destroy();
    await sessions.closeAll();
    logger.info('shutdown complete');
    process.exit(0);
  });
}
