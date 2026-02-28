/**
 * TypeScript interfaces for AWS CloudTrail API responses.
 * Based on the AWS SDK v3 @aws-sdk/client-cloudtrail types.
 */

export interface CloudTrailEvent {
  EventId?: string;
  EventName?: string;
  ReadOnly?: string;
  AccessKeyId?: string;
  EventTime?: Date;
  EventSource?: string;
  Username?: string;
  Resources?: Array<{
    ResourceType?: string;
    ResourceName?: string;
  }>;
  CloudTrailEvent?: string;
}

export interface LookupEventsResult {
  events: CloudTrailEvent[];
  nextToken?: string;
  queryParams: {
    startTime: string;
    endTime: string;
    attributeKey?: string;
    attributeValue?: string;
    maxResults: number;
    region: string;
  };
}

export interface EventDataStore {
  EventDataStoreArn?: string;
  Name?: string;
  Status?: string;
  CreatedTimestamp?: Date;
  UpdatedTimestamp?: Date;
  RetentionPeriod?: number;
  TerminationProtectionEnabled?: boolean;
}

export interface QueryStats {
  EventsMatched?: number;
  EventsScanned?: number;
  BytesScanned?: number;
  ExecutionTimeInMillis?: number;
  CreationTime?: Date;
}

export interface QueryStatus {
  queryId: string;
  queryStatus: string;
  queryStatistics?: QueryStats;
  errorMessage?: string;
  deliveryS3Uri?: string;
  deliveryStatus?: string;
}

export interface QueryResult {
  queryId: string;
  queryStatus: string;
  queryStatistics?: QueryStats;
  queryResultRows?: Array<Record<string, string>[]>;
  nextToken?: string;
  errorMessage?: string;
}

/** Attribute keys supported by the CloudTrail LookupEvents API */
export const LOOKUP_ATTRIBUTE_KEYS = [
  'EventId',
  'EventName',
  'ReadOnly',
  'Username',
  'ResourceType',
  'ResourceName',
  'EventSource',
  'AccessKeyId',
] as const;

export type LookupAttributeKey = typeof LOOKUP_ATTRIBUTE_KEYS[number];

/**
 * Parse a relative or ISO time string to a Date.
 * Supports:
 *   - ISO strings: "2025-01-01T00:00:00Z"
 *   - Relative: "1 day ago", "2 hours ago", "30 minutes ago", "now"
 */
export function parseTimeInput(input: string): Date {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === 'now') return new Date();

  // Relative time: "<n> <unit> ago"
  const relativeMatch = trimmed.match(/^(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const now = new Date();
    const ms: Record<string, number> = {
      second: 1000,
      minute: 60 * 1000,
      hour: 3600 * 1000,
      day: 86400 * 1000,
      week: 7 * 86400 * 1000,
      month: 30 * 86400 * 1000,
    };
    return new Date(now.getTime() - amount * ms[unit]);
  }

  // Try ISO parse
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed;

  throw new Error(
    `Invalid time format: "${input}". Use ISO format (e.g. "2025-01-01T00:00:00Z") or relative (e.g. "1 day ago", "2 hours ago").`
  );
}

/** Format a CloudTrail event for human-readable output */
export function formatEvent(event: CloudTrailEvent): string {
  const lines: string[] = [];
  lines.push(`Event:       ${event.EventName ?? 'Unknown'}`);
  lines.push(`Source:      ${event.EventSource ?? 'Unknown'}`);
  lines.push(`Time:        ${event.EventTime?.toISOString() ?? 'Unknown'}`);
  lines.push(`User:        ${event.Username ?? 'Unknown'}`);
  lines.push(`Access Key:  ${event.AccessKeyId ?? 'N/A'}`);
  lines.push(`Read Only:   ${event.ReadOnly ?? 'Unknown'}`);
  lines.push(`Event ID:    ${event.EventId ?? 'Unknown'}`);

  if (event.Resources && event.Resources.length > 0) {
    lines.push('Resources:');
    event.Resources.forEach((r) => {
      lines.push(`  • ${r.ResourceType ?? 'Unknown'}: ${r.ResourceName ?? 'Unknown'}`);
    });
  }

  return lines.join('\n');
}
