/**
 * HTML to Figma Parser
 *
 * Converts HTML/CSS to native Figma nodes.
 * This gives Claude the ability to generate designs using HTML
 * (which it's great at) and have them appear in Figma.
 */

interface ParsedElement {
  tag: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  children: (ParsedElement | string)[];
  text?: string;
}

interface ConversionResult {
  node: SceneNode;
  warnings: string[];
}

// Simple HTML tokenizer (no DOM needed)
function tokenizeHTML(html: string): ParsedElement | null {
  if (!html || typeof html !== 'string') {
    return null;
  }

  html = html.trim();

  if (!html) {
    return null;
  }

  // Remove comments
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Parse the root element
  return parseElement(html, 0).element;
}

function parseElement(html: string, start: number): { element: ParsedElement | null; end: number } {
  const tagStart = html.indexOf('<', start);
  if (tagStart === -1) return { element: null, end: html.length };

  // Skip if it's a closing tag
  if (html[tagStart + 1] === '/') return { element: null, end: html.length };

  // Find tag name
  let i = tagStart + 1;
  while (i < html.length && /[a-zA-Z0-9]/.test(html[i])) i++;
  const tagName = html.slice(tagStart + 1, i).toLowerCase();

  if (!tagName) return { element: null, end: html.length };

  // Parse attributes
  const attributes: Record<string, string> = {};
  let styles: Record<string, string> = {};

  while (i < html.length && html[i] !== '>' && html.slice(i, i + 2) !== '/>') {
    // Skip whitespace
    while (i < html.length && /\s/.test(html[i])) i++;

    if (html[i] === '>' || html.slice(i, i + 2) === '/>') break;

    // Parse attribute name
    const attrStart = i;
    while (i < html.length && /[a-zA-Z0-9\-_]/.test(html[i])) i++;
    const attrName = html.slice(attrStart, i);

    // Skip whitespace and =
    while (i < html.length && /[\s=]/.test(html[i])) i++;

    // Parse attribute value
    let attrValue = '';
    if (html[i] === '"' || html[i] === "'") {
      const quote = html[i];
      i++;
      const valueStart = i;
      while (i < html.length && html[i] !== quote) i++;
      attrValue = html.slice(valueStart, i);
      i++; // Skip closing quote
    }

    if (attrName) {
      attributes[attrName] = attrValue;
      if (attrName === 'style') {
        styles = parseInlineStyles(attrValue);
      }
    }
  }

  // Check for self-closing tag
  const selfClosing = html.slice(i, i + 2) === '/>' ||
    ['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tagName);

  if (selfClosing) {
    i = html.indexOf('>', i) + 1;
    return {
      element: { tag: tagName, attributes, styles, children: [] },
      end: i
    };
  }

  // Skip >
  i = html.indexOf('>', i) + 1;

  // Parse children
  const children: (ParsedElement | string)[] = [];
  const closingTag = `</${tagName}>`;

  while (i < html.length) {
    const nextTagPos = html.indexOf('<', i);

    if (nextTagPos === -1) {
      // Rest is text
      const remaining = html.slice(i);
      const text = remaining ? remaining.trim() : '';
      if (text) children.push(text);
      break;
    }

    // Text before next tag
    const textSlice = html.slice(i, nextTagPos);
    const textBefore = textSlice ? textSlice.trim() : '';
    if (textBefore) children.push(textBefore);

    // Check if it's the closing tag
    if (html.slice(nextTagPos, nextTagPos + closingTag.length).toLowerCase() === closingTag) {
      i = nextTagPos + closingTag.length;
      break;
    }

    // Parse child element
    const childResult = parseElement(html, nextTagPos);
    if (childResult.element) {
      children.push(childResult.element);
    }
    i = childResult.end;
  }

  return {
    element: { tag: tagName, attributes, styles, children },
    end: i
  };
}

function parseInlineStyles(styleStr: string): Record<string, string> {
  const styles: Record<string, string> = {};
  const declarations = styleStr.split(';');

  for (const decl of declarations) {
    const colonPos = decl.indexOf(':');
    if (colonPos === -1) continue;

    const prop = decl.slice(0, colonPos).trim().toLowerCase();
    const value = decl.slice(colonPos + 1).trim();

    if (prop && value) {
      styles[prop] = value;
    }
  }

  return styles;
}

// Color parsing
function parseColor(colorStr: string | undefined): { r: number; g: number; b: number } | null {
  if (!colorStr || typeof colorStr !== 'string') {
    return null;
  }

  colorStr = colorStr.trim().toLowerCase();

  // Named colors (common ones)
  const namedColors: Record<string, { r: number; g: number; b: number }> = {
    white: { r: 1, g: 1, b: 1 },
    black: { r: 0, g: 0, b: 0 },
    red: { r: 1, g: 0, b: 0 },
    green: { r: 0, g: 0.5, b: 0 },
    blue: { r: 0, g: 0, b: 1 },
    gray: { r: 0.5, g: 0.5, b: 0.5 },
    grey: { r: 0.5, g: 0.5, b: 0.5 },
    transparent: { r: 0, g: 0, b: 0 },
  };

  if (namedColors[colorStr]) return namedColors[colorStr];

  // Hex color
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
      };
    }
  }

  // rgb/rgba
  const rgbMatch = colorStr.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]) / 255,
      g: parseInt(rgbMatch[2]) / 255,
      b: parseInt(rgbMatch[3]) / 255,
    };
  }

  return null;
}

