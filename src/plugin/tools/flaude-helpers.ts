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
import { reconstructComponent } from './keyboard-reconstruct';
import keyboardLightExport from '../assets/keyboard-light.json';
import keyboardDarkExport from '../assets/keyboard-dark.json';
// The 54 premade core icons, bundled into the plugin EXACTLY like the
// keyboard exports above — the asset ships inside the build. This is what
// makes flaude.icon('home') work with ZERO args in any file: the SVG source
// is always present, so a premade concept can never "fail to place" for lack
// of a get_core_icons round-trip (the exact failure that let a swallowed
// wrong-name call go silent). get_core_icons (server-side) stays the source
// of truth; keep this bundled copy in sync if the core set changes.
import coreIconsBundle from '../assets/core-icons.json';
import coreLogosBundle from '../assets/core-logos.json';

interface CoreIconEntry {
  concept: string;
  name: string;
  svg: string;
}
const CORE_ICONS = coreIconsBundle as Record<string, CoreIconEntry>;

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

/** pluginData key holding the exact SVG a seeded icon master was built from,
 * so a later call can detect that the bundled art changed and self-heal it. */
const ICON_STAMP_KEY = 'flaude:iconStamp';
/** Stamp prefix marking a master seeded from a caller's custom opts.svg — a
 * bundle refresh must never overwrite a deliberate override. */
const CUSTOM_STAMP_PREFIX = 'custom::';

/** Refresh an existing icon master's content + name IN PLACE from new SVG.
 * Existing instances mirror the main component, so they all update too. */
function reseedIconComponent(master: ComponentNode, svg: string, name: string) {
  for (const child of [...master.children]) child.remove();
  const svgNode = figma.createNodeFromSvg(svg);
  master.resize(svgNode.width, svgNode.height);
  master.appendChild(svgNode);
  svgNode.x = 0;
  svgNode.y = 0;
  master.name = name;
}

export interface FlaudeIconOptions {
  /** Optional SVG source + display name to seed a NON-core concept the first
   * time it's used in this file. The 54 premade core concepts do NOT need
   * these — they self-seed from the bundled core-icon set (see CORE_ICONS),
   * exactly like flaude.keyboard() self-seeds from its bundled export. Pass
   * them only for a genuinely custom concept not in the core set, or to
   * deliberately override a core icon's art. */
  svg?: string;
  name?: string;
  size?: number;
  color?: RGB;
}

export interface FailedIconLookup {
  concept: string;
  message: string;
}

// Root cause (production incident): builder code called flaude.icon("x", ...)
// and flaude.icon("message-circle", ...) \u2014 plausible-sounding but WRONG
// concept names, guessed from memory instead of read from get_core_icons'
// actual 54-name list (the real names are "close" and "chat"). flaudeIcon
// DID throw immediately with a clear message, exactly as designed \u2014 but the
// calling code wrapped the call in `try { ... } catch (e) {}`, which is
// legal, unremarkable-looking JS that silently discarded that message. No
// prose rule ("don't swallow errors") can stop an agent from writing a
// try/catch under time pressure. So: record every failed lookup at module
// scope regardless of whether the caller catches the throw, and
// command-handler.ts's `execute` unconditionally merges these into `_lint`
// after EVERY figma_execute call \u2014 the same "agent code can hide the
// symptom, but not the tool's own record of what it did" pattern
// reference-tracking.ts already uses for skipped screenshots.
const failedIconLookups: FailedIconLookup[] = [];

/** Drains (reads AND clears) failed icon lookups recorded since the last
 * drain \u2014 called once per figma_execute call so `_lint` reports exactly
 * the failures from THIS call, not a growing lifetime backlog. */
export function drainFailedIconLookups(): FailedIconLookup[] {
  return failedIconLookups.splice(0, failedIconLookups.length);
}

/**
 * Search the WHOLE file for an existing `<concept> \u00b7 ...` icon component;
 * if missing, seed it once on the "_Flaude Icons" page — from the bundled
 * core-icon set for any of the 54 premade concepts (zero args needed), or
 * from an explicit `opts.svg`/`opts.name` for a genuinely custom concept.
 * Always returns a fresh createInstance() — never a hand-drawn shape. This is
 * the exact keyboard pattern: bundled asset is the self-seeding fallback, so
 * the correct call (flaude.icon('home')) is also the shortest.
 */
