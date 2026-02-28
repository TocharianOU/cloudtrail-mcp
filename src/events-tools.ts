// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2024 TocharianOU Contributors

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CloudTrailConfig } from './types.js';
import { handleLookupEvents } from './handlers/events.js';
import { LOOKUP_ATTRIBUTE_KEYS } from './types/cloudtrail.js';
import { checkTokenLimit } from './utils/token-limiter.js';

// Note: server.tool is called via (server as any) cast to avoid TypeScript
// exceeding instantiation-depth limits when inferring Zod schema generics.

const LookupEventsSchema = z.object({
  startTime: z
    .string()
    .optional()
    .describe(
      'Start time for event lookup. Accepts ISO format ("2025-01-01T00:00:00Z") or relative ' +
        '("1 day ago", "2 hours ago"). Defaults to "1 day ago". ' +
        'IMPORTANT: When paginating (nextToken), must match the original request exactly.'
    ),
  endTime: z
    .string()
    .optional()
    .describe(
      'End time for event lookup. Accepts ISO format or relative ("now"). Defaults to "now". ' +
        'IMPORTANT: When paginating (nextToken), must match the original request exactly.'
    ),
  attributeKey: z
    .enum(LOOKUP_ATTRIBUTE_KEYS)
    .optional()
    .describe(
      'Filter attribute key. One of: EventId, EventName, ReadOnly, Username, ' +
        'ResourceType, ResourceName, EventSource, AccessKeyId.'
    ),
  attributeValue: z
    .string()
    .optional()
    .describe('Value to match for the specified attributeKey.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of events to return (1–50, default: 10).'),
  nextToken: z
    .string()
    .optional()
    .describe(
      'Pagination token from a previous lookup_events response. ' +
        'When provided, startTime and endTime must match the original request.'
    ),
  region: z
    .string()
    .optional()
    .describe('AWS region to query (e.g. us-east-1). Defaults to AWS_DEFAULT_REGION or us-east-1.'),
  break_token_rule: z
    .boolean()
    .optional()
    .default(false)
    .describe('Set to true to bypass token limits in critical situations (default: false)'),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = (name: string, desc: string, shape: unknown, cb: (args: unknown) => unknown) => void;

export function registerEventsTools(server: McpServer, config: CloudTrailConfig, maxTokenCall = 20000): void {
  const registerTool = (server as any).tool.bind(server) as AnyTool;

  registerTool(
    'lookup_events',
    'Look up CloudTrail management events for the last 90 days. Filter by time range, username, ' +
      'event name, access key, resource name/type, or event source. Supports pagination. ' +
      'Ideal for security investigations, auditing IAM actions, and tracing API calls.',
    LookupEventsSchema.shape,
    async (args: unknown) => {
      const parsed = LookupEventsSchema.parse(args);
      const text = await handleLookupEvents(config, parsed);
      const tokenCheck = checkTokenLimit(text, maxTokenCall, parsed.break_token_rule ?? false);
      if (!tokenCheck.allowed) {
        return { content: [{ type: 'text', text: tokenCheck.error! }] };
      }
      return { content: [{ type: 'text', text }] };
    }
  );
}