// Parse dimension value
function parseDimension(value: string): number | null {
  if (!value) return null;
  const match = value.match(/^(\d+(?:\.\d+)?)(px|rem|em|%)?$/);
  if (match) {
    let num = parseFloat(match[1]);
    const unit = match[2];
    if (unit === 'rem' || unit === 'em') num *= 16;
    return num;
  }
  return null;
}

// Convert parsed element to Figma node
async function convertToFigma(
  element: ParsedElement,
  parent?: FrameNode | GroupNode
): Promise<ConversionResult> {
  const warnings: string[] = [];
  let node: SceneNode;

  const styles = element.styles;
  const tag = element.tag;

  // Determine node type based on tag
  if (['p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'a'].includes(tag)) {
    // Text node
    node = await createTextNode(element, warnings);
  } else if (tag === 'img') {
    // Image placeholder (rectangle)
    node = createImagePlaceholder(element, warnings);
  } else if (tag === 'hr') {
    // Horizontal rule
    node = createHorizontalRule(element);
  } else if (tag === 'input' || tag === 'textarea') {
    // Input field
    node = await createInputField(element, warnings);
  } else {
    // Container (div, section, header, footer, button, etc.)
    node = await createContainer(element, warnings);
  }

  // Apply common styles
  applyCommonStyles(node, styles, warnings);

  // Add to parent
  if (parent) {
    parent.appendChild(node);
  }

  return { node, warnings };
}

async function createTextNode(element: ParsedElement, warnings: string[]): Promise<TextNode> {
  // Collect all text content
  let textContent = '';
  for (const child of element.children) {
    if (typeof child === 'string') {
      textContent += child;
    } else {
      // Nested element - just get its text
      textContent += extractText(child);
    }
  }

  // Default font sizes for heading tags
  const headingSizes: Record<string, number> = {
    h1: 32, h2: 28, h3: 24, h4: 20, h5: 18, h6: 16
  };

  const styles = element.styles;
  const fontSize = parseDimension(styles['font-size']) || headingSizes[element.tag] || 16;
  const fontWeight = styles['font-weight'] || (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(element.tag) ? 'bold' : 'normal');

  // Map font weight to Figma style
  let fontStyle = 'Regular';
  if (fontWeight === 'bold' || fontWeight === '700' || fontWeight === '600') {
    fontStyle = 'Bold';
  } else if (fontWeight === '500') {
    fontStyle = 'Medium';
  } else if (fontWeight === '300' || fontWeight === 'light') {
    fontStyle = 'Light';
  }

  const fontFamily = styles['font-family']?.split(',')[0]?.replace(/['"]/g, '').trim() || 'Inter';

  // Load font
  try {
    await figma.loadFontAsync({ family: fontFamily, style: fontStyle });
  } catch (e) {
    warnings.push(`Font "${fontFamily} ${fontStyle}" not available, using Inter`);
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  }

  const text = figma.createText();
  text.characters = textContent || ' ';

  try {
    text.fontName = { family: fontFamily, style: fontStyle };
  } catch (e) {
    text.fontName = { family: 'Inter', style: 'Regular' };
  }

  text.fontSize = fontSize;

  // Text color
  const color = parseColor(styles['color'] || '#000000');
  if (color) {
    text.fills = [{ type: 'SOLID', color }];
  }

  // Text alignment
  const textAlign = styles['text-align'];
  if (textAlign === 'center') text.textAlignHorizontal = 'CENTER';
  else if (textAlign === 'right') text.textAlignHorizontal = 'RIGHT';
  else text.textAlignHorizontal = 'LEFT';

  // Line height
  const lineHeight = parseDimension(styles['line-height']);
  if (lineHeight) {
    text.lineHeight = { value: lineHeight, unit: 'PIXELS' };
  }

  return text;
}

function extractText(element: ParsedElement): string {
  let text = '';
  for (const child of element.children) {
    if (typeof child === 'string') {
      text += child;
    } else {
      text += extractText(child);
    }
  }
  return text;
}

function createImagePlaceholder(element: ParsedElement, warnings: string[]): RectangleNode {
  const rect = figma.createRectangle();
  const styles = element.styles;

  const width = parseDimension(styles['width'] || element.attributes['width']) || 200;
  const height = parseDimension(styles['height'] || element.attributes['height']) || 150;

  rect.resize(width, height);
  rect.name = element.attributes['alt'] || 'Image';
  rect.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];

  // Corner radius
  const borderRadius = parseDimension(styles['border-radius']);
  if (borderRadius) rect.cornerRadius = borderRadius;

  warnings.push(`Image placeholder created for: ${element.attributes['src'] || 'unknown'}`);

  return rect;
}

function createHorizontalRule(element: ParsedElement): RectangleNode {
  const rect = figma.createRectangle();
  const styles = element.styles;

  const width = parseDimension(styles['width']) || 300;
  const height = parseDimension(styles['height']) || 1;

  rect.resize(width, height);
  rect.name = 'Divider';

  const color = parseColor(styles['background-color'] || styles['border-color'] || '#e0e0e0');
  rect.fills = [{ type: 'SOLID', color: color || { r: 0.88, g: 0.88, b: 0.88 } }];

  return rect;
}

async function createInputField(element: ParsedElement, warnings: string[]): Promise<FrameNode> {
  const frame = figma.createFrame();
  const styles = element.styles;

  const width = parseDimension(styles['width']) || 280;
  const height = parseDimension(styles['height']) || 44;

  frame.resize(width, height);
  frame.name = element.attributes['placeholder'] || element.attributes['type'] || 'Input';

  // Auto-layout for centering content
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'CENTER';
  frame.paddingLeft = 12;
  frame.paddingRight = 12;

  // Background
  const bgColor = parseColor(styles['background-color'] || styles['background'] || '#ffffff');
  frame.fills = [{ type: 'SOLID', color: bgColor || { r: 1, g: 1, b: 1 } }];

  // Border
  const borderColor = parseColor(styles['border-color'] || '#cccccc');
  if (borderColor) {
    frame.strokes = [{ type: 'SOLID', color: borderColor }];
    frame.strokeWeight = 1;
  }

  // Corner radius
  const borderRadius = parseDimension(styles['border-radius']) || 4;
  frame.cornerRadius = borderRadius;

  // Add placeholder text
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  const text = figma.createText();
  text.characters = element.attributes['placeholder'] || '';
  text.fontSize = 14;
  text.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }];
  frame.appendChild(text);

  return frame;
}

