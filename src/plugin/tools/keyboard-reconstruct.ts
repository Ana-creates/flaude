/**
 * Reconstructs a real, high-fidelity Figma component tree from a bundled
 * JSON_REST_V1 export (see src/plugin/assets/keyboard-{light,dark}.json).
 *
 * WHY this exists instead of bundling SVG: `node.exportAsync({ format: 'SVG' })`
 * flattens everything into shapes — real editable TEXT ("q", "w", "e"...) and
 * named sub-frames (Suggestion bar, Emoji/Mic row, individual key rows) would
 * be lost. `JSON_REST_V1` preserves the full tree (real text, real layer
 * names, real nesting), at the cost of needing this reconstructor instead of
 * a single `createNodeFromSvg` call. The only thing JSON_REST_V1 does NOT
 * include is vector path geometry, so VECTOR leaf nodes carry a pre-exported
 * `svg` string (via SVG_STRING export, done once at bundle time) and are
 * reconstructed with `createNodeFromSvg` — everything else is built directly.
 */

interface ExportedColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface ExportedFill {
  type: string;
  color?: ExportedColor;
  opacity?: number;
  blendMode?: string;
  boundVariables?: { color?: { id?: string } };
}

interface ExportedTextStyle {
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  letterSpacing?: number;
  lineHeightPx?: number;
}

interface ExportedNode {
  id: string;
  name: string;
  type: string;
  children?: ExportedNode[];
  fills?: ExportedFill[];
  strokes?: ExportedFill[];
  strokeWeight?: number;
  cornerRadius?: number;
  characters?: string;
  style?: ExportedTextStyle;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  opacity?: number;
  clipsContent?: boolean;
  effects?: Array<{ type: string; visible?: boolean }>;
  svg?: string; // only present on VECTOR leaves, pre-exported at bundle time
}

// Fonts referenced by the real Apple keyboard export (SF Pro / SF Compact
// family) are Apple system fonts that may not be installed/loadable in an
// arbitrary user's Figma. Fall back to Inter, matching the fallback chain
// already used elsewhere in this codebase (ios-kit-seed.ts).
const FONT_FALLBACKS: Array<{ family: string; style: string }> = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Inter', style: 'Semi Bold' },
  { family: 'Inter', style: 'Bold' },
];

// `figma.loadFontAsync` has been observed to hang (never resolve OR reject)
// for font names Figma doesn't recognize, rather than cleanly rejecting —
// Apple system font names like "SF Pro"/"SF Compact Rounded" (used by real
// exported iOS components) are exactly the kind of name this hits. A plain
// try/catch is not enough to guard against a hang. `withTimeout` guarantees
// every font resolution attempt moves on within a bounded time either way.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

const FONT_LOAD_TIMEOUT_MS = 4000;

async function resolveFontUncached(wantFamily: string, wantStyle: string): Promise<FontName> {
  try {
    await withTimeout(
      figma.loadFontAsync({ family: wantFamily, style: wantStyle }),
      FONT_LOAD_TIMEOUT_MS,
      `loadFontAsync(${wantFamily}, ${wantStyle})`
    );
    return { family: wantFamily, style: wantStyle };
  } catch {
    // Apple system fonts (SF Pro, SF Compact, SF Compact Rounded) are almost
    // never installed outside Figma's own iOS Kit assets — fall back to a
    // near-equivalent weight in Inter rather than failing the whole build.
    const isBold = /bold|semibold|medium/i.test(wantStyle);
    const fallback = isBold
      ? FONT_FALLBACKS.find((f) => f.style === 'Semi Bold')!
      : FONT_FALLBACKS[0];
    await withTimeout(
      figma.loadFontAsync(fallback),
      FONT_LOAD_TIMEOUT_MS,
      `loadFontAsync fallback(${fallback.family}, ${fallback.style})`
    );
    return fallback;
  }
}

function fontKey(family: string, style: string): string {
  return `${family}\u0000${style}`;
}

/**
 * A full keyboard export has ~35 TEXT leaves but only a handful of distinct
 * (family, style) pairs. Resolving fonts one at a time, sequentially awaited
 * inside the recursive build (the original approach), serialized 35+
 * `loadFontAsync` calls — many hitting the SF Pro -> Inter fallback's extra
 * awaited catch path — and reliably took well over 30s. Because `figma.
 * createText()/createFrame()/createComponent()` all auto-attach the new node
 * to `figma.currentPage` immediately, and a node is only moved into its real
 * parent by `appendChild` *after* its whole subtree finishes building, that
 * slow crawl was directly observable as loose fragments littering the page
 * mid-build. Preloading the small distinct font set ONCE, in parallel,
 * before any node is created eliminates both the slowness and that window of
 * partially-attached nodes.
 */
