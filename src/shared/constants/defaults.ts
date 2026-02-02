/**
 * Default values and constants shared across plugin and UI
 */

export const PLUGIN_NAME = 'FigmaClaude';

export const DEFAULT_FRAME_WIDTH = 400;
export const DEFAULT_FRAME_HEIGHT = 300;

export const UI_DIMENSIONS = {
  width: 380,
  height: 560,
  minWidth: 320,
  minHeight: 400,
} as const;

export const STORAGE_KEYS = {
  API_KEY: 'figmaclaude-api-key',
  MODEL: 'figmaclaude-model',
  SETTINGS: 'figmaclaude-settings',
  CHAT_HISTORY: 'figmaclaude-chat-history',
  KNOWLEDGE_BASE: 'figmaclaude-knowledge-base',
  LICENSE: 'figmaclaude-license',
  ANALYSES_COUNT: 'figmaclaude-analyses-count',
} as const;

export const DEFAULT_MODEL = 'claude-sonnet-4-20250514' as const;