async function createContainer(element: ParsedElement, warnings: string[]): Promise<FrameNode> {
  const frame = figma.createFrame();
  const styles = element.styles;
  const tag = element.tag;

  // Name based on tag/class/id
  frame.name = element.attributes['class'] || element.attributes['id'] || tag.toUpperCase();

  // Sizing
  let width = parseDimension(styles['width']);
  let height = parseDimension(styles['height']);

  // Common component sizes
  if (tag === 'button' && !width) width = 120;
  if (tag === 'button' && !height) height = 44;

  // Default sizing mode
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';

  if (width) {
    frame.resize(width, height || 100);
    frame.primaryAxisSizingMode = 'FIXED';
  }
  if (height) {
    frame.resize(width || 100, height);
    frame.counterAxisSizingMode = 'FIXED';
  }

  // Auto-layout based on display/flex
  const display = styles['display'];
  const flexDirection = styles['flex-direction'];

  if (display === 'flex' || display === 'inline-flex') {
    if (flexDirection === 'column') {
      frame.layoutMode = 'VERTICAL';
    } else {
      frame.layoutMode = 'HORIZONTAL';
    }

    // Gap
    const gap = parseDimension(styles['gap']);
    if (gap) frame.itemSpacing = gap;

    // Justify content
    const justifyContent = styles['justify-content'];
    if (justifyContent === 'center') frame.primaryAxisAlignItems = 'CENTER';
    else if (justifyContent === 'flex-end' || justifyContent === 'end') frame.primaryAxisAlignItems = 'MAX';
    else if (justifyContent === 'space-between') frame.primaryAxisAlignItems = 'SPACE_BETWEEN';

    // Align items
    const alignItems = styles['align-items'];
    if (alignItems === 'center') frame.counterAxisAlignItems = 'CENTER';
    else if (alignItems === 'flex-end' || alignItems === 'end') frame.counterAxisAlignItems = 'MAX';
  } else {
    // Default to vertical auto-layout
    frame.layoutMode = 'VERTICAL';
  }

  // Padding
  const padding = parseDimension(styles['padding']);
  if (padding) {
    frame.paddingTop = padding;
    frame.paddingRight = padding;
    frame.paddingBottom = padding;
    frame.paddingLeft = padding;
  }

  const paddingTop = parseDimension(styles['padding-top']);
  const paddingRight = parseDimension(styles['padding-right']);
  const paddingBottom = parseDimension(styles['padding-bottom']);
  const paddingLeft = parseDimension(styles['padding-left']);

  if (paddingTop) frame.paddingTop = paddingTop;
  if (paddingRight) frame.paddingRight = paddingRight;
  if (paddingBottom) frame.paddingBottom = paddingBottom;
  if (paddingLeft) frame.paddingLeft = paddingLeft;

  // Background
  const bgColor = parseColor(styles['background-color'] || styles['background']);
  if (bgColor) {
    frame.fills = [{ type: 'SOLID', color: bgColor }];
  } else {
    frame.fills = [];
  }

  // Border radius
  const borderRadius = parseDimension(styles['border-radius']);
  if (borderRadius) frame.cornerRadius = borderRadius;

  // Border
  const borderColor = parseColor(styles['border-color']);
  const borderWidth = parseDimension(styles['border-width']);
  if (borderColor || borderWidth) {
    frame.strokes = [{ type: 'SOLID', color: borderColor || { r: 0, g: 0, b: 0 } }];
    frame.strokeWeight = borderWidth || 1;
  }

  // Process children
  for (const child of element.children) {
    if (typeof child === 'string') {
      // Text content in container - create text node
      const trimmed = child.trim();
      if (trimmed) {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
        const textNode = figma.createText();
        textNode.characters = trimmed;
        textNode.fontSize = 16;

        // Apply text color from container
        const textColor = parseColor(styles['color']);
        if (textColor) {
          textNode.fills = [{ type: 'SOLID', color: textColor }];
        }

        frame.appendChild(textNode);
      }
    } else {
      // Nested element
      await convertToFigma(child, frame);
    }
  }

  return frame;
}

