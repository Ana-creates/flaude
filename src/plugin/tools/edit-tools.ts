/**
 * Edit Tools - Create and modify Figma nodes
 *
 * These tools enable the MCP server to actually CREATE and EDIT
 * content in Figma, not just read it.
 */

// Re-export HTML import functionality
export { importHTML } from './html-parser';

// Re-export design analyzer tools
export { studyFrame, auditComponents, getTextConstraints, prepareToDesign, getDesignRules } from './design-analyzer';

interface Color {
  r: number;
  g: number;
  b: number;
}

interface Position {
  x?: number;
  y?: number;
}

// ============= READ TOOLS =============

export function getFileStructure() {
  const pages = figma.root.children.map(page => ({
    id: page.id,
    name: page.name,
    frames: page.findChildren(node => node.type === 'FRAME' && node.parent === page).map(frame => ({
      id: frame.id,
      name: frame.name,
      type: frame.type,
      width: (frame as FrameNode).width,
      height: (frame as FrameNode).height,
    })),
  }));

  return {
    fileName: figma.root.name,
    pageCount: pages.length,
    pages,
  };
}

export function getSelection() {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    return { selected: false, nodes: [] };
  }

  return {
    selected: true,
    count: selection.length,
    nodes: selection.map(node => ({
      id: node.id,
      name: node.name,
      type: node.type,
      ...(('width' in node) && { width: node.width }),
      ...(('height' in node) && { height: node.height }),
      ...(('x' in node) && { x: node.x }),
      ...(('y' in node) && { y: node.y }),
    })),
  };
}

export function getNodeDetails(nodeId: string) {
  const node = figma.getNodeById(nodeId);

  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const details: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if ('width' in node) details.width = node.width;
  if ('height' in node) details.height = node.height;
  if ('x' in node) details.x = node.x;
  if ('y' in node) details.y = node.y;
  if ('opacity' in node) details.opacity = node.opacity;
  if ('visible' in node) details.visible = node.visible;

  // TEXT NODE DETAILS (enhanced)
  if (node.type === 'TEXT') {
    const textNode = node as TextNode;
    const fontName = textNode.fontName;

    details.characters = textNode.characters;
    details.fontSize = textNode.fontSize;
    details.fontName = textNode.fontName;

    // Text alignment info
    details.textAlignHorizontal = textNode.textAlignHorizontal;
    details.textAlignVertical = textNode.textAlignVertical;
    details.textAutoResize = textNode.textAutoResize;

    // Line height and letter spacing
    details.lineHeight = textNode.lineHeight;
    details.letterSpacing = textNode.letterSpacing;

    // Overflow detection
    // If textAutoResize is NONE, text might be clipped
    if (textNode.textAutoResize === 'NONE') {
      // Estimate if text might overflow (heuristic)
      const fontSize = typeof textNode.fontSize === 'number' ? textNode.fontSize : 16;
      const estimatedLines = textNode.characters.split('\n').length;
      const estimatedHeight = estimatedLines * fontSize * 1.4; // rough line height
      details.possibleOverflow = estimatedHeight > textNode.height;
      details.overflowWarning = estimatedHeight > textNode.height
        ? `Text may overflow: ~${Math.round(estimatedHeight)}px content in ${Math.round(textNode.height)}px container`
        : null;
    }

    // Font info
    details.fontFamily = fontName !== figma.mixed ? fontName.family : 'mixed';
    details.fontStyle = fontName !== figma.mixed ? fontName.style : 'mixed';
  }

  // FRAME/GROUP LAYOUT DETAILS (enhanced)
  if ('layoutMode' in node) {
    const frameNode = node as FrameNode;

    // Auto-layout info
    details.hasAutoLayout = frameNode.layoutMode !== 'NONE';
    details.autoLayout = {
      mode: frameNode.layoutMode,
      spacing: frameNode.itemSpacing,
      padding: {
        top: frameNode.paddingTop,
        right: frameNode.paddingRight,
        bottom: frameNode.paddingBottom,
        left: frameNode.paddingLeft,
      },
      primaryAxisSizing: frameNode.primaryAxisSizingMode,
      counterAxisSizing: frameNode.counterAxisSizingMode,
      primaryAxisAlign: frameNode.primaryAxisAlignItems,
      counterAxisAlign: frameNode.counterAxisAlignItems,
    };

    // Constraints
    if ('constraints' in frameNode) {
      details.constraints = frameNode.constraints;
    }

    // Clipping
    details.clipsContent = frameNode.clipsContent;
  }

  // FILLS INFO
  if ('fills' in node) {
    const fillsNode = node as GeometryMixin;
    const fills = fillsNode.fills;
    if (fills && fills !== figma.mixed && Array.isArray(fills)) {
      details.fillCount = fills.length;
      details.fillTypes = fills.map(f => f.type);
      details.hasImageFill = fills.some(f => f.type === 'IMAGE');
    }
  }

  // CONSTRAINTS (for non-frame nodes too)
  if ('constraints' in node && !('layoutMode' in node)) {
    details.constraints = (node as ConstraintMixin).constraints;
  }

  // CHILDREN
  if ('children' in node) {
    details.childCount = (node as ChildrenMixin).children.length;
    details.children = (node as ChildrenMixin).children.slice(0, 20).map(child => ({
      id: child.id,
      name: child.name,
      type: child.type,
      ...(('x' in child) && { x: child.x }),
      ...(('y' in child) && { y: child.y }),
      ...(('width' in child) && { width: child.width }),
      ...(('height' in child) && { height: child.height }),
    }));
  }

  return details;
}

