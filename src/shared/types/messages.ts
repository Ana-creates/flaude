/**
 * Message types for communication between plugin (main) and UI threads
 */

import type { ChatMessage, SelectionContext, QuickActionType, Settings, KnowledgeBase, KnowledgeEntry, KnowledgeCategory } from './chat';

// Messages sent from UI to Plugin
export type UIToPluginMessage =
  // Chat messages
  | { type: 'CHAT_MESSAGE'; payload: { message: string } }
  | { type: 'QUICK_ACTION'; payload: { action: QuickActionType } }
  // Settings
  | { type: 'SAVE_API_KEY'; payload: { key: string } }
  | { type: 'LOAD_SETTINGS' }
  | { type: 'TEST_CONNECTION' }
  // Selection
  | { type: 'GET_SELECTION_CONTEXT' }
  // Knowledge Base
  | { type: 'LOAD_KNOWLEDGE_BASE' }
  | { type: 'ADD_KNOWLEDGE_ENTRY'; payload: { title: string; category: KnowledgeCategory; content: string } }
  | { type: 'UPDATE_KNOWLEDGE_ENTRY'; payload: { id: string; title?: string; category?: KnowledgeCategory; content?: string } }
  | { type: 'DELETE_KNOWLEDGE_ENTRY'; payload: { id: string } }
  // Legacy
  | { type: 'CLOSE_PLUGIN' };

// Messages sent from Plugin to UI
export type PluginToUIMessage =
  // Chat messages
  | { type: 'CHAT_RESPONSE'; payload: ChatMessage }
  | { type: 'CHAT_STREAMING'; payload: { text: string; done: boolean } }
  | { type: 'CHAT_ERROR'; payload: { error: string } }
  // Settings
  | { type: 'SETTINGS_LOADED'; payload: Settings }
  | { type: 'CONNECTION_TEST_RESULT'; payload: { success: boolean; message: string } }
  // Selection
  | { type: 'SELECTION_CONTEXT'; payload: SelectionContext }
  // Knowledge Base
  | { type: 'KNOWLEDGE_BASE_LOADED'; payload: KnowledgeBase }
  | { type: 'KNOWLEDGE_ENTRY_ADDED'; payload: KnowledgeEntry }
  | { type: 'KNOWLEDGE_ENTRY_UPDATED'; payload: KnowledgeEntry }
  | { type: 'KNOWLEDGE_ENTRY_DELETED'; payload: { id: string } }
  // General
  | { type: 'LOADING'; payload: { isLoading: boolean } }
  | { type: 'ERROR'; payload: { message: string } };

// Re-export chat types for convenience
export type { ChatMessage, SelectionContext, QuickActionType, Settings, KnowledgeBase, KnowledgeEntry, KnowledgeCategory };
