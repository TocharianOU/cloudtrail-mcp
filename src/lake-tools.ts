// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2024 TocharianOU Contributors

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CloudTrailConfig } from './types.js';
import {
  handleLakeQuery,
  handleGetQueryStatus,
  handleGetQueryResults,
  handleListEventDataStores,
} from './handlers/lake.js';
import { checkTokenLimit } from './utils/token-limiter.js';

// Note: server.tool is called via (server as any) cast to avoid TypeScript
// exceeding instantiation-depth limits when inferring Zod schema generics.

const LakeQuerySchema = z.object({
  sql: z
    .string()
    .describe(
      'SQL SELECT statement to execute against CloudTrail Lake using Trino-compatible syntax. ' +
        'Must reference a valid Event Data Store (EDS) ID in the FROM clause. ' +
        'Use list_event_data_stores to get available EDS IDs first. ' +
        'Example: SELECT eventname, sourceipaddress FROM <eds-id> WHERE eventtime > \'2025-01-01 00:00:00\' LIMIT 10'
    ),
  waitForCompletion: z
    .boolean()
    .optional()
    .describe(
      'Wait for query to finish and return results (default: true). ' +
        'Set to false to submit asynchronously and poll with get_query_status.'
    ),
  region: z
    .string()
    .optional()
    .describe('AWS region to query. Defaults to AWS_DEFAULT_REGION or us-east-1.'),
  break_token_rule: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set to true to bypass token limits in critical situations (default: false)'),
});

const GetQueryStatusSchema = z.object({
  queryId: z
    .string()
    .describe('The CloudTrail Lake query ID returned by lake_query.'),
  region: z
    .string()
    .optional()
    .describe('AWS region where the query was submitted. Defaults to AWS_DEFAULT_REGION or us-east-1.'),
  break_token_rule: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set to true to bypass token limits in critical situations (default: false)'),
});

const GetQueryResultsSchema = z.object({
  queryId: z
    .string()
    .describe('The CloudTrail Lake query ID to retrieve results for (status must be FINISHED).'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum rows to return per page (1–50, default: 50).'),
  nextToken: z
    .string()
    .optional()
    .describe('Pagination token from a previous get_query_results response.'),
  region: z
    .string()
    .optional()
    .describe('AWS region where the query was submitted. Defaults to AWS_DEFAULT_REGION or us-east-1.'),
  break_token_rule: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set to true to bypass token limits in critical situations (default: false)'),
});

const ListEventDataStoresSchema = z.object({
  includeDetails: z
    .boolean()
    .optional()
    .describe(
      'Include detailed event selector and multi-region configuration per store (default: true).'
    ),
  region: z
    .string()
    .optional()
    .describe('AWS region to query. Defaults to AWS_DEFAULT_REGION or us-east-1.'),
  break_token_rule: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set to true to bypass token limits in critical situations (default: false)'),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = (name: string, desc: string, shape: unknown, cb: (args: unknown) => unknown) => void;

export function registerLakeTools(server: McpServer, config: CloudTrailConfig, maxTokenCall = 20000): void {
  const registerTool = (server as any).tool.bind(server) as AnyTool;

  registerTool(
    'lake_query',
    'Execute a Trino-compatible SQL SELECT query against CloudTrail Lake for advanced analytics ' +
      'and filtering beyond the 90-day LookupEvents limit. Supports complex aggregations, joins, ' +
      'and long-term historical analysis. Requires a valid Event Data Store ID in the FROM clause.',
    LakeQuerySchema.shape,
    async (args: unknown) => {
      const parsed = LakeQuerySchema.parse(args);
      const text = await handleLakeQuery(config, parsed);
      const tokenCheck = checkTokenLimit(text, maxTokenCall, parsed.break_token_rule ?? false);
      if (!tokenCheck.allowed) {
        return { content: [{ type: 'text', text: tokenCheck.error! }] };
      }
      return { content: [{ type: 'text', text }] };
    }
  );

  registerTool(
    'get_query_status',
    'Check the execution status of a CloudTrail Lake query (QUEUED, RUNNING, FINISHED, FAILED, ' +
      'CANCELLED, TIMED_OUT). Use after submitting an async lake_query to determine when results are ready.',
    GetQueryStatusSchema.shape,
    async (args: unknown) => {
      const parsed = GetQueryStatusSchema.parse(args);
      const text = await handleGetQueryStatus(config, parsed);
      const tokenCheck = checkTokenLimit(text, maxTokenCall, parsed.break_token_rule ?? false);
      if (!tokenCheck.allowed) {
        return { content: [{ type: 'text', text: tokenCheck.error! }] };
      }
      return { content: [{ type: 'text', text }] };
    }
  );

  registerTool(
    'get_query_results',
    'Retrieve the results of a completed CloudTrail Lake query with pagination support. ' +
      'Fetch successive pages using the nextToken returned from each response.',
    GetQueryResultsSchema.shape,
    async (args: unknown) => {
      const parsed = GetQueryResultsSchema.parse(args);
      const text = await handleGetQueryResults(config, parsed);
      const tokenCheck = checkTokenLimit(text, maxTokenCall, parsed.break_token_rule ?? false);
      if (!tokenCheck.allowed) {
        return { content: [{ type: 'text', text: tokenCheck.error! }] };
      }
      return { content: [{ type: 'text', text }] };
    }
  );

  registerTool(
    'list_event_data_stores',
    'List all CloudTrail Lake Event Data Stores in the specified region with their ARNs, status, ' +
      'retention period, and optional event selector details. Run this first to get the EDS ID ' +
      'required for lake_query SQL statements.',
    ListEventDataStoresSchema.shape,
    async (args: unknown) => {
      const parsed = ListEventDataStoresSchema.parse(args);
      const text = await handleListEventDataStores(config, parsed);
      const tokenCheck = checkTokenLimit(text, maxTokenCall, parsed.break_token_rule ?? false);
      if (!tokenCheck.allowed) {
        return { content: [{ type: 'text', text: tokenCheck.error! }] };
      }
      return { content: [{ type: 'text', text }] };
    }
  );
}