export async function flaudeIcon(concept: string, opts: FlaudeIconOptions = {}): Promise<InstanceNode> {
  let master = await findIconComponent(concept);
  const bundled = CORE_ICONS[concept];

  // Self-heal stale bundled icons. findIconComponent reuses ANY existing
  // `<concept> · …` master, so once a file has seeded an icon it is frozen: a
  // later fix to the bundled art (e.g. `plus` used to be the "Add Circle"
  // glyph WITH a circle, now it's a bare plus) would never reach that file.
  // We stamp every seed with the exact SVG it came from; if a core concept's
  // master was seeded from DIFFERENT bundled art — or is a pre-stamp legacy
  // master (empty stamp) — and the caller isn't deliberately overriding with
  // opts.svg, refresh the master's content + name IN PLACE so every existing
  // instance updates too.
  if (master && bundled && !opts.svg) {
    const stamp = master.getPluginData(ICON_STAMP_KEY);
    if (!stamp.startsWith(CUSTOM_STAMP_PREFIX) && stamp !== bundled.svg) {
      reseedIconComponent(master, bundled.svg, `${concept} · ${bundled.name}`);
      master.setPluginData(ICON_STAMP_KEY, bundled.svg);
    }
  }

  if (!master) {
    // An explicit opts.svg/name override wins; otherwise fall back to the
    // bundled premade set. Only a concept that is NEITHER already-in-file,
    // NOR in the bundle, NOR given an explicit svg (e.g. a typo like 'x' or
    // 'message-circle') reaches the throw — which is correct: that IS an
    // unresolvable icon, and it's still recorded for _lint even if the
    // caller swallows the throw.
    const svg = opts.svg ?? bundled?.svg;
    const name = opts.name ?? bundled?.name;
    if (!svg || !name) {
      const message =
        `"${concept}" is not a premade core icon and no { svg, name } was given. ` +
        `Call get_core_icons (no filter) to see the ${Object.keys(CORE_ICONS).length} valid ` +
        `concept names — it's most likely a typo (e.g. "x" → "close", ` +
        `"message-circle" → "chat"). For a genuinely new concept, pass ` +
        `flaude.icon("${concept}", { svg, name }) so it seeds as a reusable ` +
        `component — do not hand-draw it with figma.createNodeFromSvg directly.`;
      failedIconLookups.push({ concept, message });
      throw new Error(message);
    }
    const page = getOrCreateIconsPage();
    const svgNode = figma.createNodeFromSvg(svg);
    master = figma.createComponent();
    master.name = `${concept} · ${name}`;
    master.resize(svgNode.width, svgNode.height);
    master.appendChild(svgNode);
    svgNode.x = 0;
    svgNode.y = 0;
    page.appendChild(master);
    // Stamp the source so future calls can detect a stale bundled icon and
    // self-heal it (see the self-heal block above). Custom overrides get a
    // distinct stamp so a bundle refresh never clobbers them.
    master.setPluginData(ICON_STAMP_KEY, opts.svg ? `${CUSTOM_STAMP_PREFIX}${name}` : svg);
  }

  const inst = master.createInstance();
  const size = opts.size ?? 24;
  inst.resize(size, size);
  if (opts.color) {
    const color = opts.color;
    // Recolor EVERY paint-bearing node in the subtree, not just direct
    // children. SVG-seeded icons (figma.createNodeFromSvg) nest their vectors
    // inside a wrapper frame/group, so a direct-children-only pass left those
    // vectors at their baked SVG color (observed: a blue Face ID icon rendered
    // black). findAll walks the whole instance subtree.
    const targets = [inst, ...inst.findAll(() => true)] as SceneNode[];
    for (const node of targets) {
      if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
        (node as GeometryMixin).strokes = node.strokes.map((s) => (s.type === 'SOLID' ? { ...s, color } : s));
      }
      if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
        (node as GeometryMixin).fills = node.fills.map((f) => (f.type === 'SOLID' ? { ...f, color } : f));
      }
    }
  }
  return inst;
}

