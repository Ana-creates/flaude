/**
 * Tool Executor - Routes tool calls to their implementations
 */

import type { ToolName } from './tool-definitions';
import { getAllScreens } from '../tools/get-all-screens';
import { getScreenDetails } from '../tools/get-screen-details';
import { classifyScreenComponents } from '../tools/classify-screen-components';
import { analyzeScreenPurpose } from '../tools/analyze-screen-purpose';
import { mapUserFlows } from '../tools/map-user-flows';
import { detectDataCollection } from '../tools/detect-data-collection';
import { critiqueUX } from '../tools/critique-ux';
import { analyzeAppOverview } from '../tools/analyze-app-overview';

export interface ToolCall {
  name: ToolName;
  input: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Execute a tool call and return the result
 */
export function executeTool(toolCall: ToolCall): ToolResult {
  try {
    switch (toolCall.name) {
      case 'get_all_screens':
        return { success: true, data: getAllScreens() };

      case 'get_screen_details':
        return { success: true, data: getScreenDetails(toolCall.input.screenId as string) };

      case 'classify_screen_components':
        return { success: true, data: classifyScreenComponents(toolCall.input.screenId as string) };

      case 'analyze_screen_purpose':
        return { success: true, data: analyzeScreenPurpose(toolCall.input.screenId as string) };

      case 'map_user_flows':
        return {
          success: true,
          data: mapUserFlows(toolCall.input.includePrototypeLinks as boolean ?? true)
        };

      case 'detect_data_collection':
        return { success: true, data: detectDataCollection() };

      case 'critique_ux':
        return {
          success: true,
          data: critiqueUX(
            toolCall.input.screenId as string | undefined,
            toolCall.input.domain as string | undefined
          )
        };

      case 'analyze_app_overview':
        return { success: true, data: analyzeAppOverview() };

      default:
        return { success: false, error: `Unknown tool: ${toolCall.name}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Execute multiple tool calls in parallel
 */
export function executeTools(toolCalls: ToolCall[]): ToolResult[] {
  return toolCalls.map(executeTool);
}
