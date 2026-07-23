/**
 * Flaude Layout DSL — plugin-side APPLIER (migration step 2b)
 * Lives in the flaude plugin next to command-handler.ts.
 *
 * Register in COMMAND_HANDLERS as:
 *   build_batch: (args) => applyBuildBatch(args as BuildBatch)
 *
 * Idempotency model:
 *  - Every DSL node maps to a Figma node carrying pluginData "flaude:dslId".
 *  - The screen frame carries "flaude:acked:<buildId>" = JSON array of applied
 *    batch indices. A re-sent batch that's already acked is skipped wholesale.
 *  - "upsert" is convergent: create-if-missing, then set ALL desired props.
 *    Applying it twice yields the same canvas.
 */

import type { BuildBatch, BatchAck, Op } from "./dsl-compiler-plan";
import { flaudeIcon, flaudeStatusBar, flaudeHomeIndicator } from "../tools/flaude-helpers";

/* ------------------------------------------------------------------ */
/* Token resolution (keep in sync with server TOKENS — or share pkg)   */
/* ------------------------------------------------------------------ */

const SPACING: Record<string, number> = Object.fromEntries(
  Array.from({ length: 25 }, (_, i) => [`s${i}`, i * 4])
);
const RADIUS: Record<string, number> = {
  r0: 0, r1: 4, r2: 8, r3: 12, r4: 16, r5: 24, r6: 32, rFull: 9999,
};

const DEVICES: Record<string, { w: number; h: number }> = {
  "iphone-15": { w: 393, h: 852 },
  "iphone-15-pro-max": { w: 430, h: 932 },
  "iphone-se": { w: 375, h: 667 },
};

interface TypeStyle { family: string; style: string; size: number; lineHeight: number }
const TYPE_STYLES: Record<string, TypeStyle> = {
  // Inter is the plugin's loadable default (SF Pro falls back to Inter).
  caption2:    { family: "Inter", style: "Regular",  size: 11, lineHeight: 13 },
  caption1:    { family: "Inter", style: "Regular",  size: 12, lineHeight: 16 },
  footnote:    { family: "Inter", style: "Regular",  size: 13, lineHeight: 18 },
  subheadline: { family: "Inter", style: "Regular",  size: 15, lineHeight: 20 },
  callout:     { family: "Inter", style: "Regular",  size: 16, lineHeight: 21 },
  body:        { family: "Inter", style: "Regular",  size: 17, lineHeight: 22 },
  headline:    { family: "Inter", style: "Semi Bold", size: 17, lineHeight: 22 },
  title3:      { family: "Inter", style: "Semi Bold", size: 20, lineHeight: 25 },
  title2:      { family: "Inter", style: "Bold",     size: 22, lineHeight: 28 },
  title1:      { family: "Inter", style: "Bold",     size: 28, lineHeight: 34 },
  largeTitle:  { family: "Inter", style: "Bold",     size: 34, lineHeight: 41 },
};

