/**
 * Design Analyzer Tools
 *
 * These tools help Claude learn from existing designs
 * so it can replicate patterns accurately.
 */

interface SpacingPattern {
  value: number;
  count: number;
  contexts: string[];
}

interface TextStyle {
  fontSize: number;
  fontFamily: string;
  fontStyle: string;
  color: string;
  maxWidth: number;
  examples: string[];
}

interface ColorUsage {
  hex: string;
  rgb: { r: number; g: number; b: number };
  count: number;
  contexts: string[];
}

interface ComponentPattern {
  name: string;
  type: string;
  width: number;
  height: number;
  hasAutoLayout: boolean;
  layoutMode?: string;
  padding?: { top: number; right: number; bottom: number; left: number };
  itemSpacing?: number;
  cornerRadius?: number;
  childCount: number;
  id: string;
}

interface DesignBrief {
  frameName: string;
  frameId: string;
  dimensions: { width: number; height: number };
  spacing: {
    gaps: SpacingPattern[];
    paddings: SpacingPattern[];
    margins: SpacingPattern[];
  };
  textStyles: TextStyle[];
  colors: ColorUsage[];
  components: ComponentPattern[];
  autoLayoutUsage: {
    vertical: number;
    horizontal: number;
    none: number;
  };
  recommendations: string[];
}

// Convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Extract color from fills
function extractColor(node: SceneNode): ColorUsage | null {
  if (!('fills' in node)) return null;

  const fills = (node as GeometryMixin).fills;
  if (!fills || fills === figma.mixed || !Array.isArray(fills)) return null;

  for (const fill of fills) {
    if (fill.type === 'SOLID' && fill.visible !== false) {
      return {
        hex: rgbToHex(fill.color.r, fill.color.g, fill.color.b),
        rgb: fill.color,
        count: 1,
        contexts: [node.name],
      };
    }
  }

  return null;
}

// Analyze spacing patterns in a frame
function analyzeSpacing(frame: FrameNode): {
  gaps: SpacingPattern[];
  paddings: SpacingPattern[];
} {
  const gaps: Map<number, SpacingPattern> = new Map();
  const paddings: Map<number, SpacingPattern> = new Map();

  function processFrame(f: FrameNode, path: string) {
    // Collect padding
    if (f.paddingTop > 0 || f.paddingBottom > 0 || f.paddingLeft > 0 || f.paddingRight > 0) {
      const paddingValues = [f.paddingTop, f.paddingRight, f.paddingBottom, f.paddingLeft]
        .filter(p => p > 0);

      for (const p of paddingValues) {
        const rounded = Math.round(p);
        if (paddings.has(rounded)) {
          const existing = paddings.get(rounded)!;
          existing.count++;
          if (!existing.contexts.includes(path)) {
            existing.contexts.push(path);
          }
        } else {
          paddings.set(rounded, { value: rounded, count: 1, contexts: [path] });
        }
      }
    }

    // Collect item spacing (gaps)
    if (f.itemSpacing > 0) {
      const rounded = Math.round(f.itemSpacing);
      if (gaps.has(rounded)) {
        const existing = gaps.get(rounded)!;
        existing.count++;
        if (!existing.contexts.includes(path)) {
          existing.contexts.push(path);
        }
      } else {
        gaps.set(rounded, { value: rounded, count: 1, contexts: [path] });
      }
    }

    // Recurse into children
    for (const child of f.children) {
      if (child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE') {
        processFrame(child as FrameNode, `${path} > ${child.name}`);
      }
    }
  }

  processFrame(frame, frame.name);

  return {
    gaps: Array.from(gaps.values()).sort((a, b) => b.count - a.count),
    paddings: Array.from(paddings.values()).sort((a, b) => b.count - a.count),
  };
}

