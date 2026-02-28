import { CloudTrailClient } from '@aws-sdk/client-cloudtrail';
import { CloudTrailConfig } from '../types.js';

const DEFAULT_REGION = 'us-east-1';
const DEFAULT_TIMEOUT = 30000;

/**
 * Creates an AWS CloudTrail SDK v3 client.
 *
 * Credential resolution order (highest priority first):
 *   1. Explicit values from config (accessKeyId / secretAccessKey / sessionToken)
 *   2. Standard AWS environment variables:
 *      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
 *   3. AWS credential file / instance profile (SDK default chain)
 *
 * Region resolution order:
 *   1. config.region
 *   2. AWS_DEFAULT_REGION env var
 *   3. Fallback: us-east-1
 */
export function createCloudTrailClient(config: CloudTrailConfig, region?: string): CloudTrailClient {
  const resolvedRegion =
    region ??
    config.region ??
    process.env.AWS_DEFAULT_REGION ??
    DEFAULT_REGION;

  const requestTimeout = config.timeout ?? DEFAULT_TIMEOUT;

  const clientConfig: ConstructorParameters<typeof CloudTrailClient>[0] = {
    region: resolvedRegion,
    requestHandler: {
      requestTimeout,
    } as Record<string, unknown>,
  };

  // Only supply explicit credentials if at least accessKeyId is provided
  // (prevents overriding the SDK default credential chain with partial values)
  const accessKeyId = config.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = config.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY;

  if (accessKeyId && secretAccessKey) {
    const sessionToken = config.sessionToken ?? process.env.AWS_SESSION_TOKEN;
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  }

  return new CloudTrailClient(clientConfig);
}