type Theme = "dark" | "light";
const COLOR_TABLE: Record<Theme, Record<string, RGBA>> = {
  dark: {
    "surface.base":    { r: 0.071, g: 0.071, b: 0.071, a: 1 },
    "surface.raised":  { r: 0.129, g: 0.129, b: 0.129, a: 1 },
    "surface.overlay": { r: 0.2,   g: 0.2,   b: 0.2,   a: 0.9 },
    "text.primary":    { r: 1,     g: 1,     b: 1,     a: 1 },
    "text.secondary":  { r: 0.702, g: 0.702, b: 0.702, a: 1 },
    "text.tertiary":   { r: 0.5,   g: 0.5,   b: 0.5,   a: 1 },
    "text.inverse":    { r: 0,     g: 0,     b: 0,     a: 1 },
    "accent.primary":  { r: 0.114, g: 0.725, b: 0.329, a: 1 },
    "accent.onPrimary":{ r: 0,     g: 0,     b: 0,     a: 1 },
    "border.subtle":   { r: 1,     g: 1,     b: 1,     a: 0.12 },
    "border.strong":   { r: 1,     g: 1,     b: 1,     a: 0.32 },
    "state.success":   { r: 0.2,   g: 0.78,  b: 0.35,  a: 1 },
    "state.warning":   { r: 1,     g: 0.8,   b: 0,     a: 1 },
    "state.error":     { r: 1,     g: 0.27,  b: 0.23,  a: 1 },
  },
  light: {
    "surface.base":    { r: 1,     g: 1,     b: 1,     a: 1 },
    "surface.raised":  { r: 0.965, g: 0.965, b: 0.965, a: 1 },
    "surface.overlay": { r: 0.9,   g: 0.9,   b: 0.9,   a: 0.9 },
    "text.primary":    { r: 0,     g: 0,     b: 0,     a: 1 },
    "text.secondary":  { r: 0.35,  g: 0.35,  b: 0.35,  a: 1 },
    "text.tertiary":   { r: 0.55,  g: 0.55,  b: 0.55,  a: 1 },
    "text.inverse":    { r: 1,     g: 1,     b: 1,     a: 1 },
    "accent.primary":  { r: 0.114, g: 0.725, b: 0.329, a: 1 },
    "accent.onPrimary":{ r: 1,     g: 1,     b: 1,     a: 1 },
    "border.subtle":   { r: 0,     g: 0,     b: 0,     a: 0.12 },
    "border.strong":   { r: 0,     g: 0,     b: 0,     a: 0.32 },
    "state.success":   { r: 0.2,   g: 0.65,  b: 0.32,  a: 1 },
    "state.warning":   { r: 0.85,  g: 0.65,  b: 0,     a: 1 },
    "state.error":     { r: 0.85,  g: 0.2,   b: 0.18,  a: 1 },
  },
};

const ELEVATION: Record<string, Effect[]> = {
  e0: [],
  e1: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.15 },
         offset: { x: 0, y: 1 }, radius: 3, spread: 0, visible: true, blendMode: "NORMAL" }],
  e2: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.2 },
         offset: { x: 0, y: 4 }, radius: 12, spread: 0, visible: true, blendMode: "NORMAL" }],
  e3: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.3 },
         offset: { x: 0, y: 8 }, radius: 24, spread: 0, visible: true, blendMode: "NORMAL" }],
};