// Analyze text styles
function analyzeTextStyles(frame: FrameNode): TextStyle[] {
  const styles: Map<string, TextStyle> = new Map();

  function processNode(node: SceneNode) {
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      const fontSize = typeof textNode.fontSize === 'number' ? textNode.fontSize : 16;
      const fontName = textNode.fontName !== figma.mixed ? textNode.fontName : { family: 'Inter', style: 'Regular' };

      // Get text color
      let colorHex = '#000000';
      if (textNode.fills && textNode.fills !== figma.mixed && Array.isArray(textNode.fills)) {
        for (const fill of textNode.fills) {
          if (fill.type === 'SOLID') {
            colorHex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
            break;
          }
        }
      }

      const key = `${fontSize}-${fontName.family}-${fontName.style}-${colorHex}`;

      if (styles.has(key)) {
        const existing = styles.get(key)!;
        if (textNode.width > existing.maxWidth) {
          existing.maxWidth = Math.round(textNode.width);
        }
        if (existing.examples.length < 3 && textNode.characters.length > 0) {
          const sample = textNode.characters.slice(0, 30);
          if (!existing.examples.includes(sample)) {
            existing.examples.push(sample);
          }
        }
      } else {
        styles.set(key, {
          fontSize,
          fontFamily: fontName.family,
          fontStyle: fontName.style,
          color: colorHex,
          maxWidth: Math.round(textNode.width),
          examples: textNode.characters.length > 0 ? [textNode.characters.slice(0, 30)] : [],
        });
      }
    }

    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        processNode(child as SceneNode);
      }
    }
  }

  processNode(frame);

  return Array.from(styles.values()).sort((a, b) => b.fontSize - a.fontSize);
}

// Analyze colors used
function analyzeColors(frame: FrameNode): ColorUsage[] {
  const colors: Map<string, ColorUsage> = new Map();

  function processNode(node: SceneNode) {
    const color = extractColor(node);
    if (color) {
      if (colors.has(color.hex)) {
        const existing = colors.get(color.hex)!;
        existing.count++;
        if (existing.contexts.length < 5 && !existing.contexts.includes(node.name)) {
          existing.contexts.push(node.name);
        }
      } else {
        colors.set(color.hex, color);
      }
    }

    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        processNode(child as SceneNode);
      }
    }
  }

  processNode(frame);

  return Array.from(colors.values())
    .filter(c => c.hex !== '#FFFFFF' && c.hex !== '#000000') // Filter out pure black/white
    .sort((a, b) => b.count - a.count);
}

// Analyze component patterns
function analyzeComponents(frame: FrameNode): ComponentPattern[] {
  const components: ComponentPattern[] = [];

  function processNode(node: SceneNode, depth: number) {
    if (depth > 2) return; // Only go 2 levels deep for patterns

    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      const f = node as FrameNode;

      // Only capture meaningful components (not tiny elements)
      if (f.width > 40 && f.height > 20) {
        components.push({
          name: f.name,
          type: node.type,
          width: Math.round(f.width),
          height: Math.round(f.height),
          hasAutoLayout: f.layoutMode !== 'NONE',
          layoutMode: f.layoutMode,
          padding: {
            top: f.paddingTop,
            right: f.paddingRight,
            bottom: f.paddingBottom,
            left: f.paddingLeft,
          },
          itemSpacing: f.itemSpacing,
          cornerRadius: typeof f.cornerRadius === 'number' ? f.cornerRadius : 0,
          childCount: f.children.length,
          id: f.id,
        });
      }
    }

    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        processNode(child as SceneNode, depth + 1);
      }
    }
  }

  for (const child of frame.children) {
    processNode(child as SceneNode, 0);
  }

  return components;
}

// Count auto-layout usage
function countAutoLayoutUsage(frame: FrameNode): { vertical: number; horizontal: number; none: number } {
  const counts = { vertical: 0, horizontal: 0, none: 0 };

  function processNode(node: SceneNode) {
    if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
      const f = node as FrameNode;
      if (f.layoutMode === 'VERTICAL') counts.vertical++;
      else if (f.layoutMode === 'HORIZONTAL') counts.horizontal++;
      else counts.none++;
    }

    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        processNode(child as SceneNode);
      }
    }
  }

  processNode(frame);

  return counts;
}

/**
 * Study a frame to learn its design patterns
 * Use this on your best-designed screens to teach Claude your style
 */