function applyCommonStyles(node: SceneNode, styles: Record<string, string>, warnings: string[]): void {
  // Position (for absolute positioning)
  const position = styles['position'];
  if (position === 'absolute' || position === 'fixed') {
    const left = parseDimension(styles['left']);
    const top = parseDimension(styles['top']);
    if (left !== null && 'x' in node) (node as any).x = left;
    if (top !== null && 'y' in node) (node as any).y = top;
  }

  // Opacity
  const opacity = parseFloat(styles['opacity']);
  if (!isNaN(opacity) && 'opacity' in node) {
    (node as any).opacity = opacity;
  }

  // Visibility
  if (styles['visibility'] === 'hidden' || styles['display'] === 'none') {
    node.visible = false;
  }
}

// Main export function
export async function importHTML(params: {
  html: string;
  parentId?: string;
  x?: number;
  y?: number;
  name?: string;
}): Promise<{
  created: boolean;
  rootNodeId: string;
  rootNodeName: string;
  nodeCount: number;
  warnings: string[];
}> {
  // Validate input
  if (!params) {
    throw new Error('importHTML: No parameters provided');
  }

  const { html, parentId, x, y, name } = params;

  if (!html) {
    throw new Error('importHTML: html parameter is required');
  }

  if (typeof html !== 'string') {
    throw new Error(`importHTML: html must be a string, got ${typeof html}`);
  }

  const trimmedHtml = html.trim();
  if (!trimmedHtml) {
    throw new Error('importHTML: html cannot be empty');
  }

  // Parse HTML
  const parsed = tokenizeHTML(trimmedHtml);

  if (!parsed) {
    throw new Error('Failed to parse HTML. Make sure it starts with a valid HTML tag like <div>');
  }

  // Convert to Figma
  const result = await convertToFigma(parsed);
  const rootNode = result.node;

  // Set name
  if (name) {
    rootNode.name = name;
  }

  // Position
  if (x !== undefined && 'x' in rootNode) rootNode.x = x;
  if (y !== undefined && 'y' in rootNode) rootNode.y = y;

  // Add to parent
  if (parentId) {
    const parent = figma.getNodeById(parentId);
    if (parent && 'appendChild' in parent) {
      (parent as FrameNode).appendChild(rootNode);
    }
  }

  // Count all nodes
  let nodeCount = 1;
  function countNodes(node: SceneNode) {
    if ('children' in node) {
      for (const child of (node as FrameNode).children) {
        nodeCount++;
        countNodes(child);
      }
    }
  }
  countNodes(rootNode);

  // Zoom to new node
  figma.viewport.scrollAndZoomIntoView([rootNode]);

  return {
    created: true,
    rootNodeId: rootNode.id,
    rootNodeName: rootNode.name,
    nodeCount,
    warnings: result.warnings,
  };
}
