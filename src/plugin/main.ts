import { showUI, on, emit } from '@create-figma-plugin/utilities';
import { UI_DIMENSIONS } from '../shared/constants/defaults';
import {
  loadSettings,
  saveApiKey,
  saveModel,
  loadKnowledgeBase,
  addKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  loadLicense,
  saveLicense,
  loadAnalysesCount,
} from './utils/storage';
import { extractSelectionContext } from './extractors/selection';
import { executeTool } from './agent/executor';
import { executeMCPCommand } from './mcp/command-handler';
import type { ClaudeModel, KnowledgeCategory, License } from '../shared/types';
import type { ToolName } from './agent/tool-definitions';

// Helper to safely convert any error to string
function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export default function () {
  // Show the plugin UI
  showUI({
    width: UI_DIMENSIONS.width,
    height: UI_DIMENSIONS.height,
  });

  // Listen for selection changes and notify UI
  figma.on('selectionchange', () => {
    const context = extractSelectionContext();
    emit('SELECTION_CONTEXT', context);
  });

  // === Settings handlers ===

  on('LOAD_SETTINGS', async () => {
    const settings = await loadSettings();
    emit('SETTINGS_LOADED', settings);
  });

  on('SAVE_API_KEY', async (payload: { key: string }) => {
    try {
      await saveApiKey(payload.key);
      const settings = await loadSettings();
      emit('SETTINGS_LOADED', settings);
    } catch (error) {
      emit('ERROR', { message: errorToString(error) });
    }
  });

  on('SAVE_MODEL', async (payload: { model: ClaudeModel }) => {
    try {
      await saveModel(payload.model);
      const settings = await loadSettings();
      emit('SETTINGS_LOADED', settings);
    } catch (error) {
      emit('ERROR', { message: errorToString(error) });
    }
  });

  // === License handlers ===

  on('LOAD_LICENSE', async () => {
    try {
      const license = await loadLicense();
      const analysesUsedThisMonth = await loadAnalysesCount();
      emit('LICENSE_LOADED', { license, analysesUsedThisMonth });
    } catch (error) {
      emit('ERROR', { message: errorToString(error) });
    }
  });

  on('SAVE_LICENSE', async (payload: License | null) => {
    try {
      await saveLicense(payload);
      const license = await loadLicense();
      const analysesUsedThisMonth = await loadAnalysesCount();
      emit('LICENSE_LOADED', { license, analysesUsedThisMonth });
    } catch (error) {
      emit('ERROR', { message: errorToString(error) });
    }
  });

  // === Selection handlers ===

  on('GET_SELECTION_CONTEXT', () => {
    const context = extractSelectionContext();
    emit('SELECTION_CONTEXT', context);
  });

  // === Agent tool execution ===

  interface AgentToolCall {
    id: string;
    name: ToolName;
    input: Record<string, unknown>;
  }

  on('EXECUTE_TOOLS', (payload: { requestId: string; toolCalls: AgentToolCall[] }) => {
    try {
      const results = payload.toolCalls.map(tc => {
        const result = executeTool({ name: tc.name, input: tc.input });
        return {
          toolUseId: tc.id,
          result: result.success ? result.data : { error: result.error },
          isError: !result.success,
        };
      });
      emit('TOOL_RESULTS', { requestId: payload.requestId, results });
    } catch (error) {
      emit('TOOL_RESULTS', {
        requestId: payload.requestId,
        results: [],
        error: errorToString(error),
      });
    }
  });

  // === Knowledge Base handlers ===

  on('LOAD_KNOWLEDGE_BASE', async () => {
    try {
      const kb = await loadKnowledgeBase();
      emit('KNOWLEDGE_BASE_LOADED', kb);
    } catch (error) {
      emit('ERROR', { message: errorToString(error) });
    }
  });

  on('ADD_KNOWLEDGE_ENTRY', async (payload: { title: string; category: KnowledgeCategory; content: string }) => {
    try {
      const entry = await addKnowledgeEntry(payload);
      emit('KNOWLEDGE_ENTRY_ADDED', entry);
      // Also send updated full KB
      const kb = await loadKnowledgeBase();
      emit('KNOWLEDGE_BASE_LOADED', kb);
    } catch (error) {
      emit('ERROR', { message: errorToString(error) });
    }
  });

  on('UPDATE_KNOWLEDGE_ENTRY', async (payload: { id: string; title?: string; category?: KnowledgeCategory; content?: string }) => {
    try {
      const entry = await updateKnowledgeEntry(payload.id, payload);
      if (entry) {
        emit('KNOWLEDGE_ENTRY_UPDATED', entry);
        // Also send updated full KB
        const kb = await loadKnowledgeBase();
        emit('KNOWLEDGE_BASE_LOADED', kb);
      }
    } catch (error) {
      emit('ERROR', { message: errorToString(error) });
    }
  });

  on('DELETE_KNOWLEDGE_ENTRY', async (payload: { id: string }) => {
    try {
      const deleted = await deleteKnowledgeEntry(payload.id);
      if (deleted) {
        emit('KNOWLEDGE_ENTRY_DELETED', { id: payload.id });
        // Also send updated full KB
        const kb = await loadKnowledgeBase();
        emit('KNOWLEDGE_BASE_LOADED', kb);
      }
    } catch (error) {
      emit('ERROR', { message: errorToString(error) });
    }
  });

  // === MCP Command Handler (for external Claude control) ===

  interface MCPCommand {
    requestId: string;
    command: string;
    params: Record<string, unknown>;
  }

  on('MCP_EXECUTE_COMMAND', async (payload: MCPCommand) => {
    try {
      console.log('[Plugin] Executing MCP command:', payload.command);
      const result = await executeMCPCommand(payload.command, payload.params);
      emit('MCP_TOOL_RESULT', {
        requestId: payload.requestId,
        data: result,
      });
    } catch (error) {
      emit('MCP_TOOL_RESULT', {
        requestId: payload.requestId,
        error: errorToString(error),
      });
    }
  });

  // === Plugin lifecycle ===

  on('CLOSE_PLUGIN', () => {
    figma.closePlugin();
  });

  // === UI Resize handler (for collapse/expand) ===
  on('RESIZE_UI', (payload: { width: number; height: number }) => {
    figma.ui.resize(payload.width, payload.height);
  });
}
