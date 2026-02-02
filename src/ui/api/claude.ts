/**
 * Claude API client - runs in UI iframe (has full browser APIs)
 */

import type { ClaudeModel } from '../../shared/types';
import { DEFAULT_MODEL } from '../../shared/constants/defaults';

const API_URL = 'https://api.anthropic.com/v1/messages';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  id: string;
  content: Array<{ type: string; text: string }>;
}

interface ClaudeError {
  error: { type: string; message: string };
}

/**
 * Call Claude API from the UI iframe
 * Uses the special header required for browser-based calls
 */
export async function callClaudeAPI(
  apiKey: string,
  messages: ClaudeMessage[],
  systemPrompt: string,
  model: ClaudeModel = DEFAULT_MODEL
): Promise<string> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true', // Required for browser calls!
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status}`;
    try {
      const error = (await response.json()) as ClaudeError;
      errorMessage = error.error?.message || errorMessage;
    } catch {
      // Couldn't parse error
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as ClaudeResponse;
  return data.content[0]?.text || '';
}

/**
 * Test API connection
 */
export async function testClaudeConnection(
  apiKey: string,
  model: ClaudeModel = DEFAULT_MODEL
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await callClaudeAPI(
      apiKey,
      [{ role: 'user', content: 'Say "connected" in one word.' }],
      'Respond with exactly one word.',
      model
    );
    const success = response.toLowerCase().includes('connected');
    return { success, error: success ? undefined : 'Unexpected response' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
