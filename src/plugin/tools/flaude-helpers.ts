/**
 * Blessed sandbox helpers exposed as the top-level `flaude.*` parameter
 * inside every `figma_execute` call (NOT `figma.flaude.*` — the real `figma`
 * host object is frozen/sealed by Figma's plugin sandbox, so it can't be
 * mutated to carry a `.flaude` property; see command-handler.ts's `execute`
 * handler, which passes this as a second function parameter instead).
 *
 * Pit-of-success: the CORRECT way to get an icon or a piece of iOS chrome
 * must be shorter to type than hand-drawing one with `figma.createNodeFromSvg`
 * / raw rectangles, or agents default to hand-drawing under time pressure
 * regardless of what the prose rules (ICON BOOTSTRAP, REFERENCE-MATCH MODE)
 * say. These helpers do the search-then-instantiate (and seed-if-missing)
 * dance in one call, so the fast path and the correct path are the same path.
 */

import { seedIosKit } from './ios-kit-seed';

const ICONS_PAGE_NAME = '_Flaude Icons';

function getOrCreateIconsPage(): PageNode {
  const existing = figma.root.children.find(
    (p): p is PageNode => p.type === 'PAGE' && p.name === ICONS_PAGE_NAME
  );
  if (existing) return existing;
  const page = figma.createPage();
  page.name = ICONS_PAGE_NAME;
  return page;
}

async function findIconComponent(concept: string): Promise<ComponentNode | null> {
  // Dynamic-page documents (large files with many pages) require all pages
  // to be loaded before a root-wide findAllWithCriteria scan is allowed.
  await figma.loadAllPagesAsync();
  const matches = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  const prefix = `${concept} · `;
  return (matches.find((c) => c.name.startsWith(prefix)) as ComponentNode | undefined) ?? null;
}

export interface FlaudeIconOptions {
  /** SVG source and display name from get_core_icons \u2014 REQUIRED the first
   * time a concept is used in this file; omit on later calls, since by then
   * the component already exists and will be found by search. */
  svg?: string;
  name?: string;
  size?: number;
  color?: RGB;
}

/**
 * Search the WHOLE file for an existing `<concept> \u00b7 ...` icon component;
 * if missing and `opts.svg`/`opts.name` are provided (from calling
 * get_core_icons first), seed it once on the "_Flaude Icons" page. Always
 * returns a fresh createInstance() \u2014 never a hand-drawn shape.
 */
export async function flaudeIcon(concept: string, opts: FlaudeIconOptions = {}): Promise<InstanceNode> {
  let master = await findIconComponent(concept);
  if (!master) {
    if (!opts.svg || !opts.name) {
      throw new Error(
        `No existing icon component found for "${concept}". Call get_core_icons ` +
          `({ concepts: ["${concept}"] }) and pass the result's svg/name to ` +
          `flaude.icon("${concept}", { svg, name }) to seed it once \u2014 do not ` +
          `hand-draw it with figma.createNodeFromSvg directly.`
      );
    }
    const page = getOrCreateIconsPage();
    const svgNode = figma.createNodeFromSvg(opts.svg);
    master = figma.createComponent();
    master.name = `${concept} \u00b7 ${opts.name}`;
    master.resize(svgNode.width, svgNode.height);
    master.appendChild(svgNode);
    svgNode.x = 0;
    svgNode.y = 0;
    page.appendChild(master);
  }

  const inst = master.createInstance();
  const size = opts.size ?? 24;
  inst.resize(size, size);
  if (opts.color) {
    const color = opts.color;
    for (const child of inst.children) {
      if ('strokes' in child && Array.isArray(child.strokes) && child.strokes.length > 0) {
        child.strokes = child.strokes.map((s) => (s.type === 'SOLID' ? { ...s, color } : s));
      }
      if ('fills' in child && Array.isArray(child.fills) && child.fills.length > 0) {
        child.fills = child.fills.map((f) => (f.type === 'SOLID' ? { ...f, color } : f));
      }
    }
  }
  return inst;
}