export function studyFrame(params: { nodeId: string }): DesignBrief {
  const node = figma.getNodeById(params.nodeId);

  if (!node) {
    throw new Error(`Frame not found: ${params.nodeId}`);
  }

  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') {
    throw new Error(`Node must be a frame or component, got: ${node.type}`);
  }

  const frame = node as FrameNode;

  const spacing = analyzeSpacing(frame);
  const textStyles = analyzeTextStyles(frame);
  const colors = analyzeColors(frame);
  const components = analyzeComponents(frame);
  const autoLayoutUsage = countAutoLayoutUsage(frame);

  // Generate recommendations
  const recommendations: string[] = [];

  if (spacing.gaps.length > 0) {
    const topGap = spacing.gaps[0];
    recommendations.push(`Use ${topGap.value}px as primary gap (used ${topGap.count} times)`);
  }

  if (spacing.paddings.length > 0) {
    const topPadding = spacing.paddings[0];
    recommendations.push(`Use ${topPadding.value}px as primary padding (used ${topPadding.count} times)`);
  }

  if (textStyles.length > 0) {
    const heroStyle = textStyles[0];
    recommendations.push(`Hero text: ${heroStyle.fontSize}px ${heroStyle.fontFamily} ${heroStyle.fontStyle}, max width ${heroStyle.maxWidth}px`);
  }

  if (autoLayoutUsage.vertical > autoLayoutUsage.none) {
    recommendations.push('Prefer vertical auto-layout for containers');
  }

  if (colors.length > 0) {
    recommendations.push(`Primary brand color: ${colors[0].hex}`);
  }

  return {
    frameName: frame.name,
    frameId: frame.id,
    dimensions: { width: Math.round(frame.width), height: Math.round(frame.height) },
    spacing: {
      gaps: spacing.gaps.slice(0, 5),
      paddings: spacing.paddings.slice(0, 5),
      margins: [], // Could be calculated from x/y positions
    },
    textStyles: textStyles.slice(0, 10),
    colors: colors.slice(0, 10),
    components: components.slice(0, 20),
    autoLayoutUsage,
    recommendations,
  };
}

/**
 * Audit all components across the file
 * Catalogs every unique UI pattern for consistent reuse
 */
