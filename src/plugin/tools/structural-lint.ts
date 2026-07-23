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

const AVATAR_MIN = 28;
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

function nearSquare(width: number, height: number): boolean {
  if (width === 0 || height === 0) return false;
  const ratio = width / height;
  return ratio > 0.75 && ratio < 1.34;
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
      if (
        (node.type === 'VECTOR' || node.type === 'GROUP' || node.type === 'BOOLEAN_OPERATION') &&
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
      if (
        pageHasRefFrames &&
        (node.type === 'ELLIPSE' || node.type === 'RECTANGLE' || node.type === 'FRAME') &&
        w >= AVATAR_MIN && w <= AVATAR_MAX && h >= AVATAR_MIN && h <= AVATAR_MAX &&
        nearSquare(w, h) &&
        hasFlatSolidFill(sceneNode)
      ) {
        findings.push({
          rule: 'avatar-placeholder',
          nodeId: sceneNode.id,
          nodeName: sceneNode.name,
          message: `Avatar-sized "${sceneNode.name}" (${Math.round(w)}x${Math.round(h)}) has a single flat fill — confirm the REF frame actually shows a blank avatar here; if it shows a real photo/logo, use a real image fill instead of a placeholder color.`,
        });
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
    }

    if ('children' in node) {
      for (const child of node.children) visit(child, depth + 1);
    }
  }

  visit(root, 0);
  return findings;
}