async function seededComponent(id: string, label: string): Promise<ComponentNode> {
  // getNodeByIdAsync (not the sync getNodeById) is required for nodes on
  // pages that aren't currently loaded in dynamic-page documents.
  const node = await figma.getNodeByIdAsync(id);
  if (!node || node.type !== 'COMPONENT') {
    throw new Error(`${label} master component missing after seed_ios_kit (id: ${id})`);
  }
  return node;
}

/** Idempotent status bar instance \u2014 never hand-draw signal/wifi/battery glyphs. */
export async function flaudeStatusBar(): Promise<InstanceNode> {
  const { componentIds } = await seedIosKit();
  const master = await seededComponent(componentIds.statusBar, 'Status bar');
  return master.createInstance();
}

/** Idempotent home indicator instance \u2014 never hand-draw the pill rectangle. */
export async function flaudeHomeIndicator(): Promise<InstanceNode> {
  const { componentIds } = await seedIosKit();
  const master = await seededComponent(componentIds.homeIndicator, 'Home indicator');
  return master.createInstance();
}

// Real Apple keyboard component set (uploaded by the user onto "_iOS Kit"),
// NOT the crude bundled placeholder — has genuine Mode (Light/Dark) and Type
// (Letters - Lowercase/Uppercase, Numbers, Characters) variant properties.
const KEYBOARD_LAYOUTS_SET_NAME = '_Keyboard - iPhone Layouts';

async function findRealKeyboardComponentSet(): Promise<ComponentSetNode | null> {
  await figma.loadAllPagesAsync();
  const matches = figma.root.findAllWithCriteria({ types: ['COMPONENT_SET'] });
  return (
    (matches.find((c) => c.name === KEYBOARD_LAYOUTS_SET_NAME) as ComponentSetNode | undefined) ?? null
  );
}

export interface FlaudeKeyboardOptions {
  /** Default: 'Light'. Use 'Dark' on dark-background screens. */
  mode?: 'Light' | 'Dark';
  /** Default: 'Letters - Lowercase'. */
  type?: 'Letters - Lowercase' | 'Letters - Uppercase' | 'Numbers' | 'Characters';
}

/**
 * Instance of the REAL Apple keyboard component (Mode + Type variants) —
 * never the crude bundled placeholder. Matches variants by their parsed
 * variantProperties (not .name string matching, since Figma's own variant
 * names have inconsistent spacing, e.g. "Mode= Light" vs "Mode=Dark").
 * Throws a clear error (never silently draws a fallback) if "_iOS Kit" /
 * the layouts component set isn't present in this file.
 */
export async function flaudeKeyboard(opts: FlaudeKeyboardOptions = {}): Promise<InstanceNode> {
  const mode = opts.mode ?? 'Light';
  const type = opts.type ?? 'Letters - Lowercase';

  const componentSet = await findRealKeyboardComponentSet();
  if (!componentSet) {
    throw new Error(
      `"${KEYBOARD_LAYOUTS_SET_NAME}" component set not found in this file — never hand-draw ` +
        `a keyboard with rectangles/text. Add the real Apple keyboard component to "_iOS Kit" first.`
    );
  }

  const variant = componentSet.children.find((c): c is ComponentNode => {
    if (c.type !== 'COMPONENT') return false;
    const props = c.variantProperties;
    return props?.Mode?.trim() === mode && props?.Type?.trim() === type;
  });
  if (!variant) {
    const available = componentSet.children.map((c) => c.name).join(', ');
    throw new Error(
      `No keyboard variant matching Mode="${mode}", Type="${type}" in "${KEYBOARD_LAYOUTS_SET_NAME}". ` +
        `Available variants: ${available}`
    );
  }

  return variant.createInstance();
}

/**
 * Everything exposed under the top-level `flaude.*` sandbox parameter.
 * Kept as a single object so command-handler.ts can pass it in one line.
 */
export const flaudeHelpers = {
  icon: flaudeIcon,
  statusBar: flaudeStatusBar,
  homeIndicator: flaudeHomeIndicator,
  keyboard: flaudeKeyboard,
};
