/**
 * Tool: classify_screen_components
 * Analyzes and classifies all components on a screen
 */

import { classifyComponent, type ComponentClassification } from '../intelligence/patterns/component-patterns';

export interface ClassifiedComponent extends ComponentClassification {
  nodeId: string;
  nodeName: string;
}

export interface ScreenComponents {
  screenId: string;
  screenName: string;
  components: ClassifiedComponent[];
  summary: {
    buttons: number;
    inputs: number;
    navigation: number;
    cards: number;
    modals: number;
    lists: number;
    feedbackStates: number;
  };
  dataCollected: string[];
}

export function classifyScreenComponents(screenId: string): ScreenComponents | { error: string } {
  const node = figma.getNodeById(screenId);

  if (!node) {
    return { error: `Screen with ID ${screenId} not found` };
  }

  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') {
    return { error: `Node ${screenId} is not a screen (type: ${node.type})` };
  }

  const frame = node as FrameNode;
  const components: ClassifiedComponent[] = [];
  const dataCollected: string[] = [];
  const summary = {
    buttons: 0,
    inputs: 0,
    navigation: 0,
    cards: 0,
    modals: 0,
    lists: 0,
    feedbackStates: 0,
  };

  function processNode(n: SceneNode) {
    // Build node info for classification
    const nodeInfo = buildNodeInfo(n);
    const classification = classifyComponent(nodeInfo);

    if (classification) {
      components.push({
        ...classification,
        nodeId: n.id,
        nodeName: n.name,
      });

      // Update summary
      switch (classification.type) {
        case 'button':
          summary.buttons++;
          break;
        case 'input':
          summary.inputs++;
          if (classification.dataCollected) {
            dataCollected.push(classification.dataCollected);
          }
          break;
        case 'navigation':
          summary.navigation++;
          break;
        case 'card':
          summary.cards++;
          break;
        case 'modal':
          summary.modals++;
          break;
        case 'list':
          summary.lists++;
          break;
        case 'toast':
        case 'error':
        case 'success':
        case 'loading':
          summary.feedbackStates++;
          break;
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

  return {
    screenId,
    screenName: frame.name,
    components,
    summary,
    dataCollected: [...new Set(dataCollected)],
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
