/**
 * Extract design data from Figma selection
 */

import type { SelectionContext } from '../../shared/types/chat';

/**
 * Extract context from current selection
 */
export function extractSelectionContext(): SelectionContext {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return {
      count: 0,
      nodeIds: [],
      nodeTypes: [],
      nodeNames: [],
      hasPrototypeLinks: false,
      summary: 'No elements selected.',
    };
  }

  const nodeIds = selection.map(node => node.id);
  const nodeTypes = [...new Set(selection.map(node => node.type))];
  const nodeNames = selection.map(node => node.name);
  const hasPrototypeLinks = selection.some(node => hasReactions(node));

  // Build summary
  const summary = buildSelectionSummary(selection);

  return {
    count: selection.length,
    nodeIds,
    nodeTypes,
    nodeNames,
    hasPrototypeLinks,
    summary,
  };
}

/**
 * Check if a node has prototype reactions
 */
function hasReactions(node: SceneNode): boolean {
  if ('reactions' in node) {
    return (node as SceneNode & { reactions: unknown[] }).reactions.length > 0;
  }
  return false;
}

/**
 * Build a human-readable summary of the selection
 */
function buildSelectionSummary(selection: readonly SceneNode[]): string {
  const lines: string[] = [];

  for (const node of selection) {
    const info = extractNodeInfo(node);
    lines.push(info);
  }

  return lines.join('\n');
}

/**
 * Extract detailed info from a single node
 */
function extractNodeInfo(node: SceneNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const parts: string[] = [];

  // Basic info
  parts.push(`${indent}**${node.name}** (${node.type})`);

  // Dimensions if available
  if ('width' in node && 'height' in node) {
    parts.push(`${indent}  Size: ${Math.round(node.width)}x${Math.round(node.height)}`);
  }

  // Text content
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    const text = textNode.characters.slice(0, 100);
    parts.push(`${indent}  Text: "${text}${textNode.characters.length > 100 ? '...' : ''}"`);
  }

  // Children count for containers
  if ('children' in node) {
    const container = node as FrameNode | GroupNode | ComponentNode;
    parts.push(`${indent}  Children: ${container.children.length}`);

    // Count interactive elements
    const counts = countElementTypes(container);
    if (counts.buttons > 0) parts.push(`${indent}  Buttons: ${counts.buttons}`);
    if (counts.inputs > 0) parts.push(`${indent}  Inputs: ${counts.inputs}`);
    if (counts.texts > 0) parts.push(`${indent}  Text blocks: ${counts.texts}`);
    if (counts.images > 0) parts.push(`${indent}  Images: ${counts.images}`);
  }

  return parts.join('\n');
}

interface ElementCounts {
  buttons: number;
  inputs: number;
  texts: number;
  images: number;
}

/**
 * Count different element types in a container
 */
function countElementTypes(node: SceneNode): ElementCounts {
  const counts: ElementCounts = { buttons: 0, inputs: 0, texts: 0, images: 0 };

  function traverse(n: SceneNode) {
    // Detect buttons (common naming patterns)
    const nameLower = n.name.toLowerCase();
    if (
      nameLower.includes('button') ||
      nameLower.includes('btn') ||
      nameLower.includes('cta')
    ) {
      counts.buttons++;
    }

    // Detect inputs
    if (
      nameLower.includes('input') ||
      nameLower.includes('field') ||
      nameLower.includes('textbox') ||
      nameLower.includes('textarea')
    ) {
      counts.inputs++;
    }

    // Count text nodes
    if (n.type === 'TEXT') {
      counts.texts++;
    }

    // Count images (rectangles with image fills or image nodes)
    if (n.type === 'RECTANGLE' && 'fills' in n) {
      const fills = n.fills as readonly Paint[];
      if (Array.isArray(fills) && fills.some(f => f.type === 'IMAGE')) {
        counts.images++;
      }
    }

    // Traverse children
    if ('children' in n) {
      for (const child of (n as FrameNode).children) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return counts;
}

/**
 * Extract all screens (top-level frames) from current page
 */
export function extractAllScreens(): Array<{
  id: string;
  name: string;
  width: number;
  height: number;
  childCount: number;
}> {
  const frames = figma.currentPage.children.filter(
    node => node.type === 'FRAME' || node.type === 'COMPONENT'
  );

  return frames.map(frame => ({
    id: frame.id,
    name: frame.name,
    width: 'width' in frame ? Math.round(frame.width) : 0,
    height: 'height' in frame ? Math.round(frame.height) : 0,
    childCount: 'children' in frame ? (frame as FrameNode).children.length : 0,
  }));
}