async function preloadFonts(root: ExportedNode): Promise<Map<string, FontName>> {
  const wanted = new Set<string>();
  const walk = (n: ExportedNode): void => {
    if (n.type === 'TEXT') {
      wanted.add(fontKey(n.style?.fontFamily ?? 'Inter', n.style?.fontStyle ?? 'Regular'));
    }
    for (const child of n.children ?? []) walk(child);
  };
  walk(root);

  const cache = new Map<string, FontName>();
  await Promise.all(
    Array.from(wanted).map(async (key) => {
      const sep = key.indexOf('\u0000');
      cache.set(key, await resolveFontUncached(key.slice(0, sep), key.slice(sep + 1)));
    })
  );
  return cache;
}

function toRGB(c?: ExportedColor): RGB {
  if (!c) return { r: 0, g: 0, b: 0 };
  return { r: c.r, g: c.g, b: c.b };
}

function toPaints(fills?: ExportedFill[]): Paint[] {
  if (!fills || fills.length === 0) return [];
  return fills
    .filter((f) => f.type === 'SOLID')
    .map((f) => ({
      type: 'SOLID' as const,
      color: toRGB(f.color),
      // `SolidPaint.color` (Figma's live API) has NO alpha channel —
      // opacity is a separate field. The export's `color.a` is a REST-API
      // artifact that is almost always 1 even when the paint is genuinely
      // translucent; the real transparency lives in `f.opacity`. Reading
      // `color.a` first (the original bug) silently discarded real opacity
      // whenever both fields were present.
      opacity: f.opacity ?? f.color?.a ?? 1,
      ...(f.blendMode ? { blendMode: f.blendMode as BlendMode } : {}),
    }));
}

/**
 * `GlassEffect` (Figma's liquid-glass material — refraction/dispersion/
 * specular highlights, a real supported Effect type) cannot be faithfully
 * reconstructed from a JSON_REST_V1 export: the export only captured
 * `{ type: "GLASS", visible: true }`, none of the required numeric fields
 * (lightIntensity, lightAngle, refraction, depth, dispersion, radius), and
 * even with full parameters it's a GPU-rendered material, not a
 * deterministic value we could replicate pixel-for-pixel. The keyboard
 * bundles use GLASS on exactly one node per variant ("Background"), layered
 * UNDER a multi-fill blend-mode stack (LUMINOSITY + LINEAR_DODGE +
 * LINEAR_BURN) whose composite is only correct WITH the glass on top —
 * without it, the blended stack renders visibly off (measured ~#D9DFE7 vs
 * the real #E6E9ED, confirmed against the user's own color-picker reading).
 * Since the glass can't be reproduced, fall back to a flat solid using the
 * last (topmost) SOLID fill layer — which for this bundle already IS the
 * correct flat tone (#E6E9ED for light) — instead of compositing a blend
 * stack that looks wrong without the effect it was designed to sit under.
 */
function hasUnreproducibleGlassEffect(exported: ExportedNode): boolean {
  return (exported.effects ?? []).some((e) => e.type === 'GLASS' && e.visible !== false);
}

function toPaintsWithGlassFallback(exported: ExportedNode): Paint[] {
  if (hasUnreproducibleGlassEffect(exported)) {
    const solids = (exported.fills ?? []).filter((f) => f.type === 'SOLID');
    const top = solids[solids.length - 1];
    return top ? [{ type: 'SOLID' as const, color: toRGB(top.color), opacity: top.opacity ?? top.color?.a ?? 1 }] : [];
  }
  return toPaints(exported.fills);
}

/** Position `node` relative to `parentAbs` using each node's own absolute
 * bounding box from the export (both are in the same absolute coordinate
 * space at export time, so the offset between them is parent-relative x/y). */
function applyRelativePosition(
  target: SceneNode,
  nodeBox: ExportedNode['absoluteBoundingBox'],
  parentBox: ExportedNode['absoluteBoundingBox']
): void {
  if (!nodeBox || !parentBox) return;
  target.x = Math.round(nodeBox.x - parentBox.x);
  target.y = Math.round(nodeBox.y - parentBox.y);
}

