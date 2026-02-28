// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2024 TocharianOU Contributors

import {
  CloudTrailClient,
  LookupEventsCommand,
  LookupEventsCommandInput,
} from '@aws-sdk/client-cloudtrail';
import { CloudTrailConfig } from '../types.js';
import { createCloudTrailClient } from '../utils/api.js';
import {
  LookupEventsResult,
  LookupAttributeKey,
  parseTimeInput,
  formatEvent,
} from '../types/cloudtrail.js';

export interface LookupEventsArgs {
  startTime?: string;
  endTime?: string;
  attributeKey?: LookupAttributeKey;
  attributeValue?: string;
  maxResults?: number;
  nextToken?: string;
  region?: string;
}

function validateMaxResults(value: number | undefined, def: number, max: number): number {
  if (value === undefined) return def;
  return Math.max(1, Math.min(max, value));
}

export async function handleLookupEvents(
  config: CloudTrailConfig,
  args: LookupEventsArgs
): Promise<string> {
  const region = args.region ?? config.region ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const client: CloudTrailClient = createCloudTrailClient(config, region);

  // Time resolution
  let startStr = args.startTime;
  let endStr = args.endTime;

  if (args.nextToken) {
    if (!startStr || !endStr) {
      throw new Error(
        'Both startTime and endTime are required when using pagination (nextToken). ' +
          'Use the exact startTime and endTime from the queryParams in the previous response.'
      );
    }
  } else {
    startStr = startStr ?? '1 day ago';
    endStr = endStr ?? 'now';
  }

  const startDt = parseTimeInput(startStr!);
  const endDt = parseTimeInput(endStr!);
  const maxResults = validateMaxResults(args.maxResults, 10, 50);

  const params: LookupEventsCommandInput = {
    StartTime: startDt,
    EndTime: endDt,
    MaxResults: maxResults,
  };

  if (args.attributeKey && args.attributeValue) {
    params.LookupAttributes = [
      { AttributeKey: args.attributeKey, AttributeValue: args.attributeValue },
    ];
  }

  if (args.nextToken) {
    params.NextToken = args.nextToken;
  }

  const response = await client.send(new LookupEventsCommand(params));
  const events = response.Events ?? [];

  const result: LookupEventsResult = {
    events: events.map((e) => ({
      EventId: e.EventId,
      EventName: e.EventName,
      ReadOnly: e.ReadOnly,
      AccessKeyId: e.AccessKeyId,
      EventTime: e.EventTime,
      EventSource: e.EventSource,
      Username: e.Username,
      Resources: e.Resources?.map((r) => ({
        ResourceType: r.ResourceType,
        ResourceName: r.ResourceName,
      })),
      CloudTrailEvent: e.CloudTrailEvent,
    })),
    nextToken: response.NextToken,
    queryParams: {
      startTime: startDt.toISOString(),
      endTime: endDt.toISOString(),
      attributeKey: args.attributeKey,
      attributeValue: args.attributeValue,
      maxResults,
      region,
    },
  };

  const lines: string[] = [];
  lines.push(`CloudTrail Events (region: ${region})`);
  lines.push(`Time range: ${startDt.toISOString()} → ${endDt.toISOString()}`);
  if (args.attributeKey) {
    lines.push(`Filter: ${args.attributeKey} = "${args.attributeValue}"`);
  }
  lines.push(`Found: ${events.length} event(s)`);
  lines.push('');

  if (events.length === 0) {
    lines.push('No events found matching the specified criteria.');
  } else {
    result.events.forEach((event, idx) => {
      lines.push(`─── Event ${idx + 1} ───`);
      lines.push(formatEvent(event));
      lines.push('');
    });
  }

  if (result.nextToken) {
    lines.push(`⟶ More results available. Use nextToken for the next page:`);
    lines.push(`  nextToken: ${result.nextToken}`);
    lines.push(
      `  startTime: ${result.queryParams.startTime}  (must match original request)`
    );
    lines.push(
      `  endTime:   ${result.queryParams.endTime}  (must match original request)`
    );
  }

  return lines.join('\n');
}
