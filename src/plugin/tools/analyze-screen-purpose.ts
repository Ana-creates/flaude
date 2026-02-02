/**
 * Tool: analyze_screen_purpose
 * Determines what a screen is FOR using pattern matching
 */

import { classifyScreen, type ScreenClassification, type MissingElement } from '../intelligence/patterns/screen-patterns';
import { classifyComponent, type ComponentClassification } from '../intelligence/patterns/component-patterns';

export interface ScreenPurpose extends ScreenClassification {
  screenId: string;
  screenName: string;
  components: ComponentClassification[];
}

export function analyzeScreenPurpose(screenId: string): ScreenPurpose | { error: string } {
  const node = figma.getNodeById(screenId);

  if (!node) {
    return { error: `Screen with ID ${screenId} not found` };
  }

  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') {
    return { error: `Node ${screenId} is not a screen (type: ${node.type})` };
  }

  const frame = node as FrameNode;
  const components: ComponentClassification[] = [];
  const textContent: string[] = [];
  let hasBackButton = false;
  let hasPrototypeLinks = false;

  function processNode(n: SceneNode) {
    // Build node info for classification
    const nodeInfo = buildNodeInfo(n);
    const classification = classifyComponent(nodeInfo);
    if (classification) {
      components.push(classification);
    }

    // Extract text
    if (n.type === 'TEXT') {
      textContent.push((n as TextNode).characters);
    }

    // Check for back button
    const nameLower = n.name.toLowerCase();
    if (/back|return|←|arrow.?left|chevron.?left/i.test(nameLower)) {
      hasBackButton = true;
    }

    // Check for prototype links
    if ('reactions' in n) {
      const reactions = (n as SceneNode & { reactions: unknown[] }).reactions;
      if (reactions && reactions.length > 0) {
        hasPrototypeLinks = true;
      }
    }

    // Process children
    if ('children' in n) {
      for (const child of (n as FrameNode).children) {
        processNode(child);
      }
    }
  }

  for (const child of frame.children) {
    processNode(child);
  }

  // Build screen info for classification
  const screenInfo = {
    id: screenId,
    name: frame.name,
    components,
    textContent,
    hasBackButton,
    hasPrototypeLinks,
  };

  const classification = classifyScreen(screenInfo);

  return {
    screenId,
    screenName: frame.name,
    ...classification,
    components,
  };
}

interface NodeInfo {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  children?: NodeInfo[];
  characters?: string;
  cornerRadius?: number;
  effects?: unknown[];
}

function buildNodeInfo(node: SceneNode): NodeInfo {
  const info: NodeInfo = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ('width' in node) info.width = node.width;
  if ('height' in node) info.height = node.height;
  if ('characters' in node) info.characters = (node as TextNode).characters;
  if ('cornerRadius' in node) info.cornerRadius = node.cornerRadius as number;
  if ('effects' in node) info.effects = node.effects as unknown[];

  if ('children' in node) {
    info.children = (node as FrameNode).children.map(buildNodeInfo);
  }

  return info;
}