export function auditComponents(params: {
  pageId?: string;
  includeInstances?: boolean;
}): {
  pageAnalyzed: string;
  totalFrames: number;
  uniquePatterns: {
    buttons: ComponentPattern[];
    cards: ComponentPattern[];
    inputs: ComponentPattern[];
    badges: ComponentPattern[];
    icons: ComponentPattern[];
    containers: ComponentPattern[];
  };
  textStyles: TextStyle[];
  colorPalette: ColorUsage[];
  spacingSystem: number[];
  summary: string;
} {
  const page = params.pageId
    ? figma.getNodeById(params.pageId) as PageNode
    : figma.currentPage;

  if (!page || page.type !== 'PAGE') {
    throw new Error('Invalid page');
  }

  const allPatterns: ComponentPattern[] = [];
  const allTextStyles: Map<string, TextStyle> = new Map();
  const allColors: Map<string, ColorUsage> = new Map();
  const allSpacings: Set<number> = new Set();

  let totalFrames = 0;

  // Process all frames on the page
  for (const child of page.children) {
    if (child.type !== 'FRAME') continue;

    totalFrames++;
    const frame = child as FrameNode;

    // Get patterns from this frame
    const patterns = analyzeComponents(frame);
    allPatterns.push(...patterns);

    // Get text styles
    const textStyles = analyzeTextStyles(frame);
    for (const style of textStyles) {
      const key = `${style.fontSize}-${style.fontFamily}-${style.fontStyle}`;
      if (!allTextStyles.has(key)) {
        allTextStyles.set(key, style);
      }
    }

    // Get colors
    const colors = analyzeColors(frame);
    for (const color of colors) {
      if (!allColors.has(color.hex)) {
        allColors.set(color.hex, color);
      } else {
        allColors.get(color.hex)!.count += color.count;
      }
    }

    // Get spacing
    const spacing = analyzeSpacing(frame);
    for (const gap of spacing.gaps) {
      allSpacings.add(gap.value);
    }
    for (const padding of spacing.paddings) {
      allSpacings.add(padding.value);
    }
  }

  // Categorize patterns by likely type (based on name and size)
  const categorized = {
    buttons: [] as ComponentPattern[],
    cards: [] as ComponentPattern[],
    inputs: [] as ComponentPattern[],
    badges: [] as ComponentPattern[],
    icons: [] as ComponentPattern[],
    containers: [] as ComponentPattern[],
  };

  for (const pattern of allPatterns) {
    const name = pattern.name.toLowerCase();

    if (name.includes('button') || name.includes('btn') || name.includes('cta')) {
      categorized.buttons.push(pattern);
    } else if (name.includes('card') || name.includes('tile')) {
      categorized.cards.push(pattern);
    } else if (name.includes('input') || name.includes('field') || name.includes('text box')) {
      categorized.inputs.push(pattern);
    } else if (name.includes('badge') || name.includes('tag') || name.includes('chip') || name.includes('label')) {
      categorized.badges.push(pattern);
    } else if (name.includes('icon') || (pattern.width < 32 && pattern.height < 32)) {
      categorized.icons.push(pattern);
    } else {
      categorized.containers.push(pattern);
    }
  }

  // Deduplicate by similar dimensions
  const dedup = (arr: ComponentPattern[]) => {
    const seen = new Set<string>();
    return arr.filter(p => {
      const key = `${Math.round(p.width / 10) * 10}-${Math.round(p.height / 10) * 10}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);
  };

  const sortedSpacings = Array.from(allSpacings).sort((a, b) => a - b);

  const summary = `Analyzed ${totalFrames} screens. Found ${categorized.buttons.length} button variants, ${categorized.cards.length} card types, ${allTextStyles.size} text styles, ${allColors.size} colors. Common spacing: ${sortedSpacings.slice(0, 5).join(', ')}px.`;

  return {
    pageAnalyzed: page.name,
    totalFrames,
    uniquePatterns: {
      buttons: dedup(categorized.buttons),
      cards: dedup(categorized.cards),
      inputs: dedup(categorized.inputs),
      badges: dedup(categorized.badges),
      icons: dedup(categorized.icons),
      containers: dedup(categorized.containers),
    },
    textStyles: Array.from(allTextStyles.values()).sort((a, b) => b.fontSize - a.fontSize).slice(0, 15),
    colorPalette: Array.from(allColors.values()).sort((a, b) => b.count - a.count).slice(0, 15),
    spacingSystem: sortedSpacings.slice(0, 10),
    summary,
  };
}

/**
 * Pre-flight check before designing
 * Runs all analysis tools and returns a comprehensive design brief
 * Claude should call this BEFORE any design work
 *
 * ENHANCED: Now includes MANDATORY RULES that must be followed
 */
export function prepareToDesign(params: {
  referenceFrameId?: string;
  pageId?: string;
}): {
  ready: boolean;
  mandatoryRules: Array<{
    id: string;
    rule: string;
    example?: string;
  }>;
  designBrief: {
    spacing: { primary: number; secondary: number; gaps: number[] };
    textConstraints: Array<{ category: string; fontSize: number; maxWidth: number }>;
    colorPalette: Array<{ hex: string; usage: string }>;
    recommendations: string[];
    warnings: string[];
  };
  summary: string;
} {
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Get reference frame or use first large frame on page
  let referenceFrame: FrameNode | null = null;

  if (params.referenceFrameId) {
    const node = figma.getNodeById(params.referenceFrameId);
    if (node && (node.type === 'FRAME' || node.type === 'COMPONENT')) {
      referenceFrame = node as FrameNode;
    } else {
      warnings.push(`Reference frame ${params.referenceFrameId} not found, using auto-detection`);
    }
  }

  if (!referenceFrame) {
    // Find the largest frame on the page (likely a screen)
    const frames = figma.currentPage.children.filter(
      n => n.type === 'FRAME' && (n as FrameNode).width > 300
    ) as FrameNode[];

    if (frames.length > 0) {
      referenceFrame = frames.reduce((a, b) =>
        (a.width * a.height) > (b.width * b.height) ? a : b
      );
      recommendations.push(`Auto-selected "${referenceFrame.name}" as reference frame`);
    }
  }

  if (!referenceFrame) {
    return {
      ready: false,
      mandatoryRules: [
        { id: 'AUTO_LAYOUT', rule: 'ALWAYS use auto-layout (layoutMode: VERTICAL/HORIZONTAL) for frames with children', example: 'modify_node({ nodeId, properties: { layoutMode: "VERTICAL", itemSpacing: 16 } })' },
        { id: 'TEXT_WIDTH', rule: 'ALWAYS set width on text nodes to prevent overflow', example: 'create_text({ content, parentId, width: 300, textAutoResize: "HEIGHT" })' },
        { id: 'SPACING', rule: 'Use 8px grid for spacing (8, 16, 24, 32, 48)', example: 'itemSpacing: 16, paddingTop: 24' },
      ],
      designBrief: {
        spacing: { primary: 16, secondary: 8, gaps: [8, 16, 24] },
        textConstraints: [],
        colorPalette: [],
        recommendations: ['No frames found - create a reference design first'],
        warnings: ['Cannot analyze: no frames on page'],
      },
      summary: 'No reference frames found. Create a design first, then run prepare_to_design again.',
    };
  }

  // Analyze the reference frame
  const frameStudy = studyFrame({ nodeId: referenceFrame.id });

  // Get text constraints from the page
  const textConstraintsResult = getTextConstraints({});

  // Extract key spacing values
  const primarySpacing = frameStudy.spacing.gaps[0]?.value || 16;
  const secondarySpacing = frameStudy.spacing.gaps[1]?.value || 8;
  const allGaps = frameStudy.spacing.gaps.map(g => g.value).slice(0, 5);

  // Extract text constraints
  const textConstraints = textConstraintsResult.constraints.slice(0, 6).map(c => ({
    category: c.category,
    fontSize: c.fontSize,
    maxWidth: c.maxWidth,
  }));

  // Extract color palette
  const colorPalette = frameStudy.colors.slice(0, 5).map(c => ({
    hex: c.hex,
    usage: c.contexts[0] || 'general',
  }));

  // Build recommendations
  recommendations.push(...frameStudy.recommendations);

  if (textConstraints.length > 0) {
    const heroConstraint = textConstraints.find(t => t.category === 'hero');
    if (heroConstraint) {
      recommendations.push(`IMPORTANT: Hero text max width is ${heroConstraint.maxWidth}px - do not exceed`);
    }
  }

  if (frameStudy.autoLayoutUsage.none > frameStudy.autoLayoutUsage.vertical + frameStudy.autoLayoutUsage.horizontal) {
    warnings.push('Many frames lack auto-layout - consider using auto-layout for consistency');
  }

  const summary = `Ready to design. Reference: "${referenceFrame.name}". Use ${primarySpacing}px primary spacing, ${secondarySpacing}px secondary. ${textConstraints.length} text styles detected. ${colorPalette.length} brand colors found.`;

  // Calculate max text width from reference frame
  const maxTextWidth = textConstraints.length > 0
    ? Math.max(...textConstraints.map(t => t.maxWidth))
    : Math.round(referenceFrame.width - 48); // 24px padding each side

  // Build mandatory rules based on analysis
  const mandatoryRules = [
    {
      id: 'AUTO_LAYOUT',
      rule: 'ALWAYS use auto-layout (layoutMode: VERTICAL/HORIZONTAL) for frames with children',
      example: `modify_node({ nodeId, properties: { layoutMode: "VERTICAL", itemSpacing: ${primarySpacing} } })`,
    },
    {
      id: 'TEXT_WIDTH',
      rule: `ALWAYS set text width. Max text width in this design: ${maxTextWidth}px`,
      example: `create_text({ content, parentId, width: ${maxTextWidth}, textAutoResize: "HEIGHT" })`,
    },
    {
      id: 'SPACING',
      rule: `Use consistent spacing: ${allGaps.slice(0, 4).join(', ')}px`,
      example: `itemSpacing: ${primarySpacing}, paddingTop: ${primarySpacing}`,
    },
    {
      id: 'NO_XY_IN_AUTOLAYOUT',
      rule: 'NEVER set x/y positions inside auto-layout frames - they are ignored',
      example: 'Instead, use itemSpacing and padding on parent, or counterAxisAlignItems for alignment',
    },
    {
      id: 'VERIFY_VISUALLY',
      rule: 'ALWAYS call export_frame_preview after creating screens to verify visually',
      example: 'export_frame_preview({ nodeId: newFrameId, scale: 0.5 })',
    },
  ];

  return {
    ready: true,
    mandatoryRules,
    designBrief: {
      spacing: {
        primary: primarySpacing,
        secondary: secondarySpacing,
        gaps: allGaps,
      },
      textConstraints,
      colorPalette,
      recommendations,
      warnings,
    },
    summary,
  };
}

/**
 * DESIGN RULES SYSTEM
 *
 * Returns mandatory rules that Claude MUST follow to prevent layout mistakes.
 * These are learned from community best practices and common error patterns.
 */
export function getDesignRules(params: {
  targetParentId?: string;
  operation?: 'create_frame' | 'create_text' | 'create_rectangle' | 'modify' | 'general';
}): {
  rules: Array<{
    id: string;
    rule: string;
    reason: string;
    severity: 'MUST' | 'SHOULD' | 'PREFER';
  }>;
  contextualGuidance: string[];
  parentContext?: {
    hasAutoLayout: boolean;
    layoutMode: string;
    spacing: number;
    availableWidth: number;
    availableHeight: number;
  };
} {
  const rules: Array<{
    id: string;
    rule: string;
    reason: string;
    severity: 'MUST' | 'SHOULD' | 'PREFER';
  }> = [];

  const contextualGuidance: string[] = [];
  let parentContext: {
    hasAutoLayout: boolean;
    layoutMode: string;
    spacing: number;
    availableWidth: number;
    availableHeight: number;
  } | undefined;

  // UNIVERSAL RULES (always apply)
  rules.push({
    id: 'AUTO_LAYOUT_FRAMES',
    rule: 'ALWAYS set layoutMode to VERTICAL or HORIZONTAL when creating frames with multiple children',
    reason: 'Auto-layout ensures consistent spacing and prevents element overlap',
    severity: 'MUST',
  });

  rules.push({
    id: 'TEXT_WIDTH_CONSTRAINT',
    rule: 'ALWAYS set a width on text nodes and use textAutoResize: HEIGHT for wrapping',
    reason: 'Prevents text overflow beyond parent boundaries',
    severity: 'MUST',
  });

  rules.push({
    id: 'CHECK_PARENT_FIRST',
    rule: 'ALWAYS check parent constraints before positioning children',
    reason: 'Parent auto-layout overrides x/y positioning - understand context first',
    severity: 'MUST',
  });

  rules.push({
    id: 'NO_ABSOLUTE_IN_AUTOLAYOUT',
    rule: 'NEVER use x/y positioning for children inside auto-layout frames',
    reason: 'Auto-layout manages positioning automatically - x/y values are ignored',
    severity: 'MUST',
  });

  rules.push({
    id: 'CONSISTENT_SPACING',
    rule: 'Use consistent spacing values from the design system (usually 8, 16, 24, 32px)',
    reason: 'Inconsistent spacing creates visual chaos and unprofessional appearance',
    severity: 'SHOULD',
  });

  rules.push({
    id: 'STUDY_BEFORE_CREATE',
    rule: 'Call prepare_to_design or study_frame before creating new screens',
    reason: 'Learning existing patterns prevents style inconsistencies',
    severity: 'SHOULD',
  });

  rules.push({
    id: 'VERIFY_AFTER_CREATE',
    rule: 'Call export_frame_preview after significant changes to visually verify',
    reason: 'Visual verification catches issues that raw data cannot reveal',
    severity: 'PREFER',
  });

  // CONTEXTUAL RULES based on target parent
  if (params.targetParentId) {
    const parent = figma.getNodeById(params.targetParentId);

    if (parent && (parent.type === 'FRAME' || parent.type === 'COMPONENT' || parent.type === 'INSTANCE')) {
      const parentFrame = parent as FrameNode;
      const hasAutoLayout = parentFrame.layoutMode !== 'NONE';

      parentContext = {
        hasAutoLayout,
        layoutMode: parentFrame.layoutMode,
        spacing: parentFrame.itemSpacing,
        availableWidth: parentFrame.width - parentFrame.paddingLeft - parentFrame.paddingRight,
        availableHeight: parentFrame.height - parentFrame.paddingTop - parentFrame.paddingBottom,
      };

      if (hasAutoLayout) {
        contextualGuidance.push(`⚠️ Parent "${parentFrame.name}" uses ${parentFrame.layoutMode} auto-layout`);
        contextualGuidance.push(`→ Do NOT set x/y positions - they will be ignored`);
        contextualGuidance.push(`→ Items will be spaced ${parentFrame.itemSpacing}px apart automatically`);
        contextualGuidance.push(`→ Available width for children: ${Math.round(parentContext.availableWidth)}px`);

        rules.push({
          id: 'CONTEXT_AUTOLAYOUT_PARENT',
          rule: `Parent uses ${parentFrame.layoutMode} auto-layout - do not set x/y on children`,
          reason: 'x/y values are ignored in auto-layout containers',
          severity: 'MUST',
        });
      } else {
        contextualGuidance.push(`Parent "${parentFrame.name}" does NOT use auto-layout`);
        contextualGuidance.push(`→ You must set x/y positions manually`);
        contextualGuidance.push(`→ Consider enabling auto-layout: modify_node with layoutMode: "VERTICAL"`);
      }

      // Text-specific guidance
      if (params.operation === 'create_text') {
        const maxTextWidth = Math.round(parentContext.availableWidth - 20); // 20px margin
        contextualGuidance.push(`📝 For text in this container:`);
        contextualGuidance.push(`→ Set width: ${maxTextWidth} to prevent overflow`);
        contextualGuidance.push(`→ Set textAutoResize: "HEIGHT" to enable wrapping`);

        rules.push({
          id: 'CONTEXT_TEXT_WIDTH',
          rule: `Set text width to ${maxTextWidth}px or less in this container`,
          reason: `Parent width is ${Math.round(parentFrame.width)}px with ${parentFrame.paddingRight}px right padding`,
          severity: 'MUST',
        });
      }
    }
  }

  // Operation-specific rules
  if (params.operation === 'create_frame') {
    contextualGuidance.push(`🖼️ Creating a frame:`);
    contextualGuidance.push(`→ Set layoutMode: "VERTICAL" or "HORIZONTAL" immediately`);
    contextualGuidance.push(`→ Set padding (paddingTop, paddingRight, paddingBottom, paddingLeft)`);
    contextualGuidance.push(`→ Set itemSpacing for consistent gaps between children`);
  }

  if (params.operation === 'create_text') {
    contextualGuidance.push(`📝 Creating text:`);
    contextualGuidance.push(`→ ALWAYS set a width parameter`);
    contextualGuidance.push(`→ Use textAutoResize: "HEIGHT" for multi-line text`);
    contextualGuidance.push(`→ Use textAutoResize: "WIDTH_AND_HEIGHT" only for single-line text`);
  }

  return {
    rules,
    contextualGuidance,
    parentContext,
  };
}

/**
 * Get text constraints - max widths for text across the file
 */
export function getTextConstraints(params: { nodeId?: string }): {
  constraints: Array<{
    category: string;
    fontSize: number;
    maxWidth: number;
    examples: string[];
  }>;
  recommendations: string[];
} {
  const targetNode = params.nodeId
    ? figma.getNodeById(params.nodeId)
    : figma.currentPage;

  if (!targetNode) {
    throw new Error('Node not found');
  }

  const textData: Map<number, { maxWidth: number; examples: string[] }> = new Map();

  function processNode(node: BaseNode) {
    if (node.type === 'TEXT') {
      const textNode = node as TextNode;
      const fontSize = typeof textNode.fontSize === 'number' ? textNode.fontSize : 16;
      const width = Math.round(textNode.width);

      if (textData.has(fontSize)) {
        const existing = textData.get(fontSize)!;
        if (width > existing.maxWidth) {
          existing.maxWidth = width;
        }
        if (existing.examples.length < 3) {
          existing.examples.push(textNode.characters.slice(0, 40));
        }
      } else {
        textData.set(fontSize, {
          maxWidth: width,
          examples: [textNode.characters.slice(0, 40)],
        });
      }
    }

    if ('children' in node) {
      for (const child of (node as ChildrenMixin).children) {
        processNode(child);
      }
    }
  }

  processNode(targetNode);

  const constraints = Array.from(textData.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([fontSize, data]) => {
      let category = 'body';
      if (fontSize >= 28) category = 'hero';
      else if (fontSize >= 20) category = 'heading';
      else if (fontSize >= 16) category = 'body';
      else if (fontSize >= 12) category = 'caption';
      else category = 'micro';

      return {
        category,
        fontSize,
        maxWidth: data.maxWidth,
        examples: data.examples,
      };
    });

  const recommendations = constraints.slice(0, 5).map(c =>
    `${c.category.toUpperCase()} (${c.fontSize}px): max ${c.maxWidth}px width`
  );

  return { constraints, recommendations };
}
