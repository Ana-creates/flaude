/**
 * Chat message types for the FigmaClaude plugin
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface SelectionContext {
  count: number;
  nodeIds: string[];
  nodeTypes: string[];
  nodeNames: string[];
  hasPrototypeLinks: boolean;
  summary: string;
}

export interface AnalysisResult {
  type: 'analyze' | 'flows' | 'critique';
  content: string;
  metadata?: {
    screenCount?: number;
    issueCount?: number;
    flowCount?: number;
    score?: number;
  };
}

export type QuickActionType = 'flows' | 'validate';

export type ClaudeModel = 'claude-haiku-3-5-20241022' | 'claude-sonnet-4-20250514' | 'claude-opus-4-20250514';

export const CLAUDE_MODELS: { id: ClaudeModel; name: string; description: string }[] = [
  { id: 'claude-haiku-3-5-20241022', name: 'Haiku 3.5', description: 'Fast & cheap' },
  { id: 'claude-sonnet-4-20250514', name: 'Sonnet 4', description: 'Balanced' },
  { id: 'claude-opus-4-20250514', name: 'Opus 4', description: 'Most capable' },
];

export interface Settings {
  apiKey: string;
  hasApiKey: boolean;
  model: ClaudeModel;
}

// ============== KNOWLEDGE BASE ==============

export type KnowledgeCategory =
  | 'requirements'      // What the app should do
  | 'user_personas'     // Who the users are
  | 'user_flows'        // Expected journeys
  | 'business_rules'    // Domain logic, constraints
  | 'other';            // Miscellaneous

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeBase {
  entries: KnowledgeEntry[];
  lastUpdated: number;
}

export const KNOWLEDGE_CATEGORIES: { id: KnowledgeCategory; label: string; description: string }[] = [
  { id: 'requirements', label: 'Requirements', description: 'What the app should do' },
  { id: 'user_personas', label: 'User Personas', description: 'Who uses this & their needs' },
  { id: 'user_flows', label: 'User Flows', description: 'Expected journeys & paths' },
  { id: 'business_rules', label: 'Business Rules', description: 'Domain logic & constraints' },
  { id: 'other', label: 'Other', description: 'Research, notes, etc.' },
];

// ============== LICENSE / PRO ==============

export type PlanType = 'free' | 'pro';

export interface License {
  email: string;
  key: string;
  plan: PlanType;
  activatedAt: number;
}

export const PLAN_LIMITS = {
  free: {
    analysesPerMonth: Infinity,  // TESTING MODE - remove limit
    models: ['claude-haiku-3-5-20241022', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'] as ClaudeModel[],  // TESTING MODE - all models
  },
  pro: {
    analysesPerMonth: Infinity,
    models: ['claude-haiku-3-5-20241022', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'] as ClaudeModel[],
  },
};

export const FLAUDE_UPGRADE_URL = 'https://flaude.app/upgrade';
export const FLAUDE_PRICE = '$7/month';
