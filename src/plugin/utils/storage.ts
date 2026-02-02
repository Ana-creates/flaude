import { STORAGE_KEYS, DEFAULT_MODEL } from '../../shared/constants/defaults';
import type { Settings, ClaudeModel, KnowledgeBase, KnowledgeEntry, License } from '../../shared/types';

/**
 * Load API key from Figma's clientStorage
 */
export async function loadApiKey(): Promise<string | null> {
  try {
    const key = await figma.clientStorage.getAsync(STORAGE_KEYS.API_KEY);
    return typeof key === 'string' ? key : null;
  } catch (error) {
    console.error('Failed to load API key:', error);
    return null;
  }
}

/**
 * Save API key to Figma's clientStorage
 */
export async function saveApiKey(key: string): Promise<void> {
  try {
    await figma.clientStorage.setAsync(STORAGE_KEYS.API_KEY, key);
  } catch (error) {
    console.error('Failed to save API key:', error);
    throw new Error('Failed to save API key');
  }
}

/**
 * Load model from Figma's clientStorage
 */
export async function loadModel(): Promise<ClaudeModel> {
  try {
    const model = await figma.clientStorage.getAsync(STORAGE_KEYS.MODEL);
    return (model as ClaudeModel) || DEFAULT_MODEL;
  } catch (error) {
    console.error('Failed to load model:', error);
    return DEFAULT_MODEL;
  }
}

/**
 * Save model to Figma's clientStorage
 */
export async function saveModel(model: ClaudeModel): Promise<void> {
  try {
    await figma.clientStorage.setAsync(STORAGE_KEYS.MODEL, model);
  } catch (error) {
    console.error('Failed to save model:', error);
    throw new Error('Failed to save model');
  }
}

/**
 * Load settings (including API key status and model)
 */
export async function loadSettings(): Promise<Settings> {
  const apiKey = await loadApiKey();
  const model = await loadModel();
  return {
    apiKey: apiKey || '',
    hasApiKey: !!apiKey,
    model,
  };
}

/**
 * Clear API key
 */
export async function clearApiKey(): Promise<void> {
  await figma.clientStorage.deleteAsync(STORAGE_KEYS.API_KEY);
}

// ============== KNOWLEDGE BASE ==============

const DEFAULT_KNOWLEDGE_BASE: KnowledgeBase = {
  entries: [],
  lastUpdated: 0,
};

/**
 * Load knowledge base from Figma's clientStorage
 */
export async function loadKnowledgeBase(): Promise<KnowledgeBase> {
  try {
    const data = await figma.clientStorage.getAsync(STORAGE_KEYS.KNOWLEDGE_BASE);
    if (data && typeof data === 'object' && Array.isArray((data as KnowledgeBase).entries)) {
      return data as KnowledgeBase;
    }
    return DEFAULT_KNOWLEDGE_BASE;
  } catch (error) {
    console.error('Failed to load knowledge base:', error);
    return DEFAULT_KNOWLEDGE_BASE;
  }
}

/**
 * Save knowledge base to Figma's clientStorage
 */
export async function saveKnowledgeBase(kb: KnowledgeBase): Promise<void> {
  try {
    await figma.clientStorage.setAsync(STORAGE_KEYS.KNOWLEDGE_BASE, {
      ...kb,
      lastUpdated: Date.now(),
    });
  } catch (error) {
    console.error('Failed to save knowledge base:', error);
    throw new Error('Failed to save knowledge base');
  }
}

/**
 * Add a new knowledge entry
 */
export async function addKnowledgeEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeEntry> {
  const kb = await loadKnowledgeBase();
  const newEntry: KnowledgeEntry = {
    ...entry,
    id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  kb.entries.push(newEntry);
  await saveKnowledgeBase(kb);
  return newEntry;
}

/**
 * Update a knowledge entry
 */
export async function updateKnowledgeEntry(id: string, updates: Partial<Omit<KnowledgeEntry, 'id' | 'createdAt'>>): Promise<KnowledgeEntry | null> {
  const kb = await loadKnowledgeBase();
  const index = kb.entries.findIndex(e => e.id === id);
  if (index === -1) return null;

  kb.entries[index] = {
    ...kb.entries[index],
    ...updates,
    updatedAt: Date.now(),
  };
  await saveKnowledgeBase(kb);
  return kb.entries[index];
}

/**
 * Delete a knowledge entry
 */
export async function deleteKnowledgeEntry(id: string): Promise<boolean> {
  const kb = await loadKnowledgeBase();
  const initialLength = kb.entries.length;
  kb.entries = kb.entries.filter(e => e.id !== id);
  if (kb.entries.length < initialLength) {
    await saveKnowledgeBase(kb);
    return true;
  }
  return false;
}

// ============== LICENSE ==============

/**
 * Load license from Figma's clientStorage
 */
export async function loadLicense(): Promise<License | null> {
  try {
    const data = await figma.clientStorage.getAsync(STORAGE_KEYS.LICENSE);
    if (data && typeof data === 'object') {
      return data as License;
    }
    return null;
  } catch (error) {
    console.error('Failed to load license:', error);
    return null;
  }
}

/**
 * Save license to Figma's clientStorage
 */
export async function saveLicense(license: License | null): Promise<void> {
  try {
    if (license) {
      await figma.clientStorage.setAsync(STORAGE_KEYS.LICENSE, license);
    } else {
      await figma.clientStorage.deleteAsync(STORAGE_KEYS.LICENSE);
    }
  } catch (error) {
    console.error('Failed to save license:', error);
    throw new Error('Failed to save license');
  }
}

/**
 * Load analyses count for current month
 */
export async function loadAnalysesCount(): Promise<number> {
  try {
    const data = await figma.clientStorage.getAsync(STORAGE_KEYS.ANALYSES_COUNT);
    if (data && typeof data === 'object') {
      const { count, month } = data as { count: number; month: string };
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      if (month === currentMonth) {
        return count;
      }
    }
    return 0;
  } catch (error) {
    console.error('Failed to load analyses count:', error);
    return 0;
  }
}

/**
 * Save analyses count
 */
export async function saveAnalysesCount(count: number): Promise<void> {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    await figma.clientStorage.setAsync(STORAGE_KEYS.ANALYSES_COUNT, { count, month: currentMonth });
  } catch (error) {
    console.error('Failed to save analyses count:', error);
  }
}