export function searchNodes(pattern: string, nodeType?: string) {
  const regex = new RegExp(pattern, 'i');
  const results: Array<{ id: string; name: string; type: string; path: string }> = [];

  function search(node: SceneNode, path: string) {
    const currentPath = path ? `${path} > ${node.name}` : node.name;

    if (regex.test(node.name)) {
      if (!nodeType || node.type === nodeType) {
        results.push({
          id: node.id,
          name: node.name,
          type: node.type,
          path: currentPath,
        });
      }
    }

    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        search(child as SceneNode, currentPath);
      }
    }
  }

  for (const child of figma.currentPage.children) {
    search(child, '');
  }

  return {
    pattern,
    nodeType: nodeType || 'any',
    count: results.length,
    results: results.slice(0, 50), // Limit results
  };
}

/**
 * Get ALL text nodes in a frame (deep recursive scan)
 * This ensures we never miss nested text in groups or components
 */
export function getAllTextNodes(params: { nodeId: string }) {
  const node = figma.getNodeById(params.nodeId);

  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }

  interface TextNodeInfo {
    id: string;
    name: string;
    path: string;
    content: string;
    fontSize: number | typeof figma.mixed;
    fontFamily: string;
    fontStyle: string;
    x: number;
    y: number;
    width: number;
    height: number;
    textAutoResize: string;
    textAlignHorizontal: string;
    textAlignVertical: string;
    isOverflowing: boolean;
    parentId: string | undefined;
    parentName: string | undefined;
  }

  const textNodes: TextNodeInfo[] = [];

  function scan(scanNode: BaseNode, path: string) {
    const currentPath = path ? `${path} > ${scanNode.name}` : scanNode.name;

    if (scanNode.type === 'TEXT') {
      const textNode = scanNode as TextNode;
      const fontName = textNode.fontName;

      // Check for text overflow (content exceeds container)
      // This is a heuristic - if textAutoResize is NONE and text might be clipped
      const isOverflowing = textNode.textAutoResize === 'NONE' &&
        (textNode.width < 10 || textNode.height < (typeof textNode.fontSize === 'number' ? textNode.fontSize : 12));

      textNodes.push({
        id: textNode.id,
        name: textNode.name,
        path: currentPath,
        content: textNode.characters,
        fontSize: textNode.fontSize,
        fontFamily: fontName !== figma.mixed ? fontName.family : 'mixed',
        fontStyle: fontName !== figma.mixed ? fontName.style : 'mixed',
        x: textNode.x,
        y: textNode.y,
        width: textNode.width,
        height: textNode.height,
        textAutoResize: textNode.textAutoResize,
        textAlignHorizontal: textNode.textAlignHorizontal,
        textAlignVertical: textNode.textAlignVertical,
        isOverflowing,
        parentId: textNode.parent?.id,
        parentName: textNode.parent?.name,
      });
    }

    if ('children' in scanNode) {
      for (const child of (scanNode as ChildrenMixin).children) {
        scan(child, currentPath);
      }
    }
  }

  scan(node, '');

  return {
    nodeId: params.nodeId,
    nodeName: node.name,
    textNodeCount: textNodes.length,
    textNodes,
  };
}

/**
 * Export a frame as base64 PNG for preview
 * This allows Claude to "see" the result of changes
 */
