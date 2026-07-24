/**
 * Structural Lint — always-on, deterministic defect detection for figma_execute.
 *
 * Prose rules ("use the icon library", "use seed_ios_kit", "call
 * make_hug_pill_button") are self-enforced: nothing stops an agent from
 * skipping the lookup step under time pressure, and nothing signals that it
 * did. This module runs AFTER every `figma_execute` call, unconditionally,
 * and reports structural evidence of the recurring defect classes we've hit
 * in production — so the warning shows up in the same tool result the agent
 * already has to read, instead of depending on the agent remembering to ask
 * for a check.
 *
 * This is advisory, not a hard block: `figma_execute` still returns the
 * agent's own result. Findings are appended as `_lint` alongside it.
 */

interface LintFinding {
  rule: string;
  nodeId: string;
  nodeName: string;
  message: string;
}

const ICON_MIN = 10;
const ICON_MAX = 40;

// Lowered from 28 to 24 so an emoji/mood-sized flat circle also trips the rule
// (root cause: Calm's "How are you feeling?" used a flat 26px yellow circle
// standing in for a real smiley glyph). A true small pagination dot is <20px,
// below this floor, so it's unaffected.
const AVATAR_MIN = 24;
const AVATAR_MAX = 140;

// { label, width, height, widthTolerance, heightTolerance } — matches the
// bundled iOS chrome components in flaude/src/plugin/tools/ios-kit-seed.ts
// and the Apple iOS Kit page ("_iOS Kit") already present in most files.
// Height tolerance is intentionally tight: a loose height window (e.g. +/-20
// on a 44px status bar) false-positives on ordinary ~24px page-title text
// labels that happen to span the full screen width.
const IOS_CHROME_DIMENSIONS: Array<{
  label: string;
  width: number;
  height: number;
  widthTolerance: number;
  heightTolerance: number;
}> = [
  { label: 'iOS keyboard', width: 402, height: 225, widthTolerance: 20, heightTolerance: 15 },
  { label: 'iOS status bar', width: 390, height: 44, widthTolerance: 20, heightTolerance: 6 },
  { label: 'iOS status bar', width: 393, height: 44, widthTolerance: 20, heightTolerance: 6 },
  { label: 'iOS home indicator pill', width: 134, height: 5, widthTolerance: 10, heightTolerance: 3 },
];

const BUTTON_NAME_PATTERN = /button|pill|btn|cta/i;
/** Names of docked bottom bars whose background should fill the safe area. */
const BOTTOM_BAR_NAME = /nav|tab.?bar|toolbar|footer|bottom.?bar|dock/i;

/** iOS bottom safe-area (home-indicator) inset in px. Mirrors the applier's
 * SAFE_AREA_BOTTOM so the lint threshold and the auto-inset agree. */
const SAFE_AREA_INSET = 34;

function within(actual: number, target: number, tolerance: number): boolean {
  return Math.abs(actual - target) <= tolerance;
}

/** One sRGB channel (0-1) to linear light, per WCAG relative-luminance. */
function channelToLinear(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * channelToLinear(rgb.r) +
    0.7152 * channelToLinear(rgb.g) +
    0.0722 * channelToLinear(rgb.b)
  );
}

/** WCAG contrast ratio between two colors: 1 (identical) .. 21 (black/white). */
function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** First opaque SOLID fill color of a node, or null (image/gradient/mixed/
 * fully-transparent fills give no determinable flat color). */
function firstSolidFill(node: SceneNode): RGB | null {
  if (!('fills' in node)) return null;
  const fills = node.fills;
  if (fills === figma.mixed || !Array.isArray(fills)) return null;
  for (const fill of fills) {
    if (fill.type === 'SOLID' && (fill.opacity === undefined || fill.opacity > 0.1) && fill.visible !== false) {
      return fill.color;
    }
  }
  return null;
}

/** The solid color visually BEHIND `text`: the nearest earlier-rendered sibling
 * shape it sits ≥90% inside, else the first ancestor with a solid fill. Returns
 * null when the background can't be determined as a flat color (e.g. it's an
 * image or gradient) — in which case contrast can't be judged and is skipped. */
function backgroundColorBehind(text: SceneNode): RGB | null {
  const parent = text.parent;
  if (parent && 'children' in parent) {
    const siblings = parent.children;
    const textIndex = siblings.indexOf(text as never);
    const tArea = text.width * text.height;
    if (tArea > 0) {
      for (let i = textIndex - 1; i >= 0; i--) {
        const s = siblings[i];
        if (s.type !== 'RECTANGLE' && s.type !== 'FRAME' && s.type !== 'ELLIPSE') continue;
        const ix = Math.max(text.x, s.x);
        const iy = Math.max(text.y, s.y);
        const ix2 = Math.min(text.x + text.width, s.x + s.width);
        const iy2 = Math.min(text.y + text.height, s.y + s.height);
        const overlap = Math.max(0, ix2 - ix) * Math.max(0, iy2 - iy);
        if (overlap / tArea >= 0.9) {
          // This is the nearest shape visually behind the text; it occludes
          // anything further back, so we decide here and STOP.
          if (!('fills' in s)) return null;
          const sf = s.fills;
          if (sf === figma.mixed || !Array.isArray(sf)) return null;
          const visible = sf.filter(
            (f) => f.visible !== false && (f.opacity === undefined || f.opacity > 0.1)
          );
          // Fully transparent shape doesn't actually occlude — keep looking behind it.
          if (visible.length === 0) continue;
          // A visible but non-solid background (gradient / image) can't be
          // reduced to one flat color, so a WCAG ratio is meaningless against
          // it — return null to SKIP the contrast check rather than falling
          // through to a distant ancestor and comparing the text against the
          // wrong color. That fall-through was a real bug: a white label on a
          // blue/purple GRADIENT button reported 1.00:1 "invisible" (white vs.
          // the white screen ancestor) and would have nagged on every
          // gradient button.
          return firstSolidFill(s);
        }
      }
    }
  }
  let ancestor: BaseNode | null = parent;
  let hops = 0;
  while (ancestor && hops < 6) {
    if ('fills' in ancestor) {
      const c = firstSolidFill(ancestor as SceneNode);
      if (c) return c;
    }
    ancestor = 'parent' in ancestor ? ancestor.parent : null;
    hops++;
  }
  return null;
}

