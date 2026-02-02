/**
 * Component Pattern Recognition
 * Signals and rules for identifying UI components
 */

// Helper types
interface NodeInfo {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  children?: NodeInfo[];
  characters?: string;
  fills?: unknown[];
  strokes?: unknown[];
  cornerRadius?: number;
  effects?: unknown[];
  parent?: NodeInfo;
  reactions?: unknown[];
}

// ============== HELPER FUNCTIONS ==============

function getNodeText(node: NodeInfo): string {
  if (node.type === 'TEXT' && node.characters) {
    return node.characters;
  }
  if (node.children) {
    return node.children
      .filter(c => c.type === 'TEXT')
      .map(c => c.characters || '')
      .join(' ');
  }
  return '';
}

function hasText(node: NodeInfo, patterns: RegExp[]): boolean {
  const text = getNodeText(node).toLowerCase();
  return patterns.some(p => p.test(text));
}

function isClickableSize(node: NodeInfo): boolean {
  const w = node.width || 0;
  const h = node.height || 0;
  return w >= 44 && h >= 32 && w <= 400 && h <= 80;
}

function hasChildren(node: NodeInfo): boolean {
  return Array.isArray(node.children) && node.children.length > 0;
}

function countChildren(node: NodeInfo): number {
  return node.children?.length || 0;
}

function hasRoundedCorners(node: NodeInfo): boolean {
  return typeof node.cornerRadius === 'number' && node.cornerRadius > 0;
}

function hasShadow(node: NodeInfo): boolean {
  return Array.isArray(node.effects) && node.effects.some((e: any) => e.type === 'DROP_SHADOW');
}

// ============== COMPONENT PATTERNS ==============

export interface ComponentClassification {
  type: string;
  subtype?: string;
  meaning: string;
  confidence: number;
  dataCollected?: string;
}

export function classifyComponent(node: NodeInfo): ComponentClassification | null {
  const name = node.name.toLowerCase();
  const text = getNodeText(node).toLowerCase();

  // ============== BUTTONS ==============
  if (isButton(node, name, text)) {
    return classifyButton(node, name, text);
  }

  // ============== INPUTS ==============
  if (isInput(node, name)) {
    return classifyInput(node, name);
  }

  // ============== NAVIGATION ==============
  if (isNavigation(node, name)) {
    return classifyNavigation(node, name);
  }

  // ============== CARDS ==============
  if (isCard(node, name)) {
    return {
      type: 'card',
      meaning: 'Content container - groups related information',
      confidence: 0.8
    };
  }

  // ============== MODALS ==============
  if (isModal(node, name)) {
    return {
      type: 'modal',
      meaning: 'Interrupting dialog - requires user action',
      confidence: 0.85
    };
  }

  // ============== LISTS ==============
  if (isList(node, name)) {
    return {
      type: 'list',
      meaning: 'Repeated items - scrollable content',
      confidence: 0.75
    };
  }

  // ============== FEEDBACK STATES ==============
  if (isToast(node, name)) {
    return {
      type: 'toast',
      meaning: 'Temporary feedback message',
      confidence: 0.8
    };
  }

  if (isErrorState(node, name, text)) {
    return {
      type: 'error',
      meaning: 'Error state - something went wrong',
      confidence: 0.85
    };
  }

  if (isSuccessState(node, name, text)) {
    return {
      type: 'success',
      meaning: 'Success state - action completed',
      confidence: 0.85
    };
  }

  if (isLoadingState(node, name)) {
    return {
      type: 'loading',
      meaning: 'Loading state - waiting for data',
      confidence: 0.8
    };
  }

  return null;
}

// ============== BUTTON DETECTION ==============

function isButton(node: NodeInfo, name: string, text: string): boolean {
  // Name signals
  if (/button|btn|cta/i.test(name)) return true;

  // Text signals
  if (hasText(node, [/submit|continue|next|back|cancel|save|delete|confirm/i])) {
    if (isClickableSize(node)) return true;
  }

  // Structure: rectangle with text, clickable size
  if (node.type === 'FRAME' || node.type === 'INSTANCE' || node.type === 'COMPONENT') {
    if (isClickableSize(node) && hasChildren(node)) {
      const hasTextChild = node.children?.some(c => c.type === 'TEXT');
      if (hasTextChild && countChildren(node) <= 3) return true;
    }
  }

  return false;
}

function classifyButton(node: NodeInfo, name: string, text: string): ComponentClassification {
  // Primary button
  if (/primary|main|submit|continue|next|confirm|done|save/i.test(name) ||
      /primary|main|submit|continue|next|confirm|done|save/i.test(text)) {
    return {
      type: 'button',
      subtype: 'primary',
      meaning: 'Main action - advances the user forward',
      confidence: 0.9
    };
  }

  // Secondary button
  if (/secondary|cancel|back|skip|close|dismiss/i.test(name) ||
      /cancel|back|skip|close|dismiss/i.test(text)) {
    return {
      type: 'button',
      subtype: 'secondary',
      meaning: 'Alternative action - escape route or less important',
      confidence: 0.85
    };
  }

  // Destructive button
  if (/delete|remove|destroy|danger/i.test(name) ||
      /delete|remove/i.test(text)) {
    return {
      type: 'button',
      subtype: 'destructive',
      meaning: 'Dangerous action - requires confirmation',
      confidence: 0.9
    };
  }

  // Icon button (no text, small)
  if (!getNodeText(node) && node.width && node.height &&
      Math.abs(node.width - node.height) < 10 && node.width < 60) {
    return {
      type: 'button',
      subtype: 'icon',
      meaning: 'Icon-only action button',
      confidence: 0.7
    };
  }

  // Default button
  return {
    type: 'button',
    subtype: 'default',
    meaning: 'Action button',
    confidence: 0.75
  };
}