export async function exportFramePreview(params: {
  nodeId: string;
  scale?: number;
  format?: 'PNG' | 'JPG' | 'SVG';
}) {
  const node = figma.getNodeById(params.nodeId);

  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }

  if (!('exportAsync' in node)) {
    throw new Error(`Node cannot be exported: ${params.nodeId}`);
  }

  const exportNode = node as SceneNode;
  const scale = params.scale || 0.5; // Default to 50% scale for smaller file size
  const format = params.format || 'PNG';

  let settings: ExportSettings;
  if (format === 'SVG') {
    settings = { format: 'SVG' };
  } else {
    settings = {
      format: format as 'PNG' | 'JPG',
      constraint: { type: 'SCALE', value: scale },
    };
  }

  const bytes = await exportNode.exportAsync(settings);

  // Convert to base64
  const base64 = figma.base64Encode(bytes);

  return {
    nodeId: params.nodeId,
    nodeName: node.name,
    format,
    scale,
    width: 'width' in exportNode ? exportNode.width * scale : undefined,
    height: 'height' in exportNode ? exportNode.height * scale : undefined,
    base64,
    dataUrl: `data:image/${format.toLowerCase()};base64,${base64}`,
  };
}

/**
 * Check layout consistency within a frame
 * Analyzes spacing, alignment patterns, and flags inconsistencies
 */
export function checkLayoutConsistency(params: { nodeId: string }) {
  const node = figma.getNodeById(params.nodeId);

  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }

  if (!('children' in node)) {
    throw new Error(`Node has no children to analyze: ${params.nodeId}`);
  }

  const parent = node as FrameNode;
  const children = parent.children.filter(c => 'x' in c) as SceneNode[];

  // Analyze auto-layout
  const hasAutoLayout = 'layoutMode' in parent && parent.layoutMode !== 'NONE';
  const autoLayoutInfo = hasAutoLayout ? {
    mode: (parent as FrameNode).layoutMode,
    spacing: (parent as FrameNode).itemSpacing,
    paddingTop: (parent as FrameNode).paddingTop,
    paddingRight: (parent as FrameNode).paddingRight,
    paddingBottom: (parent as FrameNode).paddingBottom,
    paddingLeft: (parent as FrameNode).paddingLeft,
    primaryAxisSizing: (parent as FrameNode).primaryAxisSizingMode,
    counterAxisSizing: (parent as FrameNode).counterAxisSizingMode,
  } : null;

  // Analyze spacing patterns between children
  const spacings: number[] = [];
  const xPositions: number[] = [];
  const yPositions: number[] = [];

  for (let i = 0; i < children.length; i++) {
    xPositions.push(children[i].x);
    yPositions.push(children[i].y);

    if (i > 0) {
      // Vertical spacing
      const vGap = children[i].y - (children[i - 1].y + ('height' in children[i - 1] ? (children[i - 1] as any).height : 0));
      if (vGap > 0) spacings.push(vGap);

      // Horizontal spacing
      const hGap = children[i].x - (children[i - 1].x + ('width' in children[i - 1] ? (children[i - 1] as any).width : 0));
      if (hGap > 0) spacings.push(hGap);
    }
  }

  // Find common spacing values
  const spacingCounts: Record<number, number> = {};
  for (const s of spacings) {
    const rounded = Math.round(s);
    spacingCounts[rounded] = (spacingCounts[rounded] || 0) + 1;
  }

  // Identify inconsistent spacings
  const mostCommonSpacing = Object.entries(spacingCounts)
    .sort((a, b) => b[1] - a[1])[0];
  const inconsistentSpacings = spacings.filter(s =>
    mostCommonSpacing && Math.abs(s - parseInt(mostCommonSpacing[0])) > 2
  );

  // Check alignment (are elements aligned to common x or y positions?)
  const xAlignmentGroups: Record<number, number> = {};
  const yAlignmentGroups: Record<number, number> = {};

  for (const x of xPositions) {
    const rounded = Math.round(x);
    xAlignmentGroups[rounded] = (xAlignmentGroups[rounded] || 0) + 1;
  }

  for (const y of yPositions) {
    const rounded = Math.round(y);
    yAlignmentGroups[rounded] = (yAlignmentGroups[rounded] || 0) + 1;
  }

  // Find misaligned elements
  const commonXPositions = Object.entries(xAlignmentGroups)
    .filter(([_, count]) => count >= 2)
    .map(([x]) => parseInt(x));

  const misalignedChildren = children.filter(child => {
    if (commonXPositions.length === 0) return false;
    const nearestX = commonXPositions.reduce((nearest, x) =>
      Math.abs(x - child.x) < Math.abs(nearest - child.x) ? x : nearest
    );
    return Math.abs(child.x - nearestX) > 2 && Math.abs(child.x - nearestX) < 20;
  }).map(c => ({ id: c.id, name: c.name, x: c.x, y: c.y }));

  return {
    nodeId: params.nodeId,
    nodeName: node.name,
    childCount: children.length,
    hasAutoLayout,
    autoLayout: autoLayoutInfo,
    spacingAnalysis: {
      uniqueSpacings: [...new Set(spacings.map(s => Math.round(s)))],
      mostCommonSpacing: mostCommonSpacing ? parseInt(mostCommonSpacing[0]) : null,
      inconsistentCount: inconsistentSpacings.length,
    },
    alignmentAnalysis: {
      commonXPositions,
      commonYPositions: Object.entries(yAlignmentGroups)
        .filter(([_, count]) => count >= 2)
        .map(([y]) => parseInt(y)),
      misalignedChildren,
    },
    recommendations: [
      ...(inconsistentSpacings.length > 0 ? [`${inconsistentSpacings.length} elements have inconsistent spacing`] : []),
      ...(misalignedChildren.length > 0 ? [`${misalignedChildren.length} elements appear slightly misaligned`] : []),
      ...(!hasAutoLayout && children.length > 3 ? ['Consider using auto-layout for consistent spacing'] : []),
    ],
  };
}