function verticalCenter(node: SceneNode): number {
  return node.y + node.height / 2;
}

/** True if `node` itself, or any ancestor up to the page, is an INSTANCE —
 * i.e. this node is legitimately part of a real component's internals,
 * not something appended directly to a screen by hand. */
function isInsideInstance(node: BaseNode): boolean {
  let current: BaseNode | null = node;
  while (current) {
    if ('type' in current && current.type === 'INSTANCE') return true;
    current = 'parent' in current ? current.parent : null;
  }
  return false;
}

function hasFlatSolidFill(node: SceneNode): boolean {
  if (!('fills' in node)) return false;
  const fills = node.fills;
  if (fills === figma.mixed || !Array.isArray(fills) || fills.length !== 1) return false;
  return fills[0].type === 'SOLID';
}

function isShortInitials(t: BaseNode): boolean {
  if (t.type !== 'TEXT') return false;
  const chars = ((t as TextNode).characters || '').trim();
  return chars.length > 0 && chars.length <= 3;
}

/**
 * True if an avatar-sized shape has a short (≤3-char) text centered OVER it —
 * i.e. it's a deliberate INITIALS / letter avatar (a legitimate final design
 * that matches references which show letter avatars for contacts without a
 * photo), NOT a blank placeholder awaiting a real image. Without this, the
 * avatar-placeholder rule fired on every "EJ"/"TM" letter avatar and buried
 * the real signal (genuine blank photo-placeholders) under dozens of false
 * nudges. A true photo-placeholder has no centered initials — its name label
 * sits BELOW it (and is usually >3 chars), so it is still correctly flagged.
 */
function hasCenteredInitials(node: SceneNode): boolean {
  // Tolerance = how far the initials' center may sit from the avatar's center
  // and still count as "centered". 35% of the avatar's half-extent — wide
  // enough for real optical-centering nudges, tight enough to REJECT a short
  // label/badge parked at the avatar's edge or corner (which must NOT suppress
  // the placeholder warning). Earlier this used the full half-extent, i.e.
  // "anywhere inside the avatar", which was too permissive.
  const tolX = node.width * 0.35;
  const tolY = node.height * 0.35;

  // avatar-as-frame: initials are a child, compared in the avatar's LOCAL coords
  if ('children' in node) {
    for (const c of node.children) {
      if (!isShortInitials(c)) continue;
      const ccx = c.x + c.width / 2;
      const ccy = c.y + c.height / 2;
      if (Math.abs(ccx - node.width / 2) <= tolX && Math.abs(ccy - node.height / 2) <= tolY) {
        return true;
      }
    }
  }
  // avatar + separately-positioned initials sibling: compared in PARENT coords
  const parent = node.parent;
  if (parent && 'children' in parent) {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    for (const s of parent.children) {
      if (s === node || !isShortInitials(s)) continue;
      const scx = s.x + s.width / 2;
      const scy = s.y + s.height / 2;
      if (Math.abs(scx - cx) <= tolX && Math.abs(scy - cy) <= tolY) {
        return true;
      }
    }
  }
  return false;
}

function nearSquare(width: number, height: number): boolean {
  if (width === 0 || height === 0) return false;
  const ratio = width / height;
  return ratio > 0.75 && ratio < 1.34;
}

function hasImageFill(node: SceneNode): boolean {
  if (!('fills' in node)) return false;
  const fills = (node as GeometryMixin).fills;
  if (!Array.isArray(fills)) return false;
  return fills.some((f) => f.type === 'IMAGE' && f.visible !== false);
}

/**
 * Which sides of `node` have an adjacent sibling within a thin gutter (≤8px).
 * Gutter-aware so a real tiled composite (photo grid, stacked board
 * thumbnails, segmented cells) separated by a hairline gap still reads as
 * "these belong together". Used both to detect a tile group (avatar rule
 * exclusion) and to enforce composite corner geometry.
 */
function adjacentSides(
  node: SceneNode,
  opts: { imageOnly?: boolean } = {}
): { above: boolean; below: boolean; left: boolean; right: boolean } {
  const out = { above: false, below: false, left: false, right: false };
  const parent = node.parent;
  if (!parent || !('children' in parent)) return out;
  const GUTTER = 8; // max gap that still counts as one composite
  const OVERLAP_MIN = 8; // must share at least this much edge length
  const nx1 = node.x, ny1 = node.y, nx2 = node.x + node.width, ny2 = node.y + node.height;
  for (const s of parent.children as readonly SceneNode[]) {
    if (s === node || !('width' in s)) continue;
    if (opts.imageOnly && !hasImageFill(s)) continue;
    const sx1 = s.x, sy1 = s.y, sx2 = s.x + s.width, sy2 = s.y + s.height;
    const hOverlap = Math.min(nx2, sx2) - Math.max(nx1, sx1);
    const vOverlap = Math.min(ny2, sy2) - Math.max(ny1, sy1);
    if (hOverlap > OVERLAP_MIN) {
      if (sy2 <= ny1 && ny1 - sy2 <= GUTTER) out.above = true;
      if (sy1 >= ny2 && sy1 - ny2 <= GUTTER) out.below = true;
    }
    if (vOverlap > OVERLAP_MIN) {
      if (sx2 <= nx1 && nx1 - sx2 <= GUTTER) out.left = true;
      if (sx1 >= nx2 && sx1 - nx2 <= GUTTER) out.right = true;
    }
  }
  return out;
}

/**
 * Walk `root` (bounded like validate.js: skip invisible nodes, cap depth and
 * fan-out so SVG imports/vector art don't blow up the scan) looking for
 * structural evidence of the recurring defect classes.
 */
