/**
 * Agent Runner - The agentic loop that orchestrates Claude + Tools
 * This runs in the UI iframe (has fetch access)
 * Tool execution happens via message passing to plugin (has Figma API)
 */

import type { ClaudeModel } from '../../shared/types';
import { TOOL_DEFINITIONS, type ToolName } from './tool-definitions';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_ITERATIONS = 8; // Balance between thoroughness and token usage
const MAX_TOOL_RESULT_SIZE = 5000; // Truncate large tool results

interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface ClaudeResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
  usage: { input_tokens: number; output_tokens: number };
}

export interface ToolCall {
  id: string;
  name: ToolName;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolUseId: string;
  result: unknown;
  isError: boolean;
}

export interface AgentUpdate {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error';
  message: string;
  data?: unknown;
}

export type OnUpdate = (update: AgentUpdate) => void;
export type ExecuteToolsFn = (toolCalls: ToolCall[]) => Promise<ToolResult[]>;

/**
 * Run the agent loop until Claude is done or we hit max iterations
 * executeTools is passed in to allow message-based execution to plugin
 */
export async function runAgent(
  apiKey: string,
  model: ClaudeModel,
  systemPrompt: string,
  userMessage: string,
  onUpdate: OnUpdate,
  executeTools: ExecuteToolsFn
): Promise<string> {
  const messages: Message[] = [{ role: 'user', content: userMessage }];

  let iteration = 0;
  let finalResponse = '';

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    onUpdate({ type: 'thinking', message: `Thinking... (step ${iteration})` });

    // Call Claude with tools
    const response = await callClaudeWithTools(apiKey, model, systemPrompt, messages);

    // Process the response
    const toolCalls: ToolCall[] = [];
    const textParts: string[] = [];

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        textParts.push(block.text);
      } else if (block.type === 'tool_use' && block.id && block.name && block.input) {
        toolCalls.push({
          id: block.id,
          name: block.name as ToolName,
          input: block.input
        });
        onUpdate({
          type: 'tool_call',
          message: `Using: ${formatToolName(block.name)}`,
          data: block.input
        });
      }
    }

    // Add assistant message to history
    messages.push({ role: 'assistant', content: response.content });

    // If no tool calls, we're done
    if (response.stop_reason === 'end_turn' || toolCalls.length === 0) {
      finalResponse = textParts.join('\n');
      break;
    }

    // Execute tool calls via callback (runs in plugin)
    const results = await executeTools(toolCalls);

    // Build tool result blocks with truncation
    const toolResultBlocks: ContentBlock[] = results.map(r => {
      let content = JSON.stringify(r.result);
      if (content.length > MAX_TOOL_RESULT_SIZE) {
        content = content.slice(0, MAX_TOOL_RESULT_SIZE) + '\n... [truncated, result too large]';
      }
      return {
        type: 'tool_result' as const,
        tool_use_id: r.toolUseId,
        content
      };
    });

    for (const r of results) {
      const toolCall = toolCalls.find(tc => tc.id === r.toolUseId);
      onUpdate({
        type: 'tool_result',
        message: `${formatToolName(toolCall?.name || 'unknown')} ${r.isError ? 'failed' : 'done'}`,
        data: r.result
      });
    }

    // Add tool results as user message
    messages.push({ role: 'user', content: toolResultBlocks });
  }

  if (iteration >= MAX_ITERATIONS) {
    onUpdate({ type: 'error', message: 'Max iterations reached' });
  }

  onUpdate({ type: 'response', message: finalResponse });
  return finalResponse;
}

/**
 * Call Claude API with tools enabled
 */
async function callClaudeWithTools(
  apiKey: string,
  model: ClaudeModel,
  systemPrompt: string,
  messages: Message[]
): Promise<ClaudeResponse> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048, // Reduced to save tokens
        system: systemPrompt,
        messages,
        tools: TOOL_DEFINITIONS,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      try {
        const error = await response.json();
        errorMessage = error.error?.message || errorMessage;
      } catch {
        // Couldn't parse error
      }
      throw new Error(errorMessage);
    }

    return response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out after 60 seconds');
    }
    throw err;
  }
}

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