// ── BRAND LOGO LIBRARY ────────────────────────────────────────────────────
// Same principle as the icon library: source a brand logo ONCE, bundle it into
// core-logos.json, and every user gets it with zero network lookups forever
// (the plugin sandbox can't fetch anyway). flaude.logo('apple') self-seeds a
// reusable component from the bundle and fills it with the brand color by
// default. A brand not in the bundle must be passed { svg, name } once AND
// added to core-logos.json so the save is permanent + public for all users.
interface CoreLogoEntry { slug: string; name: string; brandColor: string; svg: string; }
const CORE_LOGOS = coreLogosBundle as Record<string, CoreLogoEntry>;
const LOGOS_PAGE_NAME = '_Flaude Logos';

function getOrCreateLogosPage(): PageNode {
  const existing = figma.root.children.find(
    (p): p is PageNode => p.type === 'PAGE' && p.name === LOGOS_PAGE_NAME
  );
  if (existing) return existing;
  const page = figma.createPage();
  page.name = LOGOS_PAGE_NAME;
  return page;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export interface FlaudeLogoOptions {
  /** SVG + display name to seed a brand NOT in core-logos.json (source it once,
   * then also add it to the bundle so the save is permanent for all users). */
  svg?: string;
  name?: string;
  /** Brand hex used as the default fill; falls back to the bundled brandColor. */
  brandColor?: string;
  /** Rendered width in px (height scales to preserve the logo's aspect ratio). */
  size?: number;
  /** Explicit fill override (wins over brandColor) — e.g. white on a dark button. */
  color?: RGB;
  /** If true, do NOT apply the brand color — leave the glyph its default (black),
   * for cases where the surrounding UI sets the tint. */
  monochrome?: boolean;
}

/**
 * Self-seeding brand logo. Mirrors flaudeIcon: reuse an existing
 * `logo/<brand> · …` master, else seed one from the bundled SVG (or an explicit
 * opts.svg for a new brand). Stamped + self-healing via the SAME mechanism as
 * icons, so a corrected bundled logo propagates to already-seeded files.
 * Defaults the fill to the brand color; pass { color } to override (e.g. a
 * white Apple logo on a black "Continue with Apple" button).
 */
export async function flaudeLogo(brand: string, opts: FlaudeLogoOptions = {}): Promise<InstanceNode> {
  await figma.loadAllPagesAsync();
  const prefix = `logo/${brand} \u00b7 `;
  const matches = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  let master = (matches.find((c) => c.name.startsWith(prefix)) as ComponentNode | undefined) ?? null;
  const bundled = CORE_LOGOS[brand];

  // Self-heal a stale bundled logo master in place (see flaudeIcon for the
  // full rationale) so fixes to core-logos.json reach already-seeded files.
  if (master && bundled && !opts.svg) {
    const stamp = master.getPluginData(ICON_STAMP_KEY);
    if (!stamp.startsWith(CUSTOM_STAMP_PREFIX) && stamp !== bundled.svg) {
      reseedIconComponent(master, bundled.svg, `logo/${brand} \u00b7 ${bundled.name}`);
      master.setPluginData(ICON_STAMP_KEY, bundled.svg);
    }
  }

  if (!master) {
    const svg = opts.svg ?? bundled?.svg;
    const name = opts.name ?? bundled?.name;
    if (!svg || !name) {
      throw new Error(
        `"${brand}" is not a bundled brand logo and no { svg, name } was given. ` +
        `Bundled logos: ${Object.keys(CORE_LOGOS).join(', ')}. For a new brand, ` +
        `source its SVG once and pass flaude.logo("${brand}", { svg, name, brandColor }) ` +
        `— then add it to core-logos.json so it is SAVED for all users and never ` +
        `re-sourced.`
      );
    }
    const page = getOrCreateLogosPage();
    const svgNode = figma.createNodeFromSvg(svg);
    master = figma.createComponent();
    master.name = `logo/${brand} \u00b7 ${name}`;
    master.resize(svgNode.width, svgNode.height);
    master.appendChild(svgNode);
    svgNode.x = 0;
    svgNode.y = 0;
    page.appendChild(master);
    master.setPluginData(ICON_STAMP_KEY, opts.svg ? `${CUSTOM_STAMP_PREFIX}${name}` : svg);
  }

  const inst = master.createInstance();
  const size = opts.size ?? 24;
  const aspect = master.width === 0 ? 1 : master.height / master.width;
  inst.resize(size, Math.max(1, Math.round(size * aspect)));

  // Fill: explicit color wins; otherwise brand color unless monochrome.
  let fill: RGB | null = null;
  if (opts.color) fill = opts.color;
  else if (!opts.monochrome) {
    const hex = opts.brandColor ?? bundled?.brandColor;
    if (hex) fill = hexToRgb(hex);
  }
  if (fill) {
    const color = fill;
    const targets = [inst, ...inst.findAll(() => true)] as SceneNode[];
    for (const node of targets) {
      if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
        (node as GeometryMixin).fills = node.fills.map((f) => (f.type === 'SOLID' ? { ...f, color } : f));
      }
      if ('strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
        (node as GeometryMixin).strokes = node.strokes.map((s) => (s.type === 'SOLID' ? { ...s, color } : s));
      }
    }
  }
  return inst;
}