export function runStructuralLint(root: BaseNode, pageHasRefFrames: boolean): LintFinding[] {
  const findings: LintFinding[] = [];

  function visit(node: BaseNode, depth: number): void {
    if (depth > 10) return;
    if ('visible' in node && node.visible === false) return;
    if ('children' in node && node.children.length > 80) return;

    if ('width' in node && 'height' in node) {
      const sceneNode = node as SceneNode;
      const w = sceneNode.width;
      const h = sceneNode.height;

      // 1. Hand-drawn icon: icon-sized raw vector art, not part of any
      //    component instance. STRICT (not merely advisory), because the
      //    agreed model is: the 54 premade core concepts are ALWAYS reused
      //    from the library, and any concept we DON'T have is crafted AND
      //    seeded as a component so it's reused next time too. So a loose
      //    icon-sized vector that never became a component instance is always
      //    a defect — it's either a redraw of a premade icon (wrong: use
      //    flaude.icon) or a bespoke icon that wasn't seeded (wrong: seed it
      //    via flaude.icon(concept, { svg, name }) so it's a reusable
      //    component). Either way the fix is the same: it must be an instance.
      // STAR/POLYGON included: a raw createStar()/createPolygon() at icon size is
      // almost always a hand-drawn composite glyph (e.g. a verified badge built
      // from a star seal + a vector checkmark, which rendered malformed) — the
      // exact thing that must be a library component (flaude.icon('verified')).
      // ELLIPSE/LINE are excluded: they're legitimately loose at icon size as
      // dots (pagination, status, avatar bg) and dividers, so flagging them
      // would be noisy.
      if (
        (node.type === 'VECTOR' || node.type === 'GROUP' ||
         node.type === 'BOOLEAN_OPERATION' || node.type === 'STAR' ||
         node.type === 'POLYGON') &&
        w >= ICON_MIN && w <= ICON_MAX && h >= ICON_MIN && h <= ICON_MAX &&
        !isInsideInstance(node)
      ) {
        findings.push({
          rule: 'hand-drawn-icon',
          nodeId: sceneNode.id,
          nodeName: sceneNode.name,
          message: `Icon-sized ${node.type.toLowerCase()} "${sceneNode.name}" (${Math.round(w)}x${Math.round(h)}) is loose vector art, not a component instance. Reuse a premade concept via flaude.icon(concept) — call get_core_icons to see the premade set; never redraw one. If it's a genuinely new concept, still seed it as a component via flaude.icon(concept, { svg, name }) so it's reusable — don't leave a hand-drawn one-off loose on the screen.`,
        });
      }

      // 1b. Glyph not centered in its button/circle. THE EYE SKIPS THIS; the
      //     geometry can't. For an icon-sized node sitting inside a button-like
      //     container (a circle, or a rounded square 32–104px), the glyph's
      //     center must match the container's center within a tight tolerance.
      //     A visibly-off-center icon (observed: Tinder action-button glyphs
      //     28px / 25px off center on a 66px circle) reads as "broken" but is
      //     easy to slide past by eye — so measure it. Container is found as the
      //     icon's PARENT (if button-sized) OR a sibling ellipse/rounded-rect
      //     that contains the icon's center. Tolerance: > max(4px, 14% of the
      //     container size).
      if (
        (node.type === 'INSTANCE' || node.type === 'VECTOR' ||
         node.type === 'GROUP' || node.type === 'BOOLEAN_OPERATION' ||
         node.type === 'STAR' || node.type === 'TEXT') &&
        w >= ICON_MIN && w <= ICON_MAX && h >= ICON_MIN && h <= ICON_MAX
      ) {
        const icx = sceneNode.x + w / 2;
        const icy = sceneNode.y + h / 2;
        const isButtonish = (n: SceneNode): boolean => {
          if (n === sceneNode) return false;
          if (n.type === 'ELLIPSE') { /* circle */ }
          else if (n.type === 'RECTANGLE' || n.type === 'FRAME') {
            const r = (n as RectangleNode | FrameNode).cornerRadius;
            if (typeof r !== 'number' || r < 6) return false; // must be rounded
          } else return false;
          const bw = n.width, bh = n.height;
          if (bw < 32 || bw > 104 || bh < 32 || bh > 104) return false;
          // Must be roughly SQUARE. A circle/square icon-button is ~1:1 and
          // does center its glyph; a WIDE pill/chip (icon + label) is not a
          // centering container — its icon is intentionally left of the text, so
          // excluding wide containers avoids false-positiving those.
          const aspect = bh === 0 ? 99 : bw / bh;
          if (aspect < 0.72 || aspect > 1.4) return false;
          // container must be meaningfully bigger than the glyph (a real button)
          return bw >= w * 1.25 && bh >= h * 1.25;
        };
        // container = parent if button-sized, else a sibling that contains us
        let container: SceneNode | null = null;
        const parent = node.parent as SceneNode | null;
        if (parent && isButtonish(parent)) container = parent;
        else if (parent && 'children' in parent) {
          for (const sib of (parent as ChildrenMixin).children as readonly SceneNode[]) {
            if (!isButtonish(sib)) continue;
            // sibling's box must contain the glyph's center
            if (icx >= sib.x && icx <= sib.x + sib.width && icy >= sib.y && icy <= sib.y + sib.height) {
              container = sib; break;
            }
          }
        }
        if (container) {
          const isParent = container === parent;
          // for a parent container the glyph x/y are relative to it; for a
          // sibling they share the same coordinate space — normalize both to the
          // glyph-vs-container center offset.
          const ccx = isParent ? container.width / 2 : container.x + container.width / 2;
          const ccy = isParent ? container.height / 2 : container.y + container.height / 2;
          const gcx = isParent ? w / 2 + sceneNode.x : icx;
          const gcy = isParent ? h / 2 + sceneNode.y : icy;
          const offX = Math.abs(gcx - ccx);
          const offY = Math.abs(gcy - ccy);
          const tol = Math.max(4, container.width * 0.14);
          if (offX > tol || offY > tol) {
            findings.push({
              rule: 'glyph-not-centered-in-container',
              nodeId: sceneNode.id,
              nodeName: sceneNode.name,
              message: `Glyph "${sceneNode.name}" is off-center inside its ${container.width}×${container.height} ${container.type.toLowerCase()} by (${Math.round(offX)}, ${Math.round(offY)})px — tolerance ${Math.round(tol)}px. Icons inside buttons/circles must be centered: set the glyph x = container center − glyph.width/2 and y = container center − glyph.height/2. (This is a defect the eye slides past but is obvious once measured.)`,
            });
          }
        }
      }

      // 1c. Inconsistent icon sizes within one bar. A nav/tab/toolbar renders
      //     its icons at ONE size; a stray icon that's noticeably bigger or
      //     smaller than its siblings reads as broken but is easy to skip by
      //     eye (observed: nav icons that looked "too small" vs the reference).
      //     For a bar-like frame (wide, short, >=3 icon-instance children),
      //     flag any icon whose size deviates >20% from the sibling median.
      if (node.type === 'FRAME' && BOTTOM_BAR_NAME.test(sceneNode.name)) {
        const frame = node as FrameNode;
        const iconKids = frame.children.filter(
          (c) => (c.type === 'INSTANCE' || c.type === 'VECTOR' || c.type === 'GROUP') &&
            c.width >= ICON_MIN && c.width <= ICON_MAX + 8
        ) as SceneNode[];
        if (iconKids.length >= 3) {
          const sizes = iconKids.map((c) => c.width).sort((a, b) => a - b);
          const median = sizes[Math.floor(sizes.length / 2)];
          for (const ic of iconKids) {
            if (median > 0 && Math.abs(ic.width - median) / median > 0.2) {
              findings.push({
                rule: 'inconsistent-icon-size-in-bar',
                nodeId: ic.id,
                nodeName: ic.name,
                message: `Icon "${ic.name}" is ${Math.round(ic.width)}px but its sibling icons in "${sceneNode.name}" are ~${Math.round(median)}px — a bar renders all icons at ONE size. Resize it to ${Math.round(median)}px so the row is uniform. (Easy to skip by eye, obvious once measured.)`,
              });
            }
          }
        }
      }

      // 2. Hand-drawn iOS chrome: a node matching known status-bar/keyboard/
      //    home-indicator dimensions that isn't itself (or inside) an
      //    instance of the real seeded/bundled component. Bare TEXT nodes are
      //    excluded — a full-width page-title label is never chrome, and a
      //    tight height match alone isn't enough to rule that out.
      if (node.type !== 'TEXT' && !isInsideInstance(node)) {
        for (const chrome of IOS_CHROME_DIMENSIONS) {
          if (
            within(w, chrome.width, chrome.widthTolerance) &&
            within(h, chrome.height, chrome.heightTolerance)
          ) {
            findings.push({
              rule: 'hand-drawn-ios-chrome',
              nodeId: sceneNode.id,
              nodeName: sceneNode.name,
              message: `"${sceneNode.name}" (${Math.round(w)}x${Math.round(h)}) matches ${chrome.label} dimensions but is not a component instance — call seed_ios_kit or use the "_iOS Kit" page instead of hand-drawing iOS chrome.`,
            });
            break;
          }
        }
      }

      // 3. Button collapsed to hug BOTH axes: worth a second look whenever a
      //    button/pill/cta-named auto-layout frame hugs both axes — that's
      //    the exact configuration that silently no-ops a resize() call
      //    meant to force a fixed width (e.g. a full-width button).
      if (
        node.type === 'FRAME' &&
        'layoutMode' in node && node.layoutMode !== 'NONE' &&
        BUTTON_NAME_PATTERN.test(sceneNode.name) &&
        node.primaryAxisSizingMode === 'AUTO' &&
        node.counterAxisSizingMode === 'AUTO'
      ) {
        findings.push({
          rule: 'button-hug-both-axes',
          nodeId: sceneNode.id,
          nodeName: sceneNode.name,
          message: `Button-like frame "${sceneNode.name}" hugs BOTH axes (${Math.round(w)}x${Math.round(h)}) — if you intended a fixed width (e.g. a full-width button), any resize() call on this frame was silently ignored; explicitly set counterAxisSizingMode/primaryAxisSizingMode, or call make_hug_pill_button if hug-content is really what you want.`,
        });
      }

      // 4. Avatar-sized flat placeholder on a screen with a real reference
      //    image available — the reference may show a real photo.
      // A flat box that touches a real image tile (within a gutter) is part of
      // a photo composite — e.g. the empty grey slots in a Pinterest board
      // preview sit beside real pin photos. That's an intentional empty slot,
      // not a missing avatar, so it must NOT trip the avatar-placeholder rule.
      const adjImg = adjacentSides(sceneNode, { imageOnly: true });
      const inPhotoComposite = adjImg.above || adjImg.below || adjImg.left || adjImg.right;
      // A shape that CONTAINS a visible glyph/image/text child is a button or a
      // filled element, not an empty avatar placeholder (observed false-positive
      // storm: 73 hits on keyboard keys inside the keyboard instance and on
      // white action-button circles). Exclude those, and never descend into
      // component instances (keyboard keys, seeded chrome) — their internals are
      // never "missing avatars".
      const hasContentChild =
        'children' in node &&
        (node as ChildrenMixin).children.some(
          (c) => c.visible !== false &&
            (c.type === 'INSTANCE' || c.type === 'VECTOR' || c.type === 'GROUP' ||
             c.type === 'BOOLEAN_OPERATION' || c.type === 'TEXT' ||
             (('fills' in c) && Array.isArray((c as GeometryMixin).fills) &&
               (c as GeometryMixin).fills !== figma.mixed &&
               ((c as GeometryMixin).fills as readonly Paint[]).some((fp) => fp.type === 'IMAGE')))
        );
      if (
        pageHasRefFrames &&
        !isInsideInstance(node) &&
        (node.type === 'ELLIPSE' || node.type === 'RECTANGLE' || node.type === 'FRAME') &&
        w >= AVATAR_MIN && w <= AVATAR_MAX && h >= AVATAR_MIN && h <= AVATAR_MAX &&
        nearSquare(w, h) &&
        hasFlatSolidFill(sceneNode) &&
        !hasCenteredInitials(sceneNode) &&
        !inPhotoComposite &&
        !hasContentChild
      ) {
        findings.push({
          rule: 'avatar-placeholder',
          nodeId: sceneNode.id,
          nodeName: sceneNode.name,
          message: `Avatar/emoji-sized "${sceneNode.name}" (${Math.round(w)}x${Math.round(h)}) is a single flat fill — a primitive standing in for a real asset. Confirm the REF frame shows a blank circle here; if it shows a real photo, brand logo, or emoji/glyph, use a real image fill (flaude.logo for brands) or the actual glyph instead of a placeholder color.`,
        });
      }

      // 4b. Composite-tile INNER corners must be square. A tiled composite
      //     (photo grid, stacked board thumbnails, segmented cells) rounds
      //     ONLY its outer boundary; a corner that faces a neighbouring tile
      //     is square. Vision review can't reliably see a 4px corner, but the
      //     geometry is exact — so this is a deterministic rule. For each
      //     rounded corner whose meeting edges face an adjacent sibling (within
      //     an 8px gutter), report the exact per-corner zeroing fix.
      if (node.type === 'RECTANGLE') {
        const rect = node as RectangleNode;
        const tl = rect.topLeftRadius, tr = rect.topRightRadius;
        const bl = rect.bottomLeftRadius, br = rect.bottomRightRadius;
        const maxR = Math.max(tl, tr, bl, br);
        if (maxR >= 6 && w >= 20 && h >= 20) {
          const adj = adjacentSides(sceneNode);
          const fixes: string[] = [];
          if ((adj.above || adj.left) && tl > 0.5) fixes.push('topLeftRadius');
          if ((adj.above || adj.right) && tr > 0.5) fixes.push('topRightRadius');
          if ((adj.below || adj.left) && bl > 0.5) fixes.push('bottomLeftRadius');
          if ((adj.below || adj.right) && br > 0.5) fixes.push('bottomRightRadius');
          if (fixes.length) {
            findings.push({
              rule: 'composite-tile-inner-corner-rounded',
              nodeId: sceneNode.id,
              nodeName: sceneNode.name,
              message: `Tile "${sceneNode.name}" sits in a tiled composite (touches a sibling within an 8px gutter) but still rounds INNER corner(s) that face a neighbour: ${fixes.join(', ')}. A composite rounds ONLY its outer boundary — seams between tiles are square. FIX: set ${fixes.map((k) => `${k}=0`).join('; ')} on "${sceneNode.name}" (keep the outer corners at their current radius).`,
            });
          }
        }
      }

      // 5. Two-button "toggle track": an auto-layout wrapper with a visible
      //    border/stroke around exactly two button-like children reads as a
      //    single segmented toggle even when the reference shows two
      //    independent adjacent buttons.
      if (
        node.type === 'FRAME' &&
        'layoutMode' in node && node.layoutMode !== 'NONE' &&
        'children' in node && node.children.length === 2 &&
        'strokes' in node && Array.isArray(node.strokes) && node.strokes.length > 0
      ) {
        const bothLookLikeButtons = node.children.every(
          (child) =>
            (child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE') &&
            'findOne' in child &&
            (child as FrameNode).findOne((n) => n.type === 'TEXT') !== null
        );
        if (bothLookLikeButtons) {
          findings.push({
            rule: 'possible-toggle-track',
            nodeId: sceneNode.id,
            nodeName: sceneNode.name,
            message: `"${sceneNode.name}" wraps exactly 2 button-like children in a bordered frame — this reads as a single segmented toggle. If the reference shows two INDEPENDENT adjacent buttons (e.g. "Leave"/"Join"), don't wrap them in one bordered container.`,
          });
        }
      }

      // 6. Ungrouped label sitting on a background shape: a TEXT node (or an
      //    icon INSTANCE) whose bounding box sits almost entirely inside a
      //    sibling RECTANGLE/FRAME/ELLIPSE "background", with neither one
      //    actually parented into the other — they only line up because of
      //    matching x/y math. This is why a "button" or "row" can't be
      //    selected, moved, or transferred as ONE thing: its background and
      //    label are independent elements, not one Figma unit. Every
      //    background+label (or background+icon) pair that forms a single
      //    visual unit (button, row, badge, card) must be wrapped in its own
      //    FRAME or componentized — never left as loose positioned siblings
      //    of a large shared container (a screen, a list).
      //    Screen-root-sized containers are exempt: a whole screen legitimately
      //    contains many background+label pairs by ordinary page composition
      //    (e.g. a full-bleed header behind a title) — that's not the "can't
      //    select this button as one thing" defect this rule targets.
      const isScreenRootSized = w >= 350 && h >= 700;
      if ('children' in node && node.children.length >= 3 && !isScreenRootSized) {
        const shapeChildren = node.children.filter(
          (c): c is RectangleNode | FrameNode | EllipseNode =>
            c.type === 'RECTANGLE' || c.type === 'FRAME' || c.type === 'ELLIPSE'
        );
        const labelChildren = node.children.filter(
          (c): c is TextNode | InstanceNode => c.type === 'TEXT' || c.type === 'INSTANCE'
        );
        for (const label of labelChildren) {
          const labelArea = label.width * label.height;
          if (labelArea === 0) continue;
          const labelIndex = node.children.indexOf(label);
          for (const shape of shapeChildren) {
            if (node.children.indexOf(shape) >= labelIndex) continue; // shape must render behind the label
            const ix1 = Math.max(label.x, shape.x);
            const iy1 = Math.max(label.y, shape.y);
            const ix2 = Math.min(label.x + label.width, shape.x + shape.width);
            const iy2 = Math.min(label.y + label.height, shape.y + shape.height);
            const overlapArea = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
            if (overlapArea / labelArea >= 0.9) {
              findings.push({
                rule: 'ungrouped-label-over-shape',
                nodeId: label.id,
                nodeName: label.name,
                message: `"${label.name}" sits on top of sibling "${shape.name}" but they are only independent siblings, not grouped/parented together — wrap this background+label (or +icon) pair in its own FRAME, or make it a proper COMPONENT, so it can be selected, moved, and reused as ONE unit instead of two elements that only line up via matching x/y coordinates.`,
              });
              break;
            }
          }
        }
      }

      // 7. Effectively-invisible text: a TEXT node whose fill has near-zero
      //    contrast against the solid shape directly behind it (e.g. a dark
      //    initial on a near-black avatar — the "Connie R" defect). This is
      //    reference-free: unreadable on its own terms, no reference image
      //    needed to know it's wrong. Only solid-on-solid is judged;
      //    image/gradient/mixed backgrounds are skipped since a flat contrast
      //    ratio can't be computed there.
      if (node.type === 'TEXT' && !isInsideInstance(node)) {
        const textColor = firstSolidFill(sceneNode);
        if (textColor) {
          const bg = backgroundColorBehind(sceneNode);
          if (bg) {
            const ratio = contrastRatio(textColor, bg);
            if (ratio < 1.6) {
              findings.push({
                rule: 'low-contrast-text',
                nodeId: sceneNode.id,
                nodeName: sceneNode.name,
                message: `Text "${sceneNode.name}" has a contrast ratio of ${ratio.toFixed(2)}:1 against the shape directly behind it — that's effectively invisible (WCAG wants >=4.5:1 for body text; below ~1.6:1 can't be read at all). Change the text fill or the background color so it's actually visible.`,
              });
            }
          }
        }
      }

      // 8. Row cross-axis misalignment: an icon-like item and an adjacent,
      //    similar-height item that share a horizontal band but whose
      //    vertical CENTERS don't line up — the "leading icon / label /
      //    trailing chevron aren't centered to each other" defect that
      //    recurs when each element's y is hand-typed instead of centered on
      //    its neighbor (see center_on_sibling). Reference-free. Scoped tight
      //    to keep noise near zero: pairwise, both items small, heights
      //    within 1.6x (so a leading avatar legitimately centered on a
      //    two-line name+subtitle block is NOT compared against one line),
      //    side by side, and at least one item is icon-like. Flags at most
      //    once per container.
      if ('children' in node && node.children.length >= 2 && !isScreenRootSized && !isInsideInstance(node)) {
        const ROW_ITEM_MAX_H = 40;
        const CENTER_TOL = 8;
        const isIconLike = (c: SceneNode): boolean =>
          c.type === 'VECTOR' || c.type === 'INSTANCE' || c.type === 'GROUP' ||
          c.type === 'BOOLEAN_OPERATION';
        const kids = node.children.filter(
          (c): c is SceneNode =>
            'width' in c && 'height' in c && c.visible !== false &&
            c.height > 0 && c.height <= ROW_ITEM_MAX_H && c.width > 0
        );
        let flagged = false;
        for (let i = 0; i < kids.length && !flagged; i++) {
          for (let j = i + 1; j < kids.length && !flagged; j++) {
            const a = kids[i];
            const b = kids[j];
            if (!isIconLike(a) && !isIconLike(b)) continue;
            const hi = Math.max(a.height, b.height);
            const lo = Math.min(a.height, b.height);
            if (hi / lo > 1.6) continue; // not comparable-height — skip
            const hDisjoint = a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5;
            if (!hDisjoint) continue; // stacked, not side by side
            const vOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
            if (vOverlap < lo * 0.6) continue; // not on the same row band
            const spread = Math.abs(verticalCenter(a) - verticalCenter(b));
            if (spread > CENTER_TOL) {
              flagged = true;
              findings.push({
                rule: 'row-cross-axis-misalignment',
                nodeId: a.id,
                nodeName: node.name,
                message: `Row items "${a.name}" and "${b.name}" in "${node.name}" are side by side but their vertical centers differ by ${Math.round(spread)}px — they're not centered to each other. Use center_on_sibling so a row's icon/label/chevron share one vertical center instead of hand-typing each y.`,
              });
            }
          }
        }
      }

      // 9. Label not centered in its button: a button-like frame (solid-
      //    filled, short & wide, NOT auto-layout) whose SINGLE short text
      //    label sits off-center — the exact defect where a "Continue"/
      //    "Next" label was placed by a hand-typed y with textAlignVertical
      //    TOP, so it hugs the top of the pill with unequal padding. The
      //    pixel diff is blind to this (a few px of text offset is a tiny
      //    fraction of the image), so it needs its own structural check.
      //    FIX: make the label FILL the button and set textAlignHorizontal/
      //    textAlignVertical = CENTER — equal padding by construction,
      //    independent of font size — instead of hand-positioning the text.
      if (
        'children' in node &&
        node.type !== 'INSTANCE' &&
        (!('layoutMode' in node) || node.layoutMode === 'NONE') &&
        node.height > 0 && node.height <= 72 && node.width >= 80 && node.width > node.height &&
        !isInsideInstance(node)
      ) {
        const hasSolidFill =
          'fills' in node && Array.isArray(node.fills) &&
          node.fills.some((f) => f.type === 'SOLID' && (f.opacity === undefined || f.opacity > 0.3));
        const textKids = node.children.filter(
          (c): c is TextNode => c.type === 'TEXT' && c.visible !== false && (c.characters || '').trim().length > 0
        );
        if (hasSolidFill && textKids.length === 1 && (textKids[0].characters || '').length <= 24) {
          const label = textKids[0];
          const dyTop = label.y;
          const dyBottom = node.height - (label.y + label.height);
          const centerOffset = Math.abs(verticalCenter(label) - node.height / 2);
          // Only flag a MEANINGFUL asymmetry (>4px off-center AND top/bottom
          // padding differing by >6px) so a genuinely-centered label whose
          // text box is a hair off doesn't nag.
          if (centerOffset > 4 && Math.abs(dyTop - dyBottom) > 6) {
            // If the button ALSO has non-text children (e.g. a leading icon),
            // only advise the vertical fix — telling it to fill full width +
            // horizontally center would shove the label under the icon.
            const hasOtherChildren = node.children.length > 1;
            const fix = hasOtherChildren
              ? `set the label's textAlignVertical = CENTER and match its height to the button's height so it's vertically centered, instead of hand-typing its y`
              : `make the label FILL the button (resize to the button's width×height at x:0,y:0) with textAlignHorizontal & textAlignVertical = CENTER, so padding is equal by construction — don't hand-type the label's y`;
            findings.push({
              rule: 'label-not-centered-in-button',
              nodeId: label.id,
              nodeName: node.name,
              message: `Label "${label.characters}" in button "${node.name}" is off-center: ${Math.round(dyTop)}px padding above vs ${Math.round(dyBottom)}px below. ${fix}.`,
            });
          }
        }
      }

      // 10. Cropped keyboard/keypad: a bottom-anchored, full-width,
      //     keyboard-height IMAGE fill — i.e. a SCREENSHOT of the keyboard/
      //     numeric keypad pasted in, instead of using flaude.keyboard()
      //     (bundled QWERTY) or reconstructing a numeric keypad as real
      //     nodes (proven doable). The real keyboard helper returns a
      //     COMPONENT INSTANCE with children, never a flat image, so this
      //     only ever fires on an actual crop — not on the real keyboard.
      //     Cropping standard iOS chrome we can build is never allowed.
      if (
        node.type !== 'INSTANCE' &&
        'fills' in node && Array.isArray(node.fills) &&
        node.fills.some((f) => f.type === 'IMAGE' && f.visible !== false)
      ) {
        const parent = node.parent;
        const keyboardShaped = w >= 320 && h >= 200 && h <= 400;
        if (
          keyboardShaped && parent && 'width' in parent && 'height' in parent &&
          (parent as SceneNode).height >= 700
        ) {
          const pw = (parent as SceneNode).width;
          const ph = (parent as SceneNode).height;
          const bottomGap = ph - (node.y + h);
          if (bottomGap >= -8 && bottomGap <= 48 && w >= pw * 0.85) {
            findings.push({
              rule: 'cropped-keyboard',
              nodeId: sceneNode.id,
              nodeName: sceneNode.name,
              message: `"${sceneNode.name}" is a bottom-anchored ${Math.round(w)}×${Math.round(h)} IMAGE fill — a screenshot of a keyboard/keypad. NEVER crop the keyboard: call \`await flaude.keyboard({ mode: "Light" | "Dark" })\` for the bundled QWERTY keyboard, or reconstruct a numeric keypad as real nodes (each key a frame + centered text). Cropping standard iOS chrome you can build is not allowed.`,
            });
          }
        }
      }

      // 11. Content under home indicator: a bar docked to the frame bottom
      //     (composer / tab bar / toolbar) whose CONTENT isn't inset above the
      //     home indicator's safe-area strip, so the pill draws over the bar's
      //     controls (observed: WhatsApp composer icons under the pill). Fires
      //     only when a home indicator is actually present, and only on a
      //     bottom-flush bar with paddingBottom < the safe-area inset. The
      //     applier's reserveBottomSafeArea() prevents this when the layout has
      //     a flex region; this rule catches the cases it can't (no flex
      //     region, or freeform figma_execute builds that bypass the compiler).
      if (node.type === 'FRAME' && 'layoutMode' in node && node.layoutMode === 'VERTICAL') {
        const kids = node.children as SceneNode[];
        const hasHomeIndicator = kids.some((k) =>
          /home.?indicator/i.test(k.name) ||
          (within(k.width, 134, 12) && within(k.height, 5, 3)) ||
          (within(k.width, node.width, 8) && within(k.height, 34, 4) && /indicator/i.test(k.name))
        );
        if (hasHomeIndicator) {
          const inFlow = kids.filter(
            (k) => !('layoutPositioning' in k) || (k as SceneNode & LayoutMixin).layoutPositioning !== 'ABSOLUTE'
          );
          for (let i = inFlow.length - 1; i >= 0; i--) {
            const bar = inFlow[i];
            if (bar.type !== 'FRAME' || !('layoutMode' in bar) || bar.layoutMode === 'NONE') continue;
            if ((bar as FrameNode).layoutGrow > 0) continue; // flex region, not a bar
            const barFrame = bar as FrameNode;
            const bottomFlush = Math.abs((bar.y + bar.height) - node.height) <= 4;
            if (bottomFlush && barFrame.paddingBottom < SAFE_AREA_INSET) {
              findings.push({
                rule: 'content-under-home-indicator',
                nodeId: barFrame.id,
                nodeName: barFrame.name,
                message: `Bottom-docked bar "${barFrame.name}" has paddingBottom ${Math.round(barFrame.paddingBottom)}px but a home indicator sits in the bottom ${SAFE_AREA_INSET}px safe-area — the pill will draw over the bar's controls. Set paddingBottom >= ${SAFE_AREA_INSET} so the content insets above the indicator (the bar's background can still reach the bottom edge). A flexible sibling (layoutGrow) yields the space.`,
              });
            }
            break;
          }
        }
      }

      // 11b. Footer background must reach the bottom edge. A docked bottom bar
      //      (nav / tab bar / toolbar / footer) whose BACKGROUND stops short of
      //      the screen's bottom edge leaves the frame background (usually
      //      white) showing in the safe-area strip under the home indicator —
      //      so a gray footer gets an ugly white band beneath it. The bar's
      //      background should extend to the bottom edge and the safe-area gap
      //      should be INTERNAL padding (content inset up), so the footer's own
      //      color fills behind the pill. Complements rule 11 (which handles
      //      content inset); this one is about background REACH, and unlike 11
      //      it also catches absolutely-positioned / freeform footers.
      if (
        node.type === 'FRAME' &&
        BOTTOM_BAR_NAME.test(sceneNode.name) &&
        hasFlatSolidFill(sceneNode)
      ) {
        const parent = node.parent;
        if (parent && 'height' in parent && 'width' in parent) {
          const screen = parent as SceneNode & ChildrenMixin;
          const isScreenSized = within(screen.width, 393, 60) && screen.height >= 700;
          const barBottom = sceneNode.y + h;
          const gap = screen.height - barBottom;
          const isWide = w >= screen.width * 0.85;
          const hasHi = (screen.children as SceneNode[]).some(
            (k) => /home.?indicator/i.test(k.name) || (within(k.width, 134, 14) && within(k.height, 5, 4))
          );
          // Fires when the bar is wide, docked low, a home indicator exists,
          // and the background leaves a visible strip (gap 4–60px) below it.
          if (isScreenSized && isWide && hasHi && gap > 4 && gap < 60) {
            findings.push({
              rule: 'footer-background-not-reaching-bottom-edge',
              nodeId: sceneNode.id,
              nodeName: sceneNode.name,
              message: `Footer/nav bar "${sceneNode.name}" ends ${Math.round(gap)}px above the screen bottom, so the frame background shows through in the home-indicator safe area (e.g. a white strip under a gray footer). FIX: extend its background to the bottom edge — resize height +${Math.round(gap)} (keep y) so bottom = ${Math.round(screen.height)}, and add paddingBottom ≈ ${SAFE_AREA_INSET} so the controls stay inset above the pill. The footer's own color then fills behind the home indicator.`,
            });
          }
        }
      }

      // 12. Crop band duplicates reconstructed chrome: a reference-crop image
      //     node (tagged flaude:refCrop) whose bounds contain a RECONSTRUCTED
      //     chrome node (status bar / home indicator instance, or a close 'X')
      //     — the crop almost certainly already shows that chrome, so the
      //     reconstructed one is a DUPLICATE (observed: double 9:41 status bar
      //     when a header band was cropped AND a status-bar instance overlaid;
      //     double X when a top illustration band was cropped AND an X rebuilt).
      //     Graduated from the flywheel (ruleClass
      //     'crop-band-duplicates-reconstructed-chrome'). Fix: either crop below
      //     the chrome, or drop the reconstructed chrome and keep the crop's.
      if (node.type === 'FRAME') {
        const frame = node as FrameNode;
        const crops = frame.findAll(
          (n) => n.getPluginData('flaude:refCrop') === 'true' && !!(n as SceneNode).absoluteBoundingBox
        ) as SceneNode[];
        if (crops.length) {
          const isReconstructedChrome = (n: SceneNode): boolean => {
            if (n.getPluginData('flaude:refCrop') === 'true') return false; // it's part of a crop, not reconstructed
            const name = n.name.toLowerCase();
            if (/status.?bar|home.?indicator/.test(name)) return true;
            if (n.type === 'TEXT') {
              const ch = (n as TextNode).characters.trim();
              // a lone close glyph or the 9:41 clock
              if (ch === '\u2715' || ch === '\u2716' || ch === '\u00d7' || ch === 'x' || /^9:41$/.test(ch)) return true;
            }
            return false;
          };
          const chromeNodes = frame.findAll(
            (n) => isReconstructedChrome(n as SceneNode) && !!(n as SceneNode).absoluteBoundingBox
          ) as SceneNode[];
          for (const chrome of chromeNodes) {
            const cb = chrome.absoluteBoundingBox!;
            for (const crop of crops) {
              const kb = crop.absoluteBoundingBox!;
              const ix = Math.max(0, Math.min(cb.x + cb.width, kb.x + kb.width) - Math.max(cb.x, kb.x));
              const iy = Math.max(0, Math.min(cb.y + cb.height, kb.y + kb.height) - Math.max(cb.y, kb.y));
              const overlap = ix * iy;
              const chromeArea = cb.width * cb.height || 1;
              if (overlap / chromeArea >= 0.6) {
                findings.push({
                  rule: 'crop-band-duplicates-reconstructed-chrome',
                  nodeId: chrome.id,
                  nodeName: chrome.name,
                  message: `Reconstructed chrome "${chrome.name}" sits inside reference-crop "${crop.name}" (${Math.round((overlap / chromeArea) * 100)}% overlap). The crop almost certainly already shows this element, so you now have a DUPLICATE (e.g. two status bars / two close buttons). Fix: either crop the reference BELOW this chrome, or delete the reconstructed node and let the crop provide it.`,
                });
                break;
              }
            }
          }
        }
      }

      // 13. Unjustified reference crop: an image node CROPPED out of the
      //     reference screenshot (flaude:refCrop) with no valid reason. This is
      //     the "screenshot everything" anti-pattern — photocopying a slice of
      //     the reference instead of building the app. Generic imagery (a
      //     person, food, a place, an avatar) must be a REAL sourced stock
      //     image (flaude.image), NOT a crop of the reference. Cropping is
      //     ONLY legitimate for genuinely irreproducible brand-specific content
      //     (a brand poster, AI art, a specific illustration) AND must be
      //     justified via flaude.crop(node, region, { reason }). Any refCrop
      //     tagged UNJUSTIFIED (or missing a reason) is flagged here.
      if (
        (node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'FRAME') &&
        sceneNode.getPluginData('flaude:refCrop') === 'true'
      ) {
        const reason = sceneNode.getPluginData('flaude:refCropReason');
        const VALID = ['brand-poster', 'ai-art', 'illustration', 'logo-mark', 'irreproducible'];
        if (!reason || reason === 'UNJUSTIFIED' || !VALID.includes(reason)) {
          findings.push({
            rule: 'reference-crop-unjustified',
            nodeId: sceneNode.id,
            nodeName: sceneNode.name,
            message: `"${sceneNode.name}" is a CROP of the reference screenshot with no valid reason — this is photocopying, not building. If it's generic imagery (a person, food, a place, an avatar), source a REAL stock image (curl one, e.g. from Unsplash, upload it, and use flaude.image) instead of slicing the reference. Cropping is ONLY for genuinely irreproducible brand-specific content (brand poster / AI art / specific illustration) — and then you must justify it: flaude.crop(node, region, { reason: 'brand-poster' | 'ai-art' | 'illustration' | 'logo-mark' | 'irreproducible' }).`,
          });
        }
      }
    }

    if ('children' in node) {
      for (const child of node.children) visit(child, depth + 1);
    }
  }

  visit(root, 0);
  return findings;
}
