/**
 * Tool: get_all_screens
 * Returns all screens/frames in the current Figma page
 */

export interface ScreenInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  childCount: number;
  hasPrototypeLinks: boolean;
}

export function getAllScreens(): ScreenInfo[] {
  const page = figma.currentPage;
  const frames = page.children.filter(
    node => node.type === 'FRAME' || node.type === 'COMPONENT'
  );

  return frames.map(frame => ({
    id: frame.id,
    name: frame.name,
    width: 'width' in frame ? Math.round(frame.width) : 0,
    height: 'height' in frame ? Math.round(frame.height) : 0,
    childCount: 'children' in frame ? (frame as FrameNode).children.length : 0,
    hasPrototypeLinks: hasReactions(frame as SceneNode),
  }));
}

function hasReactions(node: SceneNode): boolean {
  if ('reactions' in node) {
    const reactions = (node as SceneNode & { reactions: unknown[] }).reactions;
    if (reactions && reactions.length > 0) return true;
  }
  // Check children
  if ('children' in node) {
    for (const child of (node as FrameNode).children) {
      if (hasReactions(child)) return true;
    }
  }
  return false;
}
