import { z } from 'zod';

export const CloudTrailConfigSchema = z.object({
  accessKeyId: z
    .string()
    .optional()
    .describe(
      'AWS Access Key ID. If omitted, falls back to AWS_ACCESS_KEY_ID environment variable.'
    ),
  secretAccessKey: z
    .string()
    .optional()
    .describe(
      'AWS Secret Access Key. If omitted, falls back to AWS_SECRET_ACCESS_KEY environment variable.'
    ),
  region: z
    .string()
    .optional()
    .describe(
      'Default AWS region (e.g. us-east-1). If omitted, falls back to AWS_DEFAULT_REGION environment variable.'
    ),
  sessionToken: z
    .string()
    .optional()
    .describe(
      'AWS Session Token for temporary credentials (AssumeRole / AWS SSO). Optional.'
    ),
  timeout: z
    .number()
    .optional()
    .describe('Request timeout in milliseconds (default: 30000).'),
});

export type CloudTrailConfig = z.infer<typeof CloudTrailConfigSchema>;
