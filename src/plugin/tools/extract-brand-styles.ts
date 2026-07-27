/**
 * Extract the brand system that ALREADY EXISTS in the user's Figma file.
 *
 * The product's promise is that it studies how you already design rather than
 * interrogating you with form fields — but until now the only Figma input was
 * a URL pasted into a text box, which nothing ever read. Everything needed was
 * already here: the plugin runs inside the file with `documentAccess:
 * dynamic-page`, so the real colour styles, text styles and component names
 * are one API call away.
 *
 * Deliberately reads STYLES (and, as a fallback, what's actually on the
 * canvas) rather than asking the model to guess from a screenshot:
 *   • local paint styles  -> the palette, with the names the designer chose
 *   • local text styles   -> the typefaces and the size ramp
 *   • component names     -> what the design system is made of
 *
 * When a file has no local styles (common — plenty of teams style ad hoc, or
 * pull from a shared library), it falls back to sampling fills and fonts from
 * the canvas so the result is still real evidence rather than nothing.
 */

type RGB = { r: number; g: number; b: number };

export type BrandStyleColour = {
  /** The designer's own name for it, e.g. "Brand/Primary". */
  name: string;
  hex: string;
  /** How many nodes use it — the top of this list is the real brand palette. */
  usage?: number;
};

export type BrandStyleType = {
  name: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
};

export type ExtractedBrandStyles = {
  fileName: string;
  /** 'styles' = the file's defined system; 'canvas' = sampled from what exists. */
  source: 'styles' | 'canvas' | 'mixed';
  colours: BrandStyleColour[];
  typeStyles: BrandStyleType[];
  /** Component names, deduped — the vocabulary of their system. */
  components: string[];
  /** Frame sizes in use, e.g. "1080×1350" — reveals what they actually post. */
  canvasSizes: string[];
};

function toHex({ r, g, b }: RGB): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Solid paint only: gradients and images have no single hex to report. */
function solidHex(paints: readonly Paint[] | typeof figma.mixed): string | null {
  if (paints === figma.mixed || !Array.isArray(paints)) return null;
  const solid = paints.find(
    (p): p is SolidPaint => p.type === 'SOLID' && p.visible !== false
  );
  return solid ? toHex(solid.color) : null;
}

/**
 * Sample colours and fonts from the canvas. Used when the file defines no
 * local styles — the palette is then whatever is genuinely most used, which is
 * a better answer than an empty one.
 */
async function sampleFromCanvas(limit = 4000): Promise<{
  colours: BrandStyleColour[];
  typeStyles: BrandStyleType[];
}> {
  const colourCounts = new Map<string, number>();
  const fontCounts = new Map<string, { info: BrandStyleType; n: number }>();

  const page = figma.currentPage;
  await page.loadAsync();
  const nodes = page.findAll(() => true).slice(0, limit);

  for (const node of nodes) {
    if ('fills' in node) {
      const hex = solidHex(node.fills);
      // Pure white/black are page background and body text everywhere; they
      // say nothing about the brand.
      if (hex && hex !== '#FFFFFF' && hex !== '#000000') {
        colourCounts.set(hex, (colourCounts.get(hex) ?? 0) + 1);
      }
    }
    if (node.type === 'TEXT') {
      const font = node.fontName;
      const size = node.fontSize;
      if (font !== figma.mixed && typeof size === 'number') {
        const key = `${font.family}|${font.style}|${Math.round(size)}`;
        const existing = fontCounts.get(key);
        if (existing) {
          existing.n += 1;
        } else {
          fontCounts.set(key, {
            n: 1,
            info: {
              name: `${font.family} ${Math.round(size)}`,
              fontFamily: font.family,
              fontStyle: font.style,
              fontSize: Math.round(size),
            },
          });
        }
      }
    }
  }

  const colours = [...colourCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([hex, usage]) => ({ name: hex, hex, usage }));

  const typeStyles = [...fontCounts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)
    .map((f) => f.info);

  return { colours, typeStyles };
}

/**
 * Read the design system out of the current Figma file.
 */
export async function extractBrandStyles(): Promise<ExtractedBrandStyles> {
  const [paintStyles, textStyles] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
  ]);

  const colours: BrandStyleColour[] = [];
  for (const style of paintStyles) {
    const hex = solidHex(style.paints);
    if (hex) colours.push({ name: style.name, hex });
  }

  const typeStyles: BrandStyleType[] = textStyles.map((s) => ({
    name: s.name,
    fontFamily: s.fontName.family,
    fontStyle: s.fontName.style,
    fontSize: Math.round(s.fontSize),
  }));

  // Components describe the system's vocabulary ("Card", "Post/Quote").
  const page = figma.currentPage;
  await page.loadAsync();
  const components = [
    ...new Set(
      page
        .findAllWithCriteria({ types: ['COMPONENT', 'COMPONENT_SET'] })
        .map((c) => c.name)
        .filter(Boolean)
    ),
  ].slice(0, 40);

  // Top-level frame sizes reveal what they actually produce (1080×1350 etc).
  const canvasSizes = [
    ...new Set(
      page.children
        .filter((n): n is FrameNode => n.type === 'FRAME')
        .map((f) => `${Math.round(f.width)}×${Math.round(f.height)}`)
    ),
  ].slice(0, 12);

  // Fall back to the canvas when the file defines no system of its own.
  let source: ExtractedBrandStyles['source'] = 'styles';
  if (colours.length === 0 || typeStyles.length === 0) {
    const sampled = await sampleFromCanvas();
    if (colours.length === 0 && sampled.colours.length > 0) {
      colours.push(...sampled.colours);
      source = typeStyles.length > 0 ? 'mixed' : 'canvas';
    }
    if (typeStyles.length === 0 && sampled.typeStyles.length > 0) {
      typeStyles.push(...sampled.typeStyles);
      source = colours.length > 0 && paintStyles.length > 0 ? 'mixed' : 'canvas';
    }
  }

  return {
    fileName: figma.root.name,
    source,
    colours: colours.slice(0, 24),
    typeStyles: typeStyles.slice(0, 12),
    components,
    canvasSizes,
  };
}