// ============= WRITE TOOLS =============

export async function createFrame(params: {
  name: string;
  parentId?: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  fillColor?: Color;
}) {
  const frame = figma.createFrame();
  frame.name = params.name;
  frame.resize(params.width, params.height);

  if (params.x !== undefined) frame.x = params.x;
  if (params.y !== undefined) frame.y = params.y;

  if (params.fillColor) {
    frame.fills = [{
      type: 'SOLID',
      color: params.fillColor,
    }];
  }

  // Add to parent if specified
  if (params.parentId) {
    const parent = figma.getNodeById(params.parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(frame);
    }
  }

  return {
    created: true,
    id: frame.id,
    name: frame.name,
    type: frame.type,
  };
}

export async function createText(params: {
  content: string;
  parentId: string;
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fontWeight?: string; // Legacy - maps to fontStyle
  width?: number; // Fixed width for text box (enables wrapping)
  textAutoResize?: 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE' | 'TRUNCATE';
  fillColor?: Color;
  maxWidth?: number; // Optional: constrain text width (for warnings)
}) {
  const warnings: string[] = [];

  // Determine font family and style
  const fontFamily = params.fontFamily || 'Inter';
  const fontStyle = params.fontStyle || params.fontWeight || 'Regular';

  // Try to load the requested font, fall back to Inter if not available
  try {
    await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
  } catch (e) {
    warnings.push(`Font "${fontFamily}" with style "${fontStyle}" not available, using Inter`);
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  }

  const text = figma.createText();

  // Set font first (before setting characters)
  try {
    text.fontName = { family: fontFamily, style: fontStyle };
  } catch (e) {
    text.fontName = { family: 'Inter', style: 'Regular' };
  }

  text.characters = params.content;

  if (params.fontSize) {
    text.fontSize = params.fontSize;
  }

  // Handle text sizing and wrapping
  // If width is specified, set fixed width and enable height auto-resize for wrapping
  if (params.width !== undefined) {
    // Set textAutoResize to HEIGHT for wrapping, unless explicitly specified otherwise
    const resizeMode = params.textAutoResize || 'HEIGHT';
    text.textAutoResize = resizeMode;
    text.resize(params.width, text.height);
  } else if (params.textAutoResize) {
    text.textAutoResize = params.textAutoResize;
  }

  if (params.x !== undefined) text.x = params.x;
  if (params.y !== undefined) text.y = params.y;

  if (params.fillColor) {
    text.fills = [{
      type: 'SOLID',
      color: params.fillColor,
    }];
  }

  // Add to parent and calculate smart widths
  const parent = figma.getNodeById(params.parentId);
  let parentWidth = 0;
  let parentPaddingRight = 0;

  if (parent && 'appendChild' in parent) {
    (parent as FrameNode).appendChild(text);
    if ('width' in parent) {
      parentWidth = (parent as FrameNode).width;
    }
    // Get padding if parent has auto-layout
    if ('paddingRight' in parent) {
      parentPaddingRight = (parent as FrameNode).paddingRight || 0;
    }
  }

  // Calculate recommended width based on parent
  const textX = params.x || 0;
  const recommendedWidth = parentWidth > 0
    ? Math.max(parentWidth - textX - parentPaddingRight - 20, 100) // Leave 20px margin
    : null;

  // AUTO-APPLY width if text is long and no width specified
  if (!params.width && params.content.length > 40 && recommendedWidth && text.width > recommendedWidth) {
    // Automatically constrain long text to fit parent
    text.textAutoResize = 'HEIGHT';
    text.resize(recommendedWidth, text.height);
    warnings.push(`✅ AUTO-WRAPPED: Text was ${Math.round(text.width)}px wide, auto-constrained to ${Math.round(recommendedWidth)}px to fit parent.`);
  }

  // AUTO-CHECK: Overflow detection (only if no fixed width set and not auto-wrapped)
  if (!params.width && text.textAutoResize !== 'HEIGHT') {
    const textWidth = text.width;
    const availableWidth = params.maxWidth || recommendedWidth || 0;

    if (availableWidth > 0 && textWidth > availableWidth) {
      warnings.push(`⚠️ TEXT OVERFLOW: Text is ${Math.round(textWidth)}px wide but container allows ~${Math.round(availableWidth)}px. Consider: 1) Shorter text, 2) Smaller font, 3) Set width: ${Math.round(availableWidth)} to enable wrapping`);
    }
  }

  return {
    created: true,
    id: text.id,
    name: text.name,
    type: text.type,
    content: text.characters,
    fontFamily: (text.fontName as FontName).family,
    fontStyle: (text.fontName as FontName).style,
    textAutoResize: text.textAutoResize,
    dimensions: { width: Math.round(text.width), height: Math.round(text.height) },
    recommendedWidth: recommendedWidth ? Math.round(recommendedWidth) : undefined,
    parentInfo: parentWidth > 0 ? {
      width: Math.round(parentWidth),
      availableTextWidth: recommendedWidth ? Math.round(recommendedWidth) : undefined,
    } : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function createRectangle(params: {
  parentId: string;
  x?: number;
  y?: number;
  width: number;
  height: number;
  cornerRadius?: number;
  fillColor?: Color;
  copyFillsFrom?: string; // NEW: Copy fills (including images) from another node
}) {
  const rect = figma.createRectangle();
  rect.resize(params.width, params.height);

  if (params.x !== undefined) rect.x = params.x;
  if (params.y !== undefined) rect.y = params.y;

  if (params.cornerRadius) {
    rect.cornerRadius = params.cornerRadius;
  }

  // Copy fills from another node (preserves image fills)
  if (params.copyFillsFrom) {
    const sourceNode = figma.getNodeById(params.copyFillsFrom);
    if (sourceNode && 'fills' in sourceNode) {
      const fills = (sourceNode as GeometryMixin).fills;
      if (fills && fills !== figma.mixed) {
        rect.fills = JSON.parse(JSON.stringify(fills));
      }
    }
  } else if (params.fillColor) {
    rect.fills = [{
      type: 'SOLID',
      color: params.fillColor,
    }];
  }

  // Add to parent
  const parent = figma.getNodeById(params.parentId);
  if (parent && 'appendChild' in parent) {
    (parent as FrameNode).appendChild(rect);
  }

  return {
    created: true,
    id: rect.id,
    type: rect.type,
    hasFills: Array.isArray(rect.fills) && rect.fills.length > 0,
  };
}

export function duplicateNode(params: {
  nodeId: string;
  newName?: string;
  offsetX?: number;
  offsetY?: number;
  targetParentId?: string; // NEW: Move clone to a different parent
}) {
  const node = figma.getNodeById(params.nodeId);

  if (!node || !('clone' in node)) {
    throw new Error(`Node not found or cannot be cloned: ${params.nodeId}`);
  }

  const clone = (node as SceneNode).clone();

  if (params.newName) {
    clone.name = params.newName;
  }

  // Move to target parent if specified
  if (params.targetParentId) {
    const targetParent = figma.getNodeById(params.targetParentId);
    if (targetParent && 'appendChild' in targetParent) {
      (targetParent as FrameNode).appendChild(clone);
    }
  }

  if (params.offsetX !== undefined && 'x' in clone) {
    clone.x += params.offsetX;
  }

  if (params.offsetY !== undefined && 'y' in clone) {
    clone.y += params.offsetY;
  }

  return {
    duplicated: true,
    originalId: params.nodeId,
    newId: clone.id,
    name: clone.name,
    parentId: clone.parent?.id,
  };
}

export function moveNode(params: {
  nodeId: string;
  targetParentId: string;
  x?: number;
  y?: number;
}) {
  const node = figma.getNodeById(params.nodeId);

  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }

  const targetParent = figma.getNodeById(params.targetParentId);

  if (!targetParent || !('appendChild' in targetParent)) {
    throw new Error(`Target parent not found or cannot have children: ${params.targetParentId}`);
  }

  const oldParentId = node.parent?.id;
  (targetParent as FrameNode).appendChild(node as SceneNode);

  // Set position if specified
  if (params.x !== undefined && 'x' in node) {
    (node as SceneNode).x = params.x;
  }

  if (params.y !== undefined && 'y' in node) {
    (node as SceneNode).y = params.y;
  }

  return {
    moved: true,
    nodeId: params.nodeId,
    oldParentId,
    newParentId: params.targetParentId,
    position: { x: (node as SceneNode).x, y: (node as SceneNode).y },
  };
}

export function modifyNode(params: {
  nodeId: string;
  properties: Record<string, unknown>;
}) {
  const node = figma.getNodeById(params.nodeId);

  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }

  const modified: string[] = [];

  for (const [key, value] of Object.entries(params.properties)) {
    if (key in node) {
      try {
        (node as any)[key] = value;
        modified.push(key);
      } catch (e) {
        console.warn(`Could not set ${key}:`, e);
      }
    }
  }

  return {
    modified: true,
    nodeId: params.nodeId,
    propertiesModified: modified,
  };
}