// ── CROP-FROM-REFERENCE ───────────────────────────────────────────────
// Root cause this kills: crops of real reference imagery (avatars, thumbnails)
// were placed by HAND-TYPING an imageTransform from eyeballed normalized
// offsets — so they repeatedly landed on the wrong part of the image (Telegram's
// avatars came out blank/half). analyze_reference now MEASURES the region box;
// this helper turns that measured box into the correct CROP transform so the
// numbers are never typed by hand. It also matches the region to the node's
// aspect ratio (COVER: center-crop, no distortion), and tags the node so the
// crop-related lints recognize it.

export interface FlaudeCropRegion { x: number; y: number; w: number; h: number }
export interface FlaudeCropOptions {
  /** Image hash to crop from. Either this or fromRef is required. */
  hash?: string;
  /** A REF frame whose first IMAGE fill supplies the hash (convenience). */
  fromRef?: SceneNode;
}

function refImageHash(node: SceneNode): string | null {
  if (!('fills' in node)) return null;
  const fills = (node as GeometryMixin).fills;
  if (!Array.isArray(fills)) return null;
  const img = fills.find((f) => f.type === 'IMAGE') as ImagePaint | undefined;
  return img?.imageHash ?? null;
}

/**
 * Fill `node` with the measured `region` of a reference image, cropped COVER
 * (fill the node, center-crop the region, preserve aspect — no stretch). The
 * region is the normalized {x,y,w,h} box from analyze_reference. Returns node.
 */
export async function flaudeCropFromReference(
  node: SceneNode & GeometryMixin,
  region: FlaudeCropRegion,
  opts: FlaudeCropOptions = {}
): Promise<SceneNode> {
  const hash = opts.hash ?? (opts.fromRef ? refImageHash(opts.fromRef) : null);
  if (!hash) {
    throw new Error(
      'flaude.crop needs an image: pass { hash } or { fromRef } (a REF frame with an image fill).'
    );
  }
  const image = figma.getImageByHash(hash);
  if (!image) throw new Error(`flaude.crop: no image for hash ${hash}`);
  const { width: imgW, height: imgH } = await image.getSizeAsync();

  // Match the region to the node's aspect ratio (COVER) so faces aren't
  // stretched. Work in image PIXELS, then convert back to normalized.
  const nodeAspect = node.height === 0 ? 1 : node.width / node.height;
  const regPxW = region.w * imgW;
  const regPxH = region.h * imgH;
  const regAspect = regPxH === 0 ? 1 : regPxW / regPxH;

  let { x, y, w, h } = region;
  if (regAspect > nodeAspect) {
    // region too wide — shrink width, keep height, recentre horizontally
    const newW = (regPxH * nodeAspect) / imgW;
    x = x + (w - newW) / 2;
    w = newW;
  } else {
    // region too tall — shrink height, keep width, recentre vertically
    const newH = (regPxW / nodeAspect) / imgH;
    y = y + (h - newH) / 2;
    h = newH;
  }
  // clamp inside the image
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));

  node.fills = [
    {
      type: 'IMAGE',
      imageHash: hash,
      scaleMode: 'CROP',
      imageTransform: [[w, 0, x], [0, h, y]],
    } as ImagePaint,
  ];
  node.setPluginData('flaude:refCrop', 'true');
  return node;
}