function resolveColor(v: any, theme: Theme): RGBA {
  if (v && typeof v === "object" && "raw" in v) {
    const hex = (v.raw as string).replace("#", "");
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) : 1 };
  }
  return COLOR_TABLE[theme][v as string] ?? { r: 1, g: 0, b: 1, a: 1 }; // magenta = missing token, visible on canvas
}
function solidPaint(v: any, theme: Theme): SolidPaint {
  const c = resolveColor(v, theme);
  return { type: "SOLID", color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
}
function resolveSize(v: any): number {
  if (v && typeof v === "object" && "rawPx" in v) return v.rawPx as number;
  return SPACING[v as string] ?? 0;
}
function resolvePadding(p: any): [number, number, number, number] {
  if (!p) return [0, 0, 0, 0];
  if (typeof p === "string") { const n = resolveSize(p); return [n, n, n, n]; }
  if (p.length === 2) { const v = resolveSize(p[0]), h = resolveSize(p[1]); return [v, h, v, h]; }
  return [resolveSize(p[0]), resolveSize(p[1]), resolveSize(p[2]), resolveSize(p[3])];
}

/* ------------------------------------------------------------------ */
/* Reference image provider (ADAPT point 5)                            */
/* ------------------------------------------------------------------ */

/**
 * Wire this to reference storage at plugin init:
 *   setReferenceProvider(async (ref) => await loadReferenceBytes(ref));
 * `ref` is the optional per-image reference key from the schema; undefined
 * means "the screen's tracked reference". Unwired usage fails loudly into
 * the batch ack — never silently into a grey rect.
 */
let getReferenceBytes: (ref?: string) => Promise<Uint8Array> = async () => {
  throw new Error(
    "ADAPT: setReferenceProvider() not wired — connect reference storage before using image source {from:'ref'}"
  );
};
export function setReferenceProvider(fn: (ref?: string) => Promise<Uint8Array>) {
  getReferenceBytes = fn;
}

/** For images with h:"auto": derive height from aspect once width is known. */
function applyImageAspect(node: RectangleNode, p: any) {
  if (p.sizing?.h !== "auto" || !p.aspect) return;
  const [aw, ah] = String(p.aspect).split(":").map(Number);
  if (!aw || !ah) return;
  // Reading width triggers a synchronous layout recalc, so FILL is resolved.
  const w = node.width;
  node.resize(w, Math.round(w * (ah / aw)));
}

/* ------------------------------------------------------------------ */
/* Node registry (dslId -> Figma node)                                 */
/* ------------------------------------------------------------------ */

const PD_ID = "flaude:dslId";
const PD_SCREEN = "flaude:screenId";

function screenFrame(screenId: string): FrameNode | null {
  const found = figma.currentPage.findOne(
    (n) => n.type === "FRAME" && n.getPluginData(PD_SCREEN) === screenId
  );
  return (found as FrameNode) ?? null;
}
function findByDslId(root: FrameNode, dslId: string): SceneNode | null {
  if (root.getPluginData(PD_ID) === dslId) return root;
  return root.findOne((n) => n.getPluginData(PD_ID) === dslId);
}

/* ------------------------------------------------------------------ */
/* Op application                                                      */
/* ------------------------------------------------------------------ */

interface ApplyCtx { screen: FrameNode; theme: Theme }

async function applyScreenOp(op: Extract<Op, { op: "screen" }>): Promise<ApplyCtx> {
  let frame = screenFrame(op.id);
  const dev = DEVICES[op.device] ?? DEVICES["iphone-15"];
  if (!frame) {
    frame = figma.createFrame();
    frame.setPluginData(PD_SCREEN, op.id);
    frame.name = op.id;
    // place new screens to the right of existing content
    frame.x = figma.currentPage.children.reduce(
      (mx, n) => Math.max(mx, ("x" in n ? n.x + ("width" in n ? n.width : 0) : 0)), 0
    ) + 80;
  }
  frame.resize(dev.w, dev.h);
  frame.clipsContent = true;
  // The root DSL node IS this screen frame, and its upsert (which runs AFTER
  // this) turns it into an auto-layout frame. Chrome must be ABSOLUTE so the
  // root's vertical flow doesn't push it around — but `layoutPositioning =
  // ABSOLUTE` is only valid on a child of an auto-layout parent. So establish
  // auto-layout on the frame NOW; the root upsert re-confirms direction/props.
  if (frame.layoutMode === "NONE") frame.layoutMode = "VERTICAL";

  // Chrome injection (ADAPT wired): route to the self-seeding flaude helpers.
  // Each chrome node carries a stable PD_ID so re-running is idempotent and the
  // reviewer can reference it. Chrome is absolutely positioned so the root
  // auto-layout stack (which fills the frame) doesn't push it into the flow.
  // ensureChrome only CREATES + tags the chrome node (idempotent). Positioning
  // is owned solely by positionChrome(), which runs as the final build step
  // after all children are placed — so reflow can't knock chrome out of place
  // and the placement math lives in exactly ONE spot.
  const chrome = (op as any).chrome ?? {};
  const ensureChrome = async (
    dslId: string,
    want: boolean,
    make: () => Promise<SceneNode>
  ) => {
    const existing = frame!.findOne((n) => n.getPluginData(PD_ID) === dslId);
    if (!want) { existing?.remove(); return; }
    if (existing) return; // idempotent: already present
    const node = await make();
    node.setPluginData(PD_ID, dslId);
    frame!.appendChild(node);
    if ("layoutPositioning" in node) (node as SceneNode & LayoutMixin).layoutPositioning = "ABSOLUTE";
  };
  await ensureChrome("chrome-status-bar", !!chrome.statusBar, () => flaudeStatusBar());
  await ensureChrome("chrome-home-indicator", !!chrome.homeIndicator, () => flaudeHomeIndicator());
  positionChrome(frame);

  return { screen: frame, theme: (op.theme as Theme) ?? "dark" };
}

function applySizing(node: SceneNode & LayoutMixin, sizing: any, isRoot: boolean) {
  const map = (v: any): "FILL" | "HUG" | "FIXED" | null => {
    if (v === "fill") return "FILL";
    if (v === "hug") return "HUG";
    if (v === "auto") return "HUG";
    if (v && typeof v === "object" && "fixed" in v) return "FIXED";
    return null;
  };
  let w = map(sizing?.w), h = map(sizing?.h);
  // HUG is only valid on text nodes and auto-layout frames. For anything else
  // (rectangles/images, plain frames), downgrade to null — the node keeps its
  // explicit size. Image h:"auto" is handled separately via aspect (see
  // applyImageAspect), which is what "auto" means for images.
  const canHug =
    node.type === "TEXT" ||
    ("layoutMode" in node && (node as FrameNode).layoutMode !== "NONE");
  if (w === "HUG" && !canHug) w = null;
  if (h === "HUG" && !canHug) h = null;
  // layoutSizing* is only settable on auto-layout children/frames, and never
  // on absolutely-positioned nodes (overlays) — those take fixed sizes only.
  const isAbsolute = "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE";
  const inAutoLayout =
    node.parent && "layoutMode" in node.parent && (node.parent as FrameNode).layoutMode !== "NONE";
  const isAutoFrame = "layoutMode" in node && (node as FrameNode).layoutMode !== "NONE";
  if ((inAutoLayout || isAutoFrame) && !isRoot && !isAbsolute) {
    if (w) node.layoutSizingHorizontal = w;
    if (h) node.layoutSizingVertical = h;
  }
  if (sizing?.w && typeof sizing.w === "object" && "fixed" in sizing.w)
    node.resize(resolveSize(sizing.w.fixed), node.height);
  if (sizing?.h && typeof sizing.h === "object" && "fixed" in sizing.h)
    node.resize(node.width, resolveSize(sizing.h.fixed));
}

async function upsertNode(
  op: Extract<Op, { op: "upsert" }>,
  ctx: ApplyCtx
): Promise<void> {
  const { screen, theme } = ctx;
  const p = op.props as any;
  let node = op.parentId === null ? screen : findByDslId(screen, op.id);
  // Atomicity guard: figma.create*() immediately places the node on the page.
  // If any later step (parenting, props, overlay math) throws, an un-parented
  // node would leak as a loose 100x100 orphan. Track whether WE created it so
  // the catch below can remove it. The screen root is never "created" here.
  const preExisted = !!node;

  try {
  /* ---------- create if missing ---------- */
  if (!node) {
    switch (op.nodeType) {
      case "stack":
      case "spacer":
        node = figma.createFrame();
        break;
      case "text": {
        const style = TYPE_STYLES[p.style] ?? TYPE_STYLES.body;
        await figma.loadFontAsync({ family: style.family, style: style.style });
        node = figma.createText();
        break;
      }
      case "image": {
        node = figma.createRectangle();
        break;
      }
      case "icon": {
        // Icon (ADAPT wired): route to the self-seeding flaude.icon bundle.
        // DSL names are "namespace/name" (e.g. "brand/spotify"); the core-icon
        // concept is the part after the slash. A genuinely unknown concept
        // throws inside flaudeIcon (and is recorded for _lint) — fall back to a
        // visible placeholder frame so the build never hard-fails on one name.
        const concept = String(p.name).includes("/") ? String(p.name).split("/").pop()! : String(p.name);
        try {
          node = await flaudeIcon(concept, {
            size: resolveSize(p.size),
            color: resolveColor(p.color ?? "text.primary", theme),
          });
        } catch {
          node = figma.createFrame();
          (node as FrameNode).name = `icon:${p.name}`;
          (node as FrameNode).resize(resolveSize(p.size) || 24, resolveSize(p.size) || 24);
        }
        break;
      }
      case "component": {
        // ADAPT (migration step 3 — component registry): route refs to the kit.
        // Until then a visible, non-fatal placeholder frame so builds never
        // hard-fail on a missing ref.
        node = figma.createFrame();
        (node as FrameNode).name = `component:${p.ref}`;
        break;
      }
      default:
        throw new Error(`unknown nodeType "${op.nodeType}"`);
    }
    if (!node.name || node.type === "FRAME" || node.type === "TEXT")
      node.name = op.id;
  }

  // Tag the node with its DSL id ALWAYS — not only on create. The root node
  // is the pre-existing screen frame (never goes through create-if-missing),
  // so without this it would never carry PD_ID="root" and its children could
  // not resolve it as their parent via findByDslId.
  node.setPluginData(PD_ID, op.id);

  /* ---------- parent + order ---------- */
  if (op.parentId !== null) {
    const parent = findByDslId(screen, op.parentId);
    if (!parent || !("appendChild" in parent))
      throw new Error(`parent "${op.parentId}" not found for "${op.id}"`);
    const container = parent as FrameNode;
    const idx = Math.min(op.index, container.children.length);
    if (node.parent !== container || container.children.indexOf(node as SceneNode) !== idx) {
      container.insertChild(Math.min(idx, container.children.length), node as SceneNode);
    }
  }

  /* ---------- per-type props (declarative: set everything) ---------- */
  if (op.nodeType === "stack" || (op.parentId === null && node.type === "FRAME")) {
    const f = node as FrameNode;
    f.layoutMode = p.direction === "horizontal" ? "HORIZONTAL" : "VERTICAL";
    f.itemSpacing = resolveSize(p.gap ?? "s0");
    const [pt, pr, pb, pl] = resolvePadding(p.padding);
    f.paddingTop = pt; f.paddingRight = pr; f.paddingBottom = pb; f.paddingLeft = pl;
    const mainMap = { start: "MIN", center: "CENTER", end: "MAX", "space-between": "SPACE_BETWEEN" } as const;
    const crossMap = { start: "MIN", center: "CENTER", end: "MAX", stretch: "MIN" } as const;
    f.primaryAxisAlignItems = mainMap[(p.align?.main ?? "start") as keyof typeof mainMap];
    f.counterAxisAlignItems = crossMap[(p.align?.cross ?? "start") as keyof typeof crossMap];
    f.fills = p.fill ? [solidPaint(p.fill, theme)] : [];
    if (p.radius) f.cornerRadius = RADIUS[p.radius] ?? 0;
    f.strokes = p.stroke ? [solidPaint(p.stroke.color, theme)] : [];
    if (p.stroke) f.strokeWeight = p.stroke.weight;
    f.effects = ELEVATION[p.elevation ?? "e0"] ?? [];
    f.clipsContent = !!p.clip || op.parentId === null;
  }

  if (op.nodeType === "text") {
    const t = node as TextNode;
    const style = TYPE_STYLES[p.style] ?? TYPE_STYLES.body;
    await figma.loadFontAsync({ family: style.family, style: style.style });
    t.fontName = { family: style.family, style: style.style };
    t.fontSize = style.size;
    t.lineHeight = { value: style.lineHeight, unit: "PIXELS" };
    t.characters = p.content ?? "";
    t.fills = [solidPaint(p.color ?? "text.primary", theme)];
    t.textAlignHorizontal =
      p.align === "center" ? "CENTER" : p.align === "right" ? "RIGHT" : "LEFT";
    if (p.maxLines) { t.textTruncation = "ENDING"; t.maxLines = p.maxLines; }
    t.textAutoResize = "HEIGHT";
  }

  if (op.nodeType === "image") {
    const r = node as RectangleNode;
    if (p.radius) r.cornerRadius = RADIUS[p.radius] ?? 0;
    const src = p.source;
    if (src && typeof src === "object" && src.from === "ref") {
      // Crop-from-reference: load the FULL reference image once, express the
      // crop as a normalized CROP paint transform. One image hash serves every
      // crop from the same reference; revising a crop is a paint update only.
      const bytes = await getReferenceBytes(src.ref);
      const img = figma.createImage(bytes);
      const { width: W, height: H } = await img.getSizeAsync();
      const [cx, cy, cw, ch] = src.crop as [number, number, number, number];
      r.fills = [{
        type: "IMAGE",
        imageHash: img.hash,
        scaleMode: "CROP",
        imageTransform: [
          [cw / W, 0, cx / W],
          [0, ch / H, cy / H],
        ],
      }];
    } else {
      r.fills = [{ type: "SOLID", color: { r: 0.25, g: 0.25, b: 0.25 } }]; // placeholder
    }
  }

  if (op.nodeType === "spacer") {
    const f = node as FrameNode;
    f.fills = [];
    if (p.flex) {
      f.layoutGrow = 1;
    } else if (p.fixed) {
      const parentF = node.parent as FrameNode;
      const horiz = parentF.layoutMode === "HORIZONTAL";
      f.resize(horiz ? resolveSize(p.fixed) : 1, horiz ? 1 : resolveSize(p.fixed));
    }
  }

  /* ---------- sizing BEFORE overlay math (anchor needs real dims) ---------- */
  if (op.overlay) {
    // Must be set before sizing: absolute children reject FILL/HUG layoutSizing.
    (node as SceneNode & LayoutMixin).layoutPositioning = "ABSOLUTE";
  }
  applySizing(node as SceneNode & LayoutMixin, p.sizing, op.parentId === null);
  if (op.nodeType === "image") applyImageAspect(node as RectangleNode, p);
  if (op.parentId === null) {
    // root fills the screen frame exactly
    const f = node as FrameNode;
    f.x = 0; f.y = 0;
    f.resize(screen.width, screen.height);
  }

  /* ---------- overlays: anchor math with post-sizing dimensions ---------- */
  if (op.overlay) {
    const n = node as SceneNode & LayoutMixin;
    const parent = node.parent as FrameNode;
    const ox = resolveSize(op.overlay.offset?.x ?? "s0");
    const oy = resolveSize(op.overlay.offset?.y ?? "s0");
    const [va, ha] = op.overlay.anchor.split("-").length === 2
      ? (op.overlay.anchor.split("-") as [string, string])
      : ["center", "center"];
    const px = ha === "left" ? 0 : ha === "right" ? parent.width - n.width : (parent.width - n.width) / 2;
    const py = va === "top" ? 0 : va === "bottom" ? parent.height - n.height : (parent.height - n.height) / 2;
    n.x = px + ox;
    n.y = py + oy;
    if ("constraints" in n) {
      (n as ConstraintMixin).constraints = {
        horizontal: ha === "left" ? "MIN" : ha === "right" ? "MAX" : "CENTER",
        vertical:   va === "top" ? "MIN" : va === "bottom" ? "MAX" : "CENTER",
      };
    }
  }
  } catch (e) {
    // Roll back a partially-created node so a failed op can never orphan junk
    // onto the page. Only remove what THIS call created (not pre-existing nodes
    // and not the shared screen root).
    if (!preExisted && node && node !== screen && !(node as SceneNode).removed) {
      try { (node as SceneNode).remove(); } catch {}
    }
    throw e;
  }
}

function removeNode(op: Extract<Op, { op: "remove" }>, ctx: ApplyCtx) {
  const node = findByDslId(ctx.screen, op.id);
  node?.remove(); // absent = already removed = idempotent success
}

/**
 * Re-assert chrome (status bar / home indicator) absolute positions AFTER all
 * ops in the build are applied. Chrome is created in the screen op (first),
 * but every subsequent child insert reflows the auto-layout frame and can knock
 * an absolutely-positioned child back into the flow (observed: status bar
 * landing at the BOTTOM). Running this as the final step makes chrome position
 * deterministic regardless of reflow. Idempotent and cheap.
 */
function positionChrome(frame: FrameNode) {
  const specs: Array<[string, (n: SceneNode) => void]> = [
    ["chrome-status-bar", (n) => { n.x = 0; n.y = 0; }],
    ["chrome-home-indicator", (n) => { n.x = (frame.width - n.width) / 2; n.y = frame.height - n.height - 8; }],
  ];
  for (const [dslId, place] of specs) {
    const n = frame.findOne((x) => x.getPluginData(PD_ID) === dslId) as (SceneNode & LayoutMixin) | null;
    if (!n) continue;
    if ("layoutPositioning" in n) n.layoutPositioning = "ABSOLUTE";
    place(n);
  }
}

/* ------------------------------------------------------------------ */
/* Batch entry point                                                   */
/* ------------------------------------------------------------------ */

const ackKey = (buildId: string) => `flaude:acked:${buildId}`;

export const SCREEN_FRAME_MISSING = "SCREEN_FRAME_MISSING";

export async function applyBuildBatch(batch: BuildBatch): Promise<BatchAck> {
  const errors: BatchAck["errors"] = [];
  let applied = 0;
  let skipped = 0;

  // Resolve/refresh screen context. The "screen" op creates the frame; for
  // batches after the first, find it by screenId.
  let ctx: ApplyCtx | null = null;
  const existing = screenFrame(batch.screenId);
  if (existing) {
    ctx = {
      screen: existing,
      theme: (existing.getPluginData("flaude:theme") as Theme) || "dark",
    };
  }

  // Desync guard: server planned a diff against a prevSchema, but the canvas
  // has no frame for this screen and this batch won't create one (no "screen"
  // op). Silent success here would leave an empty canvas while the server
  // believes the build applied. Refuse with a sentinel; the server must
  // replan with prevSchema = null (full rebuild).
  if (!ctx && !batch.ops.some((o) => o.op === "screen")) {
    return {
      buildId: batch.buildId,
      batchIndex: batch.batchIndex,
      applied: 0,
      skipped: 0,
      errors: [{
        opIndex: -1,
        id: batch.screenId,
        message: `${SCREEN_FRAME_MISSING}: no frame for "${batch.screenId}" on this page — prevSchema is stale (frame deleted, file reopened, or wrong page). Replan with prevSchema=null.`,
      }],
    };
  }

  // Batch-level dedupe
  if (ctx) {
    const acked: number[] = JSON.parse(ctx.screen.getPluginData(ackKey(batch.buildId)) || "[]");
    if (acked.includes(batch.batchIndex)) {
      return { buildId: batch.buildId, batchIndex: batch.batchIndex,
               applied: 0, skipped: batch.ops.length, errors: [] };
    }
  }

  for (let i = 0; i < batch.ops.length; i++) {
    const op = batch.ops[i];
    try {
      if (op.op === "screen") {
        ctx = await applyScreenOp(op);
        ctx.screen.setPluginData("flaude:theme", op.theme);
        applied++;
      } else if (!ctx) {
        throw new Error(`no screen frame for "${batch.screenId}" — was the screen op lost?`);
      } else if (op.op === "upsert") {
        await upsertNode(op, ctx);
        applied++;
      } else if (op.op === "remove") {
        removeNode(op, ctx);
        applied++;
      }
    } catch (e) {
      errors.push({ opIndex: i, id: (op as any).id ?? "?", message: String(e) });
    }
  }

  // Record ack durably on the screen frame itself
  if (ctx && errors.length === 0) {
    const key = ackKey(batch.buildId);
    const acked: number[] = JSON.parse(ctx.screen.getPluginData(key) || "[]");
    acked.push(batch.batchIndex);
    ctx.screen.setPluginData(key, JSON.stringify(acked));
    if (batch.batchIndex === batch.totalBatches - 1) {
      // build complete: re-assert chrome positions (reflow-proof final pass),
      // then store nodeMap for the reviewer.
      positionChrome(ctx.screen);
      const map: Record<string, string> = {};
      ctx.screen.findAll((n) => !!n.getPluginData(PD_ID))
        .forEach((n) => { map[n.getPluginData(PD_ID)] = n.id; });
      map[batch.screenId] = ctx.screen.id;
      ctx.screen.setPluginData("flaude:nodeMap", JSON.stringify(map));
    }
  }

  return { buildId: batch.buildId, batchIndex: batch.batchIndex, applied, skipped, errors };
}
