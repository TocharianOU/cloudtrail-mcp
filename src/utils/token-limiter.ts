// SPDX-License-Identifier: Apache-2.0
import { encoding_for_model, TiktokenModel } from 'tiktoken';

export interface TokenCheckResult {
  allowed: boolean;
  tokens: number;
  error?: string;
}

export function calculateTokens(text: string, model: TiktokenModel = 'gpt-4'): number {
  const enc = encoding_for_model(model);
  try {
    return enc.encode(text).length;
  } finally {
    enc.free();
  }
}

export function checkTokenLimit(
  result: unknown,
  maxTokens: number,
  breakRule = false
): TokenCheckResult {
  if (breakRule) {
    return { allowed: true, tokens: 0 };
  }

  const resultText = typeof result === 'string' ? result : JSON.stringify(result);
  const tokens = calculateTokens(resultText);

  if (tokens > maxTokens) {
    return {
      allowed: false,
      tokens,
      error:
        `Token limit exceeded: result contains ${tokens} tokens (limit: ${maxTokens}). ` +
        `To reduce output size, try: reduce maxResults, narrow the time range (startTime/endTime), ` +
        `add more specific filters (attributeKey/attributeValue), add a LIMIT clause to SQL queries, ` +
        `or set break_token_rule: true to bypass this check.`,
    };
  }

  return { allowed: true, tokens };
}
