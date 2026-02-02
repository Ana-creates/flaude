/**
 * Claude API client for Figma plugin
 * Makes HTTP requests to api.anthropic.com
 */

import { SYSTEM_PROMPTS } from './prompts';
import type { ChatMessage, SelectionContext } from '../../shared/types/chat';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

interface ClaudeError {
  type: string;
  error: { type: string; message: string };
}

/**
 * Send a message to Claude API using XMLHttpRequest
 * (More compatible with Figma's sandbox than fetch)
 */
export function sendMessage(
  apiKey: string,
  messages: ClaudeMessage[],
  systemPrompt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestBody = {
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    };

    let bodyString: string;
    try {
      bodyString = JSON.stringify(requestBody);
    } catch (e) {
      reject(new Error(`Failed to serialize: ${e instanceof Error ? e.message : String(e)}`));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('x-api-key', apiKey);
    xhr.setRequestHeader('anthropic-version', '2023-06-01');

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as ClaudeResponse;
          resolve(data.content[0]?.text || '');
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e instanceof Error ? e.message : String(e)}`));
        }
      } else {
        let errorMessage = `API error: ${xhr.status}`;
        try {
          const error = JSON.parse(xhr.responseText) as ClaudeError;
          errorMessage = error.error?.message || errorMessage;
        } catch {
          // Couldn't parse error
        }
        reject(new Error(errorMessage));
      }
    };

    xhr.onerror = function () {
      reject(new Error(`Network error: XHR failed (status: ${xhr.status})`));
    };

    xhr.ontimeout = function () {
      reject(new Error('Request timed out'));
    };

    xhr.timeout = 60000; // 60 second timeout

    try {
      xhr.send(bodyString);
    } catch (e) {
      reject(new Error(`Send failed: ${e instanceof Error ? e.message : String(e)}`));
    }
  });
}

/**
 * Send a chat message with context
 */
export async function sendChatMessage(
  apiKey: string,
  userMessage: string,
  context: SelectionContext | null,
  history: ChatMessage[]
): Promise<string> {
  // Build context string
  let contextStr = '';
  if (context && context.count > 0) {
    contextStr = `\n\n---\n**Current Selection Context:**\n${context.summary}\n- ${context.count} element(s) selected\n- Types: ${context.nodeTypes.join(', ')}\n---\n\n`;
  }

  // Convert history to Claude format
  const messages: ClaudeMessage[] = history
    .filter(m => !m.isStreaming)
    .map(m => ({
      role: m.role,
      content: m.content,
    }));

  // Add current message with context
  messages.push({
    role: 'user',
    content: contextStr + userMessage,
  });

  return sendMessage(apiKey, messages, SYSTEM_PROMPTS.chat);
}

/**
 * Test API connection
 */
export async function testConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await sendMessage(
      apiKey,
      [{ role: 'user', content: 'Say "connected" in one word.' }],
      'Respond with exactly one word.'
    );
    const success = response.toLowerCase().includes('connected');
    return { success, error: success ? undefined : 'Unexpected response from API' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
