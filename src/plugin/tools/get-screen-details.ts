/**
 * Tool: get_screen_details
 * Returns detailed information about a specific screen
 */

export interface NodeDetail {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  text?: string;
  children?: NodeDetail[];
  fills?: string[];
  hasPrototypeLink: boolean;
}

export interface ScreenDetails {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  children: NodeDetail[];
  allText: string[];
  nodeCount: number;
  hasBackButton: boolean;
}

export function getScreenDetails(screenId: string): ScreenDetails | { error: string } {
  const node = figma.getNodeById(screenId);

  if (!node) {
    return { error: `Screen with ID ${screenId} not found` };
  }

  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') {
    return { error: `Node ${screenId} is not a screen (type: ${node.type})` };
  }

  const frame = node as FrameNode;
  const allText: string[] = [];
  let nodeCount = 0;
  let hasBackButton = false;

  function extractNode(n: SceneNode): NodeDetail {
    nodeCount++;
    const detail: NodeDetail = {
      id: n.id,
      name: n.name,
      type: n.type,
      hasPrototypeLink: false,
    };

    // Dimensions
    if ('width' in n && 'height' in n) {
      detail.width = Math.round(n.width);
      detail.height = Math.round(n.height);
    }

    // Text content
    if (n.type === 'TEXT') {
      const textNode = n as TextNode;
      detail.text = textNode.characters;
      allText.push(textNode.characters);
    }

    // Check for back button
    const nameLower = n.name.toLowerCase();
    if (/back|return|←|arrow.?left|chevron.?left/i.test(nameLower)) {
      hasBackButton = true;
    }

    // Prototype links
    if ('reactions' in n) {
      const reactions = (n as SceneNode & { reactions: unknown[] }).reactions;
      detail.hasPrototypeLink = reactions && reactions.length > 0;
    }

    // Children
    if ('children' in n) {
      const container = n as FrameNode;
      detail.children = container.children.map(extractNode);
    }

    return detail;
  }

  return {
    id: frame.id,
    name: frame.name,
    type: frame.type,
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    children: frame.children.map(extractNode),
    allText,
    nodeCount,
    hasBackButton,
  };
}
