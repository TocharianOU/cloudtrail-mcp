#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2024 TocharianOU Contributors

import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { randomUUID } from 'crypto';
import { CloudTrailConfig, CloudTrailConfigSchema } from './src/types.js';
import { registerEventsTools } from './src/events-tools.js';
import { registerLakeTools } from './src/lake-tools.js';

interface ServerCreationOptions {
  name: string;
  version: string;
  config: CloudTrailConfig;
  description?: string;
}

export async function createCloudTrailMcpServer(options: ServerCreationOptions): Promise<McpServer> {
  const { name, version, config, description } = options;

  const validatedConfig = CloudTrailConfigSchema.parse(config);

  const server = new McpServer({
    name,
    version,
    ...(description ? { description } : {}),
  });

  const maxTokenCall = parseInt(process.env.MAX_TOKEN_CALL ?? '20000', 10);

  registerEventsTools(server, validatedConfig, maxTokenCall);
  registerLakeTools(server, validatedConfig, maxTokenCall);

  return server;
}

async function main(): Promise<void> {
  const config: CloudTrailConfig = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_DEFAULT_REGION,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    timeout: parseInt(process.env.AWS_TIMEOUT ?? '30000', 10),
  };

  const SERVER_NAME = 'cloudtrail-mcp-server';
  const SERVER_VERSION = '1.0.0';
  const SERVER_DESCRIPTION =
    'AWS CloudTrail MCP Server – audit log lookup, CloudTrail Lake SQL analytics, and event data store management';

  const useHttp = process.env.MCP_TRANSPORT === 'http';
  const httpPort = parseInt(process.env.MCP_HTTP_PORT ?? '3000', 10);
  const httpHost = process.env.MCP_HTTP_HOST ?? 'localhost';

  if (useHttp) {
    process.stderr.write(
      `Starting CloudTrail MCP Server in HTTP mode on ${httpHost}:${httpPort}\n`
    );

    const app = express();
    app.use(express.json());

    const transports = new Map<string, StreamableHTTPServerTransport>();

    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', transport: 'streamable-http' });
    });

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId !== undefined && transports.has(sessionId)) {
          transport = transports.get(sessionId)!;
        } else {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: async (newSessionId: string) => {
              transports.set(newSessionId, transport);
              process.stderr.write(`MCP session initialized: ${newSessionId}\n`);
            },
            onsessionclosed: async (closedSessionId: string) => {
              transports.delete(closedSessionId);
              process.stderr.write(`MCP session closed: ${closedSessionId}\n`);
            },
          });

          const server = await createCloudTrailMcpServer({
            name: SERVER_NAME,
            version: SERVER_VERSION,
            config,
            description: SERVER_DESCRIPTION,
          });

          await server.connect(transport);
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        process.stderr.write(`Error handling MCP request: ${error}\n`);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    });

    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId === undefined || !transports.has(sessionId)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Invalid or missing session ID' },
          id: null,
        });
        return;
      }

      try {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res);
      } catch (error) {
        process.stderr.write(`Error handling SSE stream: ${error}\n`);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Failed to establish SSE stream' },
            id: null,
          });
        }
      }
    });

    app.listen(httpPort, httpHost, () => {
      process.stderr.write(
        `CloudTrail MCP Server (HTTP mode) started on http://${httpHost}:${httpPort}\n`
      );
    });

    process.on('SIGINT', async () => {
      for (const [, transport] of transports.entries()) {
        await transport.close();
      }
      process.exit(0);
    });
  } else {
    process.stderr.write('Starting CloudTrail MCP Server in Stdio mode\n');

    const server = await createCloudTrailMcpServer({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      config,
      description: SERVER_DESCRIPTION,
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.on('SIGINT', async () => {
      await server.close();
      process.exit(0);
    });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Fatal error: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