// ── LIST ROW ───────────────────────────────────────────────────────
// Root cause this kills (two recurring bugs, one source): list rows were built
// by ABSOLUTE-positioning every element with hand-typed x/y — so titles/times
// landed shifted right ("text on the right"), and per-row extras (drag handles)
// were added by a blanket `for every row` loop instead of per-row data (so
// handles appeared on ALL rows when the reference has them on 3). This builds a
// row as a real HORIZONTAL auto-layout — [leading | growing text column | time]
// with an optional right-edge handle — so spacing is COMPUTED, never typed, and
// every per-row extra is driven by explicit data. The correct path is now the
// short path, so hand-positioning a row is never the easy option.

export interface FlaudeRowOptions {
  /** Fixed row width (the list column width). */
  width: number;
  /** Fixed row height; omit to hug content. */
  height?: number;
  /** Leading node (avatar/icon), already built (e.g. via flaude.crop / logo). */
  leading?: SceneNode;
  title: string;
  /** Node placed immediately after the title (e.g. a verified check). */
  titleBadge?: SceneNode;
  /** Preview/subtitle lines under the title. */
  subtitle?: string[];
  /** Top-right timestamp. */
  time?: string;
  /** Node under the time (e.g. an unread-count pill). */
  trailingBadge?: SceneNode;
  /** PER-ROW: draw a right-edge drag handle. Must be set from reference data,
   * NOT a blanket loop — that is the bug this exists to prevent. */
  showHandle?: boolean;
  gap?: number;
  fontFamily?: string;
  titleSize?: number; titleColor?: RGB;
  subSize?: number; subColor?: RGB;
  timeColor?: RGB;
}

/** Build one list row as HORIZONTAL auto-layout with a growing text column, so
 * the timestamp is pushed to the true right edge by layout math (not a typed x)
 * and handles/badges come only from explicit per-row data. */