/**
 * Resize a node using Figma's resize() method
 * This works for frames, rectangles, groups, and other resizable nodes
 */
export function resizeNode(params: {
  nodeId: string;
  width?: number;
  height?: number;
}) {
  const node = figma.getNodeById(params.nodeId);

  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }

  if (!('resize' in node)) {
    throw new Error(`Node cannot be resized: ${params.nodeId} (type: ${node.type})`);
  }

  const resizableNode = node as SceneNode & { resize: (width: number, height: number) => void };
  const originalWidth = 'width' in resizableNode ? resizableNode.width : 0;
  const originalHeight = 'height' in resizableNode ? resizableNode.height : 0;

  // Use provided dimensions or keep original
  const newWidth = params.width ?? originalWidth;
  const newHeight = params.height ?? originalHeight;

  resizableNode.resize(newWidth, newHeight);

  return {
    resized: true,
    nodeId: params.nodeId,
    nodeName: node.name,
    nodeType: node.type,
    originalDimensions: { width: Math.round(originalWidth), height: Math.round(originalHeight) },
    newDimensions: { width: Math.round(newWidth), height: Math.round(newHeight) },
  };
}

export async function updateText(params: {
  nodeId: string;
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  fontWeight?: string; // Legacy - maps to fontStyle
  width?: number; // Set a new fixed width for text box
  textAutoResize?: 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE' | 'TRUNCATE';
  fillColor?: Color;
  preserveSingleLine?: boolean; // NEW: Explicitly preserve single-line behavior
}) {
  const warnings: string[] = [];
  const node = figma.getNodeById(params.nodeId);

  if (!node || node.type !== 'TEXT') {
    throw new Error(`Text node not found: ${params.nodeId}`);
  }

  const textNode = node as TextNode;
  const currentFont = textNode.fontName as FontName;

  // Store original dimensions for comparison
  const originalWidth = textNode.width;
  const originalHeight = textNode.height;
  const originalFontSize = typeof textNode.fontSize === 'number' ? textNode.fontSize : 16;

  // Detect if text was originally single-line
  // Single-line text typically has height close to fontSize * ~1.2-1.5
  const wasOriginallyOneLine = originalHeight < (originalFontSize * 1.8);

  // Determine target font
  const targetFamily = params.fontFamily || currentFont.family;
  const targetStyle = params.fontStyle || params.fontWeight || currentFont.style;

  // Load font if changing content, font family, style, or if we need to resize
  if (params.content || params.fontFamily || params.fontStyle || params.fontWeight || params.width !== undefined || params.textAutoResize) {
    try {
      await figma.loadFontAsync({ family: targetFamily, style: targetStyle });
      textNode.fontName = { family: targetFamily, style: targetStyle };
    } catch (e) {
      warnings.push(`Font "${targetFamily}" with style "${targetStyle}" not available`);
      // Try loading current font at least
      await figma.loadFontAsync({ family: currentFont.family, style: currentFont.style });
    }

    if (params.content) {
      textNode.characters = params.content;
    }
  }

  if (params.fontSize) {
    // Need to load font before changing fontSize if not already loaded
    try {
      await figma.loadFontAsync({ family: targetFamily, style: targetStyle });
    } catch (e) {
      await figma.loadFontAsync({ family: currentFont.family, style: currentFont.style });
    }
    textNode.fontSize = params.fontSize;
  }

  // Handle text sizing - THIS IS THE KEY FIX
  // If width is specified, set the text box to that width and enable wrapping
  if (params.width !== undefined) {
    // Set textAutoResize to HEIGHT for wrapping, unless explicitly specified
    const resizeMode = params.textAutoResize || 'HEIGHT';
    textNode.textAutoResize = resizeMode;
    textNode.resize(params.width, textNode.height);
  } else if (params.textAutoResize) {
    textNode.textAutoResize = params.textAutoResize;
    // If switching to WIDTH_AND_HEIGHT, the text will auto-fit its content
  }

  if (params.fillColor) {
    textNode.fills = [{
      type: 'SOLID',
      color: params.fillColor,
    }];
  }

  // AUTO-CHECK: Dimension changes and overflow
  const newWidth = textNode.width;
  const newHeight = textNode.height;
  const widthChange = newWidth - originalWidth;
  const heightChange = newHeight - originalHeight;

  // Check if text grew significantly (only warn if no explicit width was set)
  if (!params.width && widthChange > 20) {
    warnings.push(`⚠️ WIDTH INCREASED: Text grew ${Math.round(widthChange)}px wider (${Math.round(originalWidth)}px → ${Math.round(newWidth)}px)`);
  }

  if (heightChange > 10) {
    warnings.push(`⚠️ HEIGHT INCREASED: Text grew ${Math.round(heightChange)}px taller (${Math.round(originalHeight)}px → ${Math.round(newHeight)}px)`);
  }

  // Check if text is in a fixed container and might overflow (only if no explicit width set)
  if (!params.width) {
    const parent = textNode.parent;
    if (parent && 'width' in parent) {
      const parentFrame = parent as FrameNode;
      const textRightEdge = textNode.x + newWidth;
      const parentRightEdge = parentFrame.width;

      if (textRightEdge > parentRightEdge - 10) {
        warnings.push(`⚠️ POSSIBLE OVERFLOW: Text may extend beyond parent frame. Text ends at ${Math.round(textRightEdge)}px, parent is ${Math.round(parentRightEdge)}px wide.`);
      }
    }
  }

  // Calculate recommended width from parent
  const parent = textNode.parent;
  let recommendedWidth: number | null = null;

  if (parent && 'width' in parent) {
    const parentFrame = parent as FrameNode;
    const paddingRight = 'paddingRight' in parentFrame ? (parentFrame.paddingRight || 0) : 0;
    recommendedWidth = Math.max(parentFrame.width - textNode.x - paddingRight - 20, 100);
  }

  // AUTO-FIX: If text overflows and we can calculate a good width, auto-apply it
  if (!params.width && recommendedWidth && newWidth > recommendedWidth && params.content) {
    textNode.textAutoResize = 'HEIGHT';
    textNode.resize(recommendedWidth, textNode.height);
    warnings.push(`✅ AUTO-FIXED: Text was overflowing (${Math.round(newWidth)}px), auto-constrained to ${Math.round(recommendedWidth)}px.`);
  }

  // SINGLE-LINE PRESERVATION: If text was originally single-line and now wrapped, expand width instead
  const newHeightAfterFixes = textNode.height;
  const preserveSingleLine = params.preserveSingleLine !== false; // Default to true

  if (preserveSingleLine && wasOriginallyOneLine && !params.width && !params.textAutoResize) {
    // Check if text wrapped (height increased significantly)
    const heightIncreasedSignificantly = newHeightAfterFixes > (originalFontSize * 1.8);

    if (heightIncreasedSignificantly) {
      // Text wrapped when it shouldn't have - expand width to keep single-line
      textNode.textAutoResize = 'WIDTH_AND_HEIGHT';
      warnings.push(`✅ SINGLE-LINE PRESERVED: Text was wrapping to ${Math.round(newHeightAfterFixes)}px height. Switched to WIDTH_AND_HEIGHT to keep it on one line (now ${Math.round(textNode.width)}px wide).`);
    }
  }

  // Check textAutoResize mode
  if (textNode.textAutoResize === 'NONE' && (widthChange > 0 || heightChange > 0) && !params.width) {
    warnings.push(`💡 TIP: Text has fixed size (textAutoResize: NONE). New content may be clipped. Consider using width: ${recommendedWidth ? Math.round(recommendedWidth) : 'auto'} to resize.`);
  }

  return {
    updated: true,
    nodeId: params.nodeId,
    newContent: textNode.characters,
    fontFamily: (textNode.fontName as FontName).family,
    fontStyle: (textNode.fontName as FontName).style,
    textAutoResize: textNode.textAutoResize,
    dimensions: {
      width: Math.round(textNode.width),
      height: Math.round(textNode.height),
      widthChange: Math.round(textNode.width - originalWidth),
      heightChange: Math.round(textNode.height - originalHeight),
    },
    recommendedWidth: recommendedWidth ? Math.round(recommendedWidth) : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function deleteNode(params: { nodeId: string }) {
  const node = figma.getNodeById(params.nodeId);

  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }

  const name = node.name;
  node.remove();

  return {
    deleted: true,
    nodeId: params.nodeId,
    name,
  };
}

export function groupNodes(params: {
  nodeIds: string[];
  groupName?: string;
}) {
  const nodes: SceneNode[] = [];

  for (const id of params.nodeIds) {
    const node = figma.getNodeById(id);
    if (node && 'parent' in node) {
      nodes.push(node as SceneNode);
    }
  }

  if (nodes.length === 0) {
    throw new Error('No valid nodes to group');
  }

  const group = figma.group(nodes, nodes[0].parent as ChildrenMixin & BaseNode);

  if (params.groupName) {
    group.name = params.groupName;
  }

  return {
    grouped: true,
    groupId: group.id,
    groupName: group.name,
    nodeCount: nodes.length,
  };
}

// ============= SCHEMA-AWARE TOOLS =============

export async function createScreenFromState(params: {
  stateName: string;
  screenType?: string;
  baseFrameId?: string;
  position?: Position;
  stateContent?: {
    hero?: string;
    subtext?: string;
    tone?: string;
  };
}) {
  let frame: FrameNode;

  if (params.baseFrameId) {
    // Duplicate existing frame
    const baseNode = figma.getNodeById(params.baseFrameId);
    if (!baseNode || baseNode.type !== 'FRAME') {
      throw new Error(`Base frame not found: ${params.baseFrameId}`);
    }
    frame = (baseNode as FrameNode).clone();
  } else {
    // Create new frame (mobile size by default)
    frame = figma.createFrame();
    frame.resize(375, 812);
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  }

  // Name the frame
  const screenType = params.screenType || 'Screen';
  frame.name = `${screenType} - ${params.stateName}`;

  // Position it
  if (params.position) {
    if (params.position.x !== undefined) frame.x = params.position.x;
    if (params.position.y !== undefined) frame.y = params.position.y;
  }

  // If state content provided, try to update text nodes
  if (params.stateContent) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

    // Find and update hero text (first large text)
    if (params.stateContent.hero) {
      const heroText = frame.findOne(n => {
        if (n.type !== 'TEXT') return false;
        const fontSize = (n as TextNode).fontSize;
        return typeof fontSize === 'number' && fontSize >= 24;
      }) as TextNode | null;

      if (heroText) {
        heroText.characters = params.stateContent.hero;
      } else {
        // Create hero text
        const text = figma.createText();
        text.characters = params.stateContent.hero;
        text.fontSize = 28;
        text.fontName = { family: 'Inter', style: 'Bold' };
        text.x = 24;
        text.y = 120;
        frame.appendChild(text);
      }
    }

    // Find and update subtext
    if (params.stateContent.subtext) {
      const subtexts = frame.findAll(n => {
        if (n.type !== 'TEXT') return false;
        const fontSize = (n as TextNode).fontSize;
        return typeof fontSize === 'number' && fontSize < 24 && fontSize >= 14;
      }) as TextNode[];

      if (subtexts.length > 0) {
        subtexts[0].characters = params.stateContent.subtext;
      } else {
        const text = figma.createText();
        text.characters = params.stateContent.subtext;
        text.fontSize = 16;
        text.fontName = { family: 'Inter', style: 'Regular' };
        text.x = 24;
        text.y = 170;
        text.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
        frame.appendChild(text);
      }
    }
  }

  return {
    created: true,
    id: frame.id,
    name: frame.name,
    state: params.stateName,
  };
}

export function validateAgainstSchema(params: {
  schemaSection?: string;
  expectedStates?: string[];
}) {
  // Get all top-level frames
  const frames = figma.currentPage.children.filter(n => n.type === 'FRAME') as FrameNode[];

  const frameNames = frames.map(f => f.name.toLowerCase());

  // If expected states provided, check against them
  if (params.expectedStates) {
    const found: string[] = [];
    const missing: string[] = [];

    for (const state of params.expectedStates) {
      const statePattern = state.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');
      const exists = frameNames.some(name =>
        name.includes(statePattern) || name.includes(state.toLowerCase())
      );

      if (exists) {
        found.push(state);
      } else {
        missing.push(state);
      }
    }

    return {
      validated: true,
      section: params.schemaSection || 'all',
      totalExpected: params.expectedStates.length,
      found,
      missing,
      coverage: `${found.length}/${params.expectedStates.length}`,
    };
  }

  // Just return what exists
  return {
    validated: true,
    section: params.schemaSection || 'all',
    existingFrames: frames.map(f => ({
      id: f.id,
      name: f.name,
    })),
    count: frames.length,
  };
}