// ============== INPUT DETECTION ==============

function isInput(node: NodeInfo, name: string): boolean {
  if (/input|field|textfield|textarea|text.?box/i.test(name)) return true;

  // Shape: wide rectangle, moderate height
  if (node.width && node.height) {
    const aspectRatio = node.width / node.height;
    if (aspectRatio > 3 && node.height >= 32 && node.height <= 60) {
      if (hasRoundedCorners(node)) return true;
    }
  }

  return false;
}

function classifyInput(node: NodeInfo, name: string): ComponentClassification {
  // Email input
  if (/email|e-mail/i.test(name)) {
    return {
      type: 'input',
      subtype: 'email',
      meaning: 'Email address input',
      dataCollected: 'email_address',
      confidence: 0.95
    };
  }

  // Password input
  if (/password|pwd/i.test(name)) {
    return {
      type: 'input',
      subtype: 'password',
      meaning: 'Password input',
      dataCollected: 'password',
      confidence: 0.95
    };
  }

  // Phone input
  if (/phone|tel|mobile/i.test(name)) {
    return {
      type: 'input',
      subtype: 'phone',
      meaning: 'Phone number input',
      dataCollected: 'phone_number',
      confidence: 0.9
    };
  }

  // Name input
  if (/name|first|last/i.test(name)) {
    return {
      type: 'input',
      subtype: 'name',
      meaning: 'Name input',
      dataCollected: 'user_name',
      confidence: 0.85
    };
  }

  // Search input
  if (/search/i.test(name)) {
    return {
      type: 'input',
      subtype: 'search',
      meaning: 'Search input',
      confidence: 0.9
    };
  }

  // Textarea
  if (/textarea|message|comment|description|bio/i.test(name) ||
      (node.height && node.height > 80)) {
    return {
      type: 'input',
      subtype: 'textarea',
      meaning: 'Multi-line text input',
      dataCollected: 'text_content',
      confidence: 0.8
    };
  }

  // Default input
  return {
    type: 'input',
    subtype: 'text',
    meaning: 'Text input field',
    dataCollected: 'text_input',
    confidence: 0.7
  };
}

// ============== NAVIGATION DETECTION ==============

function isNavigation(node: NodeInfo, name: string): boolean {
  if (/nav|menu|tab|header|footer/i.test(name)) return true;
  return false;
}

function classifyNavigation(node: NodeInfo, name: string): ComponentClassification {
  // Tab bar (bottom)
  if (/tab|bottom/i.test(name)) {
    return {
      type: 'navigation',
      subtype: 'tabBar',
      meaning: 'Primary app navigation (bottom tabs)',
      confidence: 0.85
    };
  }

  // Top nav / header
  if (/header|top|nav/i.test(name)) {
    return {
      type: 'navigation',
      subtype: 'topNav',
      meaning: 'Screen header with navigation',
      confidence: 0.8
    };
  }

  // Sidebar
  if (/sidebar|side|drawer/i.test(name)) {
    return {
      type: 'navigation',
      subtype: 'sidebar',
      meaning: 'Side navigation',
      confidence: 0.85
    };
  }

  return {
    type: 'navigation',
    subtype: 'general',
    meaning: 'Navigation element',
    confidence: 0.7
  };
}

// ============== OTHER COMPONENT DETECTION ==============

function isCard(node: NodeInfo, name: string): boolean {
  if (/card/i.test(name)) return true;
  if (hasRoundedCorners(node) && hasShadow(node) && hasChildren(node)) {
    if (countChildren(node) >= 2) return true;
  }
  return false;
}

function isModal(node: NodeInfo, name: string): boolean {
  if (/modal|dialog|popup|overlay|sheet/i.test(name)) return true;
  return false;
}

function isList(node: NodeInfo, name: string): boolean {
  if (/list/i.test(name)) return true;
  // Check for repeating children
  if (hasChildren(node) && countChildren(node) >= 3) {
    const children = node.children!;
    const firstType = children[0].type;
    const allSameType = children.every(c => c.type === firstType);
    if (allSameType) return true;
  }
  return false;
}

function isToast(node: NodeInfo, name: string): boolean {
  if (/toast|snackbar|notification|alert/i.test(name)) return true;
  return false;
}

function isErrorState(node: NodeInfo, name: string, text: string): boolean {
  if (/error|invalid|fail/i.test(name)) return true;
  if (/error|invalid|failed|wrong/i.test(text)) return true;
  return false;
}

function isSuccessState(node: NodeInfo, name: string, text: string): boolean {
  if (/success|complete|done/i.test(name)) return true;
  if (/success|completed|done|congratulations/i.test(text)) return true;
  return false;
}

function isLoadingState(node: NodeInfo, name: string): boolean {
  if (/loading|spinner|skeleton|progress/i.test(name)) return true;
  return false;
}

// ============== EXPORTS ==============

export const COMPONENT_TYPES = [
  'button', 'input', 'navigation', 'card', 'modal',
  'list', 'toast', 'error', 'success', 'loading'
] as const;

export type ComponentType = typeof COMPONENT_TYPES[number];
