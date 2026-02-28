// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2024 TocharianOU Contributors

import {
  CloudTrailClient,
  StartQueryCommand,
  DescribeQueryCommand,
  GetQueryResultsCommand,
  ListEventDataStoresCommand,
  GetEventDataStoreCommand,
} from '@aws-sdk/client-cloudtrail';
import { CloudTrailConfig } from '../types.js';
import { createCloudTrailClient } from '../utils/api.js';
import { QueryResult, QueryStatus } from '../types/cloudtrail.js';

const MAX_POLL_SECONDS = 300;
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateMaxResults(value: number | undefined, def: number, max: number): number {
  if (value === undefined) return def;
  return Math.max(1, Math.min(max, value));
}

// ─── Lake Query ──────────────────────────────────────────────────────────────

export interface LakeQueryArgs {
  sql: string;
  waitForCompletion?: boolean;
  region?: string;
}

export async function handleLakeQuery(
  config: CloudTrailConfig,
  args: LakeQueryArgs
): Promise<string> {
  const region = args.region ?? config.region ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const client: CloudTrailClient = createCloudTrailClient(config, region);
  const waitForCompletion = args.waitForCompletion ?? true;

  const startResponse = await client.send(
    new StartQueryCommand({ QueryStatement: args.sql })
  );
  const queryId = startResponse.QueryId!;

  if (!waitForCompletion) {
    const initialStatus = await client.send(new DescribeQueryCommand({ QueryId: queryId }));
    const lines: string[] = [
      `Query submitted (region: ${region})`,
      `Query ID: ${queryId}`,
      `Status:   ${initialStatus.QueryStatus ?? 'RUNNING'}`,
      '',
      'Use get_query_status to poll for completion, then get_query_results to fetch results.',
    ];
    return lines.join('\n');
  }

  // Poll for completion
  let queryStatus = 'RUNNING';
  let finalErrorMessage: string | undefined;
  let elapsed = 0;

  while (elapsed < MAX_POLL_SECONDS * 1000) {
    const statusResponse = await client.send(new DescribeQueryCommand({ QueryId: queryId }));
    queryStatus = statusResponse.QueryStatus ?? 'UNKNOWN';
    finalErrorMessage = statusResponse.ErrorMessage;

    if (['FINISHED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(queryStatus)) {
      break;
    }

    await sleep(POLL_INTERVAL_MS);
    elapsed += POLL_INTERVAL_MS;
  }

  if (queryStatus === 'FINISHED') {
    return handleGetQueryResults(config, { queryId, maxResults: 50, region });
  }

  const lines: string[] = [
    `Query completed with status: ${queryStatus} (region: ${region})`,
    `Query ID: ${queryId}`,
  ];
  if (finalErrorMessage) lines.push(`Error: ${finalErrorMessage}`);
  return lines.join('\n');
}

// ─── Get Query Status ─────────────────────────────────────────────────────────

export interface GetQueryStatusArgs {
  queryId: string;
  region?: string;
}

export async function handleGetQueryStatus(
  config: CloudTrailConfig,
  args: GetQueryStatusArgs
): Promise<string> {
  const region = args.region ?? config.region ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const client: CloudTrailClient = createCloudTrailClient(config, region);

  const response = await client.send(new DescribeQueryCommand({ QueryId: args.queryId }));

  const status: QueryStatus = {
    queryId: args.queryId,
    queryStatus: response.QueryStatus ?? 'UNKNOWN',
    queryStatistics: response.QueryStatistics as QueryStatus['queryStatistics'],
    errorMessage: response.ErrorMessage,
    deliveryS3Uri: response.DeliveryS3Uri,
    deliveryStatus: response.DeliveryStatus,
  };

  const lines: string[] = [
    `CloudTrail Lake Query Status (region: ${region})`,
    `Query ID: ${status.queryId}`,
    `Status:   ${status.queryStatus}`,
  ];

  if (status.queryStatistics) {
    const s = status.queryStatistics;
    lines.push('');
    lines.push('Statistics:');
    if (s.EventsMatched !== undefined) lines.push(`  Events matched: ${s.EventsMatched}`);
    if (s.EventsScanned !== undefined) lines.push(`  Events scanned: ${s.EventsScanned}`);
    if (s.BytesScanned !== undefined)
      lines.push(`  Bytes scanned:  ${(s.BytesScanned / 1024).toFixed(2)} KB`);
    if (s.ExecutionTimeInMillis !== undefined)
      lines.push(`  Execution time: ${s.ExecutionTimeInMillis} ms`);
  }

  if (status.errorMessage) {
    lines.push('');
    lines.push(`Error: ${status.errorMessage}`);
  }

  if (status.deliveryS3Uri) {
    lines.push('');
    lines.push(`Delivery S3 URI: ${status.deliveryS3Uri}`);
    lines.push(`Delivery status: ${status.deliveryStatus ?? 'Unknown'}`);
  }

  return lines.join('\n');
}

// ─── Get Query Results ────────────────────────────────────────────────────────

export interface GetQueryResultsArgs {
  queryId: string;
  maxResults?: number;
  nextToken?: string;
  region?: string;
}

export async function handleGetQueryResults(
  config: CloudTrailConfig,
  args: GetQueryResultsArgs
): Promise<string> {
  const region = args.region ?? config.region ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const client: CloudTrailClient = createCloudTrailClient(config, region);
  const maxResults = validateMaxResults(args.maxResults, 50, 50);

  const queryResultsInput = {
    QueryId: args.queryId,
    MaxQueryResults: maxResults,
    ...(args.nextToken ? { NextToken: args.nextToken } : {}),
  };

  const [resultsResponse, statusResponse] = await Promise.all([
    client.send(new GetQueryResultsCommand(queryResultsInput)),
    client.send(new DescribeQueryCommand({ QueryId: args.queryId })),
  ]);

  const result: QueryResult = {
    queryId: args.queryId,
    queryStatus: statusResponse.QueryStatus ?? 'UNKNOWN',
    queryStatistics: statusResponse.QueryStatistics as QueryResult['queryStatistics'],
    queryResultRows: resultsResponse.QueryResultRows as QueryResult['queryResultRows'],
    nextToken: resultsResponse.NextToken,
    errorMessage: statusResponse.ErrorMessage,
  };

  const rows = result.queryResultRows ?? [];
  const lines: string[] = [
    `CloudTrail Lake Query Results (region: ${region})`,
    `Query ID: ${result.queryId}`,
    `Status:   ${result.queryStatus}`,
    `Rows:     ${rows.length}`,
    '',
  ];

  if (result.queryStatistics) {
    const s = result.queryStatistics;
    if (s.EventsMatched !== undefined) lines.push(`Events matched: ${s.EventsMatched}`);
    if (s.ExecutionTimeInMillis !== undefined)
      lines.push(`Execution time: ${s.ExecutionTimeInMillis} ms`);
    lines.push('');
  }

  if (rows.length === 0) {
    lines.push('No results returned.');
  } else {
    rows.forEach((row, idx) => {
      lines.push(`─── Row ${idx + 1} ───`);
      if (Array.isArray(row)) {
        row.forEach((cell: Record<string, string>) => {
          const [key, val] = Object.entries(cell)[0] ?? ['?', '?'];
          lines.push(`  ${key}: ${val}`);
        });
      } else {
        lines.push(`  ${JSON.stringify(row)}`);
      }
    });
  }

  if (result.nextToken) {
    lines.push('');
    lines.push(`⟶ More results available. Use nextToken for the next page:`);
    lines.push(`  nextToken: ${result.nextToken}`);
  }

  return lines.join('\n');
}

// ─── List Event Data Stores ───────────────────────────────────────────────────

export interface ListEventDataStoresArgs {
  includeDetails?: boolean;
  region?: string;
}

export async function handleListEventDataStores(
  config: CloudTrailConfig,
  args: ListEventDataStoresArgs
): Promise<string> {
  const region = args.region ?? config.region ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
  const client: CloudTrailClient = createCloudTrailClient(config, region);
  const includeDetails = args.includeDetails ?? true;

  const response = await client.send(new ListEventDataStoresCommand({}));
  const stores = response.EventDataStores ?? [];

  const lines: string[] = [
    `CloudTrail Lake Event Data Stores (region: ${region})`,
    `Found: ${stores.length} store(s)`,
    '',
  ];

  if (stores.length === 0) {
    lines.push(
      'No Event Data Stores found in this region. ' +
        'CloudTrail Lake must be enabled and configured.'
    );
    return lines.join('\n');
  }

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    lines.push(`─── Store ${i + 1} ───`);
    lines.push(`Name:    ${store.Name ?? 'Unknown'}`);
    lines.push(`ARN:     ${store.EventDataStoreArn ?? 'Unknown'}`);
    lines.push(`Status:  ${store.Status ?? 'Unknown'}`);
    if (store.RetentionPeriod !== undefined)
      lines.push(`Retention: ${store.RetentionPeriod} days`);
    if (store.CreatedTimestamp)
      lines.push(`Created: ${new Date(store.CreatedTimestamp).toISOString()}`);

    if (includeDetails && store.EventDataStoreArn) {
      try {
        const details = await client.send(
          new GetEventDataStoreCommand({ EventDataStore: store.EventDataStoreArn })
        );
        if (details.MultiRegionEnabled !== undefined)
          lines.push(`Multi-region: ${details.MultiRegionEnabled}`);
        if (details.OrganizationEnabled !== undefined)
          lines.push(`Org-enabled:  ${details.OrganizationEnabled}`);
        if (details.AdvancedEventSelectors && details.AdvancedEventSelectors.length > 0) {
          lines.push(`Event selectors: ${details.AdvancedEventSelectors.length}`);
        }
      } catch {
        lines.push('(Unable to retrieve detailed configuration)');
      }
    }

    lines.push('');
  }

  lines.push(
    'Tip: Use the EventDataStoreArn (without the full ARN prefix) as the FROM clause ID in lake_query SQL statements.'
  );

  return lines.join('\n');
}