export async function flaudeListRow(opts: FlaudeRowOptions): Promise<FrameNode> {
  const fam = opts.fontFamily ?? 'Inter';
  for (const st of ['Regular', 'Medium', 'Semi Bold', 'Bold']) {
    try { await figma.loadFontAsync({ family: fam, style: st }); } catch { /* fall back */ }
  }
  const mk = (s: string, style: string, size: number, color: RGB): TextNode => {
    const t = figma.createText();
    t.fontName = { family: fam, style };
    t.fontSize = size;
    t.characters = s;
    t.fills = [{ type: 'SOLID', color }];
    return t;
  };

  const row = figma.createFrame();
  row.name = 'row';
  row.layoutMode = 'HORIZONTAL';
  row.counterAxisAlignItems = 'CENTER';
  row.itemSpacing = opts.gap ?? 12;
  row.fills = [];
  row.resize(opts.width, opts.height ?? 60);
  row.primaryAxisSizingMode = 'FIXED';
  row.counterAxisSizingMode = opts.height ? 'FIXED' : 'AUTO';

  if (opts.leading) row.appendChild(opts.leading);

  // Growing text column: fills the space between leading and the row's right
  // edge, so anything after it is pushed fully right.
  const content = figma.createFrame();
  content.name = 'text';
  content.layoutMode = 'VERTICAL';
  content.itemSpacing = 3;
  content.fills = [];
  content.primaryAxisSizingMode = 'AUTO';
  content.counterAxisSizingMode = 'AUTO';
  row.appendChild(content);
  content.layoutGrow = 1;

  // Top line: [title (+badge) grows] [time hugs right].
  const top = figma.createFrame();
  top.name = 'topline';
  top.layoutMode = 'HORIZONTAL';
  top.counterAxisAlignItems = 'CENTER';
  top.itemSpacing = 6;
  top.fills = [];
  top.counterAxisSizingMode = 'AUTO';
  content.appendChild(top);
  top.layoutAlign = 'STRETCH';

  const titleWrap = figma.createFrame();
  titleWrap.layoutMode = 'HORIZONTAL';
  titleWrap.counterAxisAlignItems = 'CENTER';
  titleWrap.itemSpacing = 5;
  titleWrap.fills = [];
  titleWrap.primaryAxisSizingMode = 'AUTO';
  titleWrap.counterAxisSizingMode = 'AUTO';
  top.appendChild(titleWrap);
  titleWrap.layoutGrow = 1;
  titleWrap.appendChild(mk(opts.title, 'Semi Bold', opts.titleSize ?? 16, opts.titleColor ?? { r: 0.07, g: 0.07, b: 0.07 }));
  if (opts.titleBadge) titleWrap.appendChild(opts.titleBadge);

  if (opts.time) top.appendChild(mk(opts.time, 'Regular', 12, opts.timeColor ?? { r: 0.66, g: 0.66, b: 0.67 }));

  for (const line of opts.subtitle ?? []) {
    content.appendChild(mk(line, 'Regular', opts.subSize ?? 14, opts.subColor ?? { r: 0.54, g: 0.54, b: 0.56 }));
  }
  if (opts.trailingBadge) content.appendChild(opts.trailingBadge);

  // Right-edge drag handle — vertically centered by the row's CENTER alignment.
  // Only when this row's data says so.
  if (opts.showHandle) {
    const h = figma.createFrame();
    h.name = 'handle';
    h.layoutMode = 'VERTICAL';
    h.itemSpacing = 3.5;
    h.fills = [];
    h.primaryAxisSizingMode = 'AUTO';
    h.counterAxisSizingMode = 'AUTO';
    for (let i = 0; i < 3; i++) {
      const ln = figma.createRectangle();
      ln.resize(16, 1.5);
      ln.fills = [{ type: 'SOLID', color: { r: 0.78, g: 0.78, b: 0.8 } }];
      h.appendChild(ln);
    }
    row.appendChild(h);
  }
  return row;
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

// Real, full Apple keyboard (with Suggestion bar + Emoji/Mic row), bundled
// with the plugin as a JSON_REST_V1 export (see keyboard-reconstruct.ts for
// why JSON instead of SVG: SVG would flatten real text/layer-structure).
// Works in ANY file, immediately — no manual per-file Figma setup required,
// unlike the earlier search-only approach. Search by name first (fast path,
// reuse if this file already seeded one); only reconstruct from the bundle
// if missing. Never hand-draw a keyboard with rectangles/text.
const KEYBOARD_LIGHT_NAME = 'ios-keyboard-full · Light';
const KEYBOARD_DARK_NAME = 'ios-keyboard-full · Dark';
const KEYBOARD_PAGE_NAME = '_Flaude iOS Kit';

async function findKeyboardComponent(name: string): Promise<ComponentNode | null> {
  await figma.loadAllPagesAsync();
  const matches = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  return (matches.find((c) => c.name === name) as ComponentNode | undefined) ?? null;
}

function getOrCreateKeyboardPage(): PageNode {
  const existing = figma.root.children.find(
    (p): p is PageNode => p.type === 'PAGE' && p.name === KEYBOARD_PAGE_NAME
  );
  if (existing) return existing;
  const page = figma.createPage();
  page.name = KEYBOARD_PAGE_NAME;
  return page;
}

export interface FlaudeKeyboardOptions {
  /** Default: 'Light'. Use 'Dark' on dark-background screens. */
  mode?: 'Light' | 'Dark';
}

/**
 * Instance of the real, full Apple keyboard component (with Suggestion bar +
 * Emoji/Mic row) — never a hand-drawn substitute, never a partial keyboard
 * missing the emoji/mic row. Bundled with the plugin, so it works in every
 * file: searches the current file first, and seeds a real reconstructed
 * component (once, idempotently) from the bundled export if missing.
 */
export async function flaudeKeyboard(opts: FlaudeKeyboardOptions = {}): Promise<InstanceNode> {
  const mode = opts.mode ?? 'Light';
  const name = mode === 'Dark' ? KEYBOARD_DARK_NAME : KEYBOARD_LIGHT_NAME;

  let master = await findKeyboardComponent(name);
  if (!master) {
    const exported = mode === 'Dark' ? keyboardDarkExport : keyboardLightExport;
    const page = getOrCreateKeyboardPage();
    master = await reconstructComponent(exported as never, page);
    master.name = name;
  }

  return master.createInstance();
}

/**
 * Everything exposed under the top-level `flaude.*` sandbox parameter.
 * Kept as a single object so command-handler.ts can pass it in one line.
 */
export const flaudeHelpers = {
  icon: flaudeIcon,
  logo: flaudeLogo,
  crop: flaudeCropFromReference,
  row: flaudeListRow,
  statusBar: flaudeStatusBar,
  homeIndicator: flaudeHomeIndicator,
  keyboard: flaudeKeyboard,
};