async function buildNode(
  exported: ExportedNode,
  parentBox: ExportedNode['absoluteBoundingBox'],
  fontCache: Map<string, FontName>,
  created: SceneNode[]
): Promise<SceneNode> {
  const box = exported.absoluteBoundingBox;
  const width = box?.width ?? 1;
  const height = box?.height ?? 1;

  if (exported.type === 'VECTOR' && exported.svg) {
    const node = figma.createNodeFromSvg(exported.svg);
    created.push(node);
    node.name = exported.name;
    node.resize(width, height);
    applyRelativePosition(node, box, parentBox);
    return node;
  }

  if (exported.type === 'TEXT') {
    const text = figma.createText();
    created.push(text);
    text.name = exported.name;
    const wantFamily = exported.style?.fontFamily ?? 'Inter';
    const wantStyle = exported.style?.fontStyle ?? 'Regular';
    const font =
      fontCache.get(fontKey(wantFamily, wantStyle)) ??
      (await resolveFontUncached(wantFamily, wantStyle));
    text.fontName = font;
    text.characters = exported.characters ?? '';
    if (exported.style?.fontSize) text.fontSize = exported.style.fontSize;
    if (exported.style?.letterSpacing) {
      text.letterSpacing = { value: exported.style.letterSpacing, unit: 'PIXELS' };
    }
    if (exported.style?.lineHeightPx) {
      text.lineHeight = { value: exported.style.lineHeightPx, unit: 'PIXELS' };
    }
    if (exported.style?.textAlignHorizontal) {
      text.textAlignHorizontal = exported.style.textAlignHorizontal as TextNode['textAlignHorizontal'];
    }
    // Was previously dropped entirely — the Return key's arrow glyph (and
    // any other vertically-centered label) exports with
    // `textAlignVertical: "CENTER"`, but text nodes default to "TOP". With
    // a fixed-size box taller than the glyph (this arrow's box is 42px for
    // a 19px glyph), leaving the default made the arrow visibly hug the top
    // of the button instead of sitting centered.
    if (exported.style?.textAlignVertical) {
      text.textAlignVertical = exported.style.textAlignVertical as TextNode['textAlignVertical'];
    }
    const paints = toPaints(exported.fills);
    if (paints.length > 0) text.fills = paints;
    text.resize(width, height);
    applyRelativePosition(text, box, parentBox);
    return text;
  }

  if (exported.type === 'RECTANGLE') {
    const rect = figma.createRectangle();
    created.push(rect);
    rect.name = exported.name;
    rect.resize(width, height);
    const paints = toPaints(exported.fills);
    if (paints.length > 0) rect.fills = paints;
    if (exported.cornerRadius) rect.cornerRadius = exported.cornerRadius;
    applyRelativePosition(rect, box, parentBox);
    return rect;
  }

  // FRAME, COMPONENT, and INSTANCE (instance children are already inlined by
  // JSON_REST_V1, so we rebuild instances as plain frames — the visible
  // result is identical, we just lose the "is an instance of X" metadata,
  // which nothing downstream depends on).
  const frame =
    exported.type === 'COMPONENT' ? figma.createComponent() : figma.createFrame();
  created.push(frame);
  frame.name = exported.name;
  frame.resize(width, height);
  if (exported.clipsContent !== undefined) frame.clipsContent = exported.clipsContent;
  frame.fills = toPaintsWithGlassFallback(exported);
  if (exported.cornerRadius) frame.cornerRadius = exported.cornerRadius;
  if (exported.opacity !== undefined) frame.opacity = exported.opacity;
  applyRelativePosition(frame, box, parentBox);

  for (const child of exported.children ?? []) {
    const childNode = await buildNode(child, box, fontCache, created);
    frame.appendChild(childNode);
  }

  return frame;
}

/**
 * Rebuild a bundled keyboard export into a real Figma COMPONENT on `page`,
 * preserving real text, real layer names, and real nesting. Never falls back
 * to a flattened/simplified shape — throws if reconstruction fails, so a
 * broken bundle is visible immediately rather than silently degrading.
 *
 * Fonts are preloaded once up front (see `preloadFonts`) so the recursive
 * build below is pure synchronous-fast Figma API calls with no per-node
 * await — it finishes in one burst instead of crawling node-by-node. Every
 * node created during the build is tracked in `created`; if anything still
 * throws partway (e.g. a malformed bundled SVG), every tracked node is
 * removed before rethrowing so a broken bundle leaves nothing behind instead
 * of littering the page with orphaned fragments.
 */
export async function reconstructComponent(
  exported: ExportedNode,
  page: PageNode
): Promise<ComponentNode> {
  const fontCache = await preloadFonts(exported);
  const created: SceneNode[] = [];
  let node: SceneNode;
  try {
    node = await buildNode(exported, exported.absoluteBoundingBox, fontCache, created);
  } catch (err) {
    for (const n of created) {
      if (!n.removed) n.remove();
    }
    throw err;
  }
  if (node.type !== 'COMPONENT') {
    if (!node.removed) node.remove();
    throw new Error(
      `Expected root export node to reconstruct as a COMPONENT, got ${node.type}`
    );
  }
  page.appendChild(node);
  node.x = 0;
  node.y = 0;
  return node;
}
