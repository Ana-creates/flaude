/**
 * Reference-capture tracking — "did you actually look at the REF image
 * before building this screen?"
 *
 * Root cause tonight: screens were repeatedly built from a flow's text
 * metadata instead of its `REF / <ScreenName>` reference screenshot. This
 * module makes that omission visible automatically instead of depending on
 * the agent remembering to call figma_screenshot on the reference first.
 *
 * Session-scoped at the PLUGIN's module level (not the MCP server's
 * per-connection map) — it resets exactly when the plugin reloads, which is
 * the correct boundary for "have I looked at this REF in this editing
 * session", and needs no extra network round-trip to introspect page state
 * (the plugin already has direct access to Figma nodes).
 */

const capturedRefFrameIds = new Set<string>();

/** Call this whenever `screenshot` targets a node \u2014 records it if it's a
 * `REF / ...` frame so later figma_execute calls know it's been looked at. */
export function recordScreenshot(node: { id: string; name: string }): void {
  if (node.name.startsWith('REF /')) {
    capturedRefFrameIds.add(node.id);
  }
}

// Root cause (production incident): a screen was built with circular
// buttons where the reference clearly showed rounded rectangles. The agent
// HAD screenshotted both the reference and its own built output \u2014 the
// existing built-without-reference-capture check would have passed \u2014 and
// still missed the defect, because "eyeball two screenshots side by side"
// is unreliable for exactly this class of drift (easy to miss by eye, easy
// to catch with a real per-pixel diff). The `compare_to_reference` MCP tool
// exists precisely to replace that eyeball judgment with a deterministic
// pixelmatch score \u2014 but nothing forced it to actually be called; under
// batching pressure it was skipped entirely for all 5 screens in that pass.
//
// `compare_to_reference` runs on the MCP server (pixelmatch lives in Node,
// not the plugin sandbox), but it calls the SAME plugin `screenshot`
// command twice (once per node) to fetch the pixels it diffs. Piggybacking
// a `comparePairKey` marker on those two calls lets the plugin \u2014 which
// otherwise has no visibility into what the MCP server did with the bytes
// it returned \u2014 record that a REAL pixel comparison happened for this
// specific (ref, built) pair, not just that someone looked at each image.
const comparedPairKeys = new Set<string>();

/** Call this whenever `screenshot` is invoked with a `comparePairKey` param
 * (set by `compare_to_reference`, never by a plain figma_screenshot call). */
export function recordComparisonMarker(pairKey: string): void {
  comparedPairKeys.add(pairKey);
}

// The BINDING fidelity verdict per (ref, built) pair, set by the Pro
// compare_to_reference tool (via the record_diff_result command) from the
// code-computed PASS/FAIL — NOT from any narration. This is the mechanism that
// stops "grading against my own previous build": while a pair's last verdict is
// FAIL, the screen is not done, full stop, and no prose can override it.
const pairVerdict = new Map<string, { mismatch: number; pass: boolean }>();

/** Mirrors FIDELITY_THRESHOLD in the Pro image-diff module (the authority that
 * actually computes PASS/FAIL). Used here only for the lint MESSAGE text; the
 * pass/fail decision itself always comes from recordDiffResult, never recomputed
 * here, so the two can't disagree on the verdict. */
const FIDELITY_BAR_PCT = 8;

/** Record a real pixel-diff RESULT (not just that it ran) for a pair. Called by
 * the record_diff_result command that Pro invokes after compareImages. */
export function recordDiffResult(pairKey: string, mismatch: number, pass: boolean): void {
  comparedPairKeys.add(pairKey);
  pairVerdict.set(pairKey, { mismatch, pass });
}

// Root cause (this session): 20 app screens were built and called "done"
// while ~80% were placeholder-fidelity — flat gradient tiles where the
// reference showed real imagery (Pinterest board collages), solid-color
// circles where it showed profile photos, wrong brand colors. The pixel-diff
// gate exists but a VISUAL review — the only thing that catches "this doesn't
// look like the app" — was never mechanically required: running the reviewer
// was an optional agent call, so under "build 10, don't stop" pressure it was
// skipped for every screen. This set mirrors comparedPairKeys: a review PASS
// is recorded per (ref, built) pair only when the review→fix loop has actually
// run and resolved (or accepted) the screen — never by merely screenshotting.
const reviewedPairKeys = new Set<string>();

/** Record that the review→fix loop completed for this (ref, built) pair.
 * Set ONLY by the `record_review_pass` command (which the review orchestration
 * calls after the reviewer ran and its fixes were applied / it returned
 * MATCH) — never by a plain screenshot. This is what clears the
 * `built-without-review` gate for a screen. */
export function recordReviewMarker(pairKey: string): void {
  reviewedPairKeys.add(pairKey);
}

/** pluginData key on a REF frame holding its deterministically-measured
 * content-region count (from the Pro `analyze_reference` tool, written via the
 * `stamp_reference_analysis` command). Lets the plugin-side lint compare a
 * build's element count against how much the reference actually contains,
 * without the plugin needing image libraries. */
export const REF_REGIONS_KEY = 'flaude:refRegionCount';

/** Count "content elements" in a built screen subtree: a rough, deterministic
 * proxy for "how many distinct things are on this screen", comparable to the
 * reference's measured regionCount. Counts visible TEXT nodes, image-filled
 * shapes, and leaf vector/shape nodes with a real fill; skips pure layout
 * frames, chrome (status bar / home indicator), and containers. */
function countContentElements(root: SceneNode): number {
  let n = 0;
  const CHROME = /status.?bar|home.?indicator/i;
  const walk = (node: SceneNode, depth: number) => {
    if (depth > 8) return;
    if ('visible' in node && node.visible === false) return;
    if (CHROME.test(node.name)) return; // chrome isn't "content"
    if (node.type === 'TEXT') { n++; return; }
    const fills = 'fills' in node ? (node as GeometryMixin).fills : null;
    const hasImage = Array.isArray(fills) && fills.some((f) => f.type === 'IMAGE' && f.visible !== false);
    if (hasImage) { n++; return; } // an image tile is one content element
    const isLeafShape =
      node.type === 'VECTOR' || node.type === 'ELLIPSE' || node.type === 'POLYGON' ||
      node.type === 'STAR' || node.type === 'LINE' ||
      (node.type === 'RECTANGLE' && Array.isArray(fills) && fills.length > 0) ||
      node.type === 'INSTANCE';
    // An instance/leaf shape is ONE content element — count it and stop, so an
    // icon instance isn't double-counted as 1 + all its inner vectors.
    if (isLeafShape) { n++; return; }
    if ('children' in node) for (const c of node.children as readonly SceneNode[]) walk(c, depth + 1);
  };
  if ('children' in root) for (const c of root.children as readonly SceneNode[]) walk(c, 0);
  return n;
}

export interface ReferenceCaptureFinding {
  rule: 'built-without-reference-capture';
  builtNodeId: string;
  builtNodeName: string;
  refNodeId: string;
  refNodeName: string;
  message: string;
}

/**
 * Compare `page`'s top-level children before/after a figma_execute call
 * (`beforeIds` is the snapshot taken BEFORE the agent's code ran) and flag
 * any newly-created `<AppName> / <ScreenName>` frame/component whose sibling
 * `REF / <ScreenName>` exists on the page but was never screenshotted this
 * session.
 */
export function checkReferenceCaptured(
  page: PageNode,
  beforeIds: ReadonlySet<string>
): ReferenceCaptureFinding[] {
  const findings: ReferenceCaptureFinding[] = [];

  const refByScreenName = new Map<string, { id: string; name: string }>();
  for (const child of page.children) {
    if (child.name.startsWith('REF /')) {
      const screenName = child.name.slice('REF /'.length).trim();
      refByScreenName.set(screenName, { id: child.id, name: child.name });
    }
  }
  if (refByScreenName.size === 0) return findings; // nothing to cross-check

  for (const child of page.children) {
    if (beforeIds.has(child.id)) continue; // not new this call
    if (child.type !== 'FRAME' && child.type !== 'COMPONENT') continue;
    if (child.name.startsWith('REF /')) continue;

    const separatorIndex = child.name.indexOf(' / ');
    if (separatorIndex === -1) continue;
    const screenName = child.name.slice(separatorIndex + 3).trim();

    const ref = refByScreenName.get(screenName);
    if (!ref) continue; // no matching REF frame for this screen name
    if (capturedRefFrameIds.has(ref.id)) continue; // already looked at it

    findings.push({
      rule: 'built-without-reference-capture',
      builtNodeId: child.id,
      builtNodeName: child.name,
      refNodeId: ref.id,
      refNodeName: ref.name,
      message: `\u26a0\ufe0f BUILT WITHOUT CAPTURING REFERENCE \u2014 "${child.name}" was created but "${ref.name}" was never screenshotted this session. Call figma_screenshot on "${ref.name}" (id ${ref.id}) and compare pixel-by-pixel before trusting this screen; REFERENCE-MATCH MODE requires holding the reference image, not building from the flow's text metadata.`,
    });
  }

  return findings;
}

export interface PixelDiffMissingFinding {
  rule: 'built-without-pixel-diff';
  builtNodeId: string;
  builtNodeName: string;
  refNodeId: string;
  refNodeName: string;
  message: string;
}

/**
 * Scan ALL `<AppName> / <ScreenName>` frames currently on `page` (not just
 * ones created THIS call \u2014 a real pixel diff naturally happens in a
 * separate, later figma_execute/compare_to_reference round-trip, after the
 * screen already exists) and flag any whose matching `REF / <ScreenName>`
 * sibling exists but was never actually diffed against it via
 * `compare_to_reference` this session. Catches defects (wrong shape, wrong
 * corner radius, wrong color) that survive an eyeball comparison of two
 * screenshots but show up immediately as a real pixel delta.
 */
export function checkPixelDiffMissing(page: PageNode): PixelDiffMissingFinding[] {
  const findings: PixelDiffMissingFinding[] = [];

  const refByScreenName = new Map<string, { id: string; name: string }>();
  for (const child of page.children) {
    if (child.name.startsWith('REF /')) {
      const screenName = child.name.slice('REF /'.length).trim();
      refByScreenName.set(screenName, { id: child.id, name: child.name });
    }
  }
  if (refByScreenName.size === 0) return findings;

  for (const child of page.children) {
    if (child.type !== 'FRAME' && child.type !== 'COMPONENT') continue;
    if (child.name.startsWith('REF /')) continue;

    const separatorIndex = child.name.indexOf(' / ');
    if (separatorIndex === -1) continue;
    const screenName = child.name.slice(separatorIndex + 3).trim();

    const ref = refByScreenName.get(screenName);
    if (!ref) continue;

    const pairKey = `${ref.id}::${child.id}`;
    if (comparedPairKeys.has(pairKey)) continue;

    findings.push({
      rule: 'built-without-pixel-diff',
      builtNodeId: child.id,
      builtNodeName: child.name,
      refNodeId: ref.id,
      refNodeName: ref.name,
      message: `\u26a0\ufe0f NEVER PIXEL-DIFFED \u2014 "${child.name}" exists alongside "${ref.name}" but compare_to_reference has never been called for this pair this session. Eyeballing two screenshots misses shape/color/geometry drift (e.g. a circular button where the reference shows a rounded rectangle) that a real pixel diff catches immediately \u2014 call compare_to_reference({ refNodeId: "${ref.id}", builtNodeId: "${child.id}" }) before considering this screen done.`,
    });
  }

  return findings;
}

export interface ReviewMissingFinding {
  rule: 'built-without-review';
  builtNodeId: string;
  builtNodeName: string;
  refNodeId: string;
  refNodeName: string;
  message: string;
}

/**
 * Mirror of checkPixelDiffMissing for the VISUAL review gate. Scan every
 * `<AppName> / <ScreenName>` frame whose matching `REF / <ScreenName>` sibling
 * exists but which has NOT been through a recorded review pass this session
 * (recordReviewMarker, set only by `record_review_pass` after the review->fix
 * loop ran). Pixel-diff catches geometry/color drift; the visual review is the
 * only thing that catches "this doesn't look like the real app" -- placeholder
 * imagery, flat tiles standing in for photo collages, wrong brand feel -- which
 * a low pixel-diff can still miss. A built screen is NOT done while this fires.
 */
export function checkReviewMissing(page: PageNode): ReviewMissingFinding[] {
  const findings: ReviewMissingFinding[] = [];

  const refByScreenName = new Map<string, { id: string; name: string }>();
  for (const child of page.children) {
    if (child.name.startsWith('REF /')) {
      const screenName = child.name.slice('REF /'.length).trim();
      refByScreenName.set(screenName, { id: child.id, name: child.name });
    }
  }
  if (refByScreenName.size === 0) return findings;

  for (const child of page.children) {
    if (child.type !== 'FRAME' && child.type !== 'COMPONENT') continue;
    if (child.name.startsWith('REF /')) continue;

    const separatorIndex = child.name.indexOf(' / ');
    if (separatorIndex === -1) continue;
    const screenName = child.name.slice(separatorIndex + 3).trim();

    const ref = refByScreenName.get(screenName);
    if (!ref) continue;

    const pairKey = `${ref.id}::${child.id}`;
    if (reviewedPairKeys.has(pairKey)) continue;

    findings.push({
      rule: 'built-without-review',
      builtNodeId: child.id,
      builtNodeName: child.name,
      refNodeId: ref.id,
      refNodeName: ref.name,
      message: `\u26a0\ufe0f NEVER VISUALLY REVIEWED -- "${child.name}" exists alongside "${ref.name}" but the review->fix loop has never run for this pair this session. A low pixel-diff can still hide placeholder fidelity (flat tiles where the reference shows a real photo collage, solid circles for real avatars/logos, wrong brand feel). Run the visual reviewer against "${ref.name}", apply its fixes, then call record_review_pass({ refNodeId: "${ref.id}", builtNodeId: "${child.id}", verdict }) -- this screen is NOT done until that pass is recorded.`,
    });
  }

  return findings;
}

export interface BuiltFromMemoryFinding {
  rule: 'built-omits-reference-elements';
  builtNodeId: string;
  builtNodeName: string;
  refNodeId: string;
  refNodeName: string;
  message: string;
}

/**
 * Catch "built from memory instead of from this frame": a build far sparser
 * than its reference. The reference's measured content-region count is stamped
 * on the REF frame by the Pro `analyze_reference` tool (REF_REGIONS_KEY); this
 * compares it to the built screen's counted content elements and fires only on
 * a GROSS deficit (build < 40% of the reference's regions, and the reference
 * had a meaningful amount), so it flags dropped rows / omitted chrome / wrong
 * variant — not minor differences. If the REF was never measured, it nudges
 * to run analyze_reference so the check can work (and crops stop being
 * eyeballed). Deterministic, no image libraries needed plugin-side.
 */
export function checkBuiltFromMemory(page: PageNode): BuiltFromMemoryFinding[] {
  const findings: BuiltFromMemoryFinding[] = [];

  const refByScreenName = new Map<string, { id: string; name: string; regions: number }>();
  for (const child of page.children) {
    if (child.name.startsWith('REF /')) {
      const screenName = child.name.slice('REF /'.length).trim();
      const raw = child.getPluginData(REF_REGIONS_KEY);
      const regions = raw ? parseInt(raw, 10) : -1;
      refByScreenName.set(screenName, { id: child.id, name: child.name, regions });
    }
  }
  if (refByScreenName.size === 0) return findings;

  for (const child of page.children) {
    if (child.type !== 'FRAME' && child.type !== 'COMPONENT') continue;
    if (child.name.startsWith('REF /')) continue;
    const separatorIndex = child.name.indexOf(' / ');
    if (separatorIndex === -1) continue;
    const screenName = child.name.slice(separatorIndex + 3).trim();
    const ref = refByScreenName.get(screenName);
    if (!ref) continue;

    if (ref.regions < 0) {
      findings.push({
        rule: 'built-omits-reference-elements',
        builtNodeId: child.id,
        builtNodeName: child.name,
        refNodeId: ref.id,
        refNodeName: ref.name,
        message: `\u26a0\ufe0f REFERENCE NOT MEASURED \u2014 "${ref.name}" has never been run through analyze_reference, so "built from memory" (a build far sparser than the reference) can't be caught and crops are being eyeballed. Call analyze_reference({ refNodeId: "${ref.id}" }) \u2014 it returns measured crop boxes and stamps the reference's content-region count for this check.`,
      });
      continue;
    }

    const built = countContentElements(child as SceneNode);
    if (ref.regions >= 6 && built < ref.regions * 0.4) {
      findings.push({
        rule: 'built-omits-reference-elements',
        builtNodeId: child.id,
        builtNodeName: child.name,
        refNodeId: ref.id,
        refNodeName: ref.name,
        message: `\u26a0\ufe0f BUILT FROM MEMORY? \u2014 "${child.name}" has ${built} content elements but the reference "${ref.name}" measured ~${ref.regions} distinct content regions. A build this much sparser usually means elements were dropped (rows, chrome, a whole section) or the wrong state/variant was built (e.g. a 3-tab bar rebuilt as 4). Re-check the reference element-by-element and rebuild the missing pieces from THIS frame, not from memory.`,
      });
    }
  }

  return findings;
}

export interface FidelityBarFinding {
  rule: 'built-below-fidelity-bar';
  builtNodeId: string;
  builtNodeName: string;
  refNodeId: string;
  refNodeName: string;
  message: string;
}

/**
 * The BINDING fidelity gate. For any (ref, built) pair whose last real
 * pixel-diff FAILED the code-computed bar (recordDiffResult with pass=false),
 * keep firing until it passes. This is the mechanism that stops "grading
 * against my own previous build": the verdict is derived in code from the
 * mismatch vs the REFERENCE, and while it is FAIL the screen is mechanically
 * NOT done — no narration ("massive improvement", "reasonable for a dense
 * screen") can clear it. Only getting the pixels close to the reference, or an
 * explicit recorded override, clears it.
 */
export function checkFidelityBar(page: PageNode): FidelityBarFinding[] {
  const findings: FidelityBarFinding[] = [];

  const refByScreenName = new Map<string, { id: string; name: string }>();
  for (const child of page.children) {
    if (child.name.startsWith('REF /')) {
      refByScreenName.set(child.name.slice('REF /'.length).trim(), { id: child.id, name: child.name });
    }
  }
  if (refByScreenName.size === 0) return findings;

  for (const child of page.children) {
    if (child.type !== 'FRAME' && child.type !== 'COMPONENT') continue;
    if (child.name.startsWith('REF /')) continue;
    const sep = child.name.indexOf(' / ');
    if (sep === -1) continue;
    const ref = refByScreenName.get(child.name.slice(sep + 3).trim());
    if (!ref) continue;

    const v = pairVerdict.get(`${ref.id}::${child.id}`);
    if (v && !v.pass) {
      findings.push({
        rule: 'built-below-fidelity-bar',
        builtNodeId: child.id,
        builtNodeName: child.name,
        refNodeId: ref.id,
        refNodeName: ref.name,
        message: `\u26d4 BELOW FIDELITY BAR \u2014 "${child.name}" last diffed at ${v.mismatch}% mismatch against "${ref.name}", over the ${FIDELITY_BAR_PCT}% bar, so it is NOT done. This is a code verdict, not an opinion \u2014 do NOT rationalize it as "close enough" or compare it to a previous build; the only baseline is the reference image. Fix the pixels that differ (use diffByQuadrant to locate them) and re-run compare_to_reference until it PASSES, or record an explicit override with a stated reason.`,
      });
    }
  }

  return findings;
}

export interface IosFontFinding {
  rule: 'ios-screen-wrong-font';
  builtNodeId: string;
  builtNodeName: string;
  message: string;
}

/**
 * Catch iOS screens built in a non-system font. iOS references render SF Pro;
 * building the rebuild in Inter (the old flaude.row default) leaves a permanent
 * ~5-6% pixel-diff floor on every text-dense screen and makes native chrome read
 * subtly off \u2014 an error that recurred on EVERY iOS screen. Fires ONCE per built
 * screen frame (with a REF sibling) when the majority of its text is a known
 * non-system family. SF Pro / SF Compact are accepted; a brand wordmark is a
 * small minority and won't trip the majority test.
 */
export function checkIosFont(page: PageNode): IosFontFinding[] {
  const findings: IosFontFinding[] = [];
  if (!page.children.some((c) => c.name.startsWith('REF /'))) return findings;
  const NON_SYSTEM = /^(Inter|Roboto|Helvetica|Arial|Open Sans|Lato|Poppins)/i;
  const SYSTEM = /^(SF Pro|SF Compact|\.SF|San Francisco)/i;

  for (const child of page.children) {
    if (child.type !== 'FRAME' && child.type !== 'COMPONENT') continue;
    if (child.name.startsWith('REF /')) continue;
    if (child.name.indexOf(' / ') === -1) continue;
    if (!(child.width >= 333 && child.width <= 453 && child.height >= 700)) continue;

    const texts = child.findAll((n) => n.type === 'TEXT') as TextNode[];
    if (texts.length < 4) continue;
    let nonSystem = 0;
    let system = 0;
    for (const t of texts) {
      const fn = t.fontName;
      if (fn === figma.mixed) continue;
      const fam = (fn as FontName).family;
      if (SYSTEM.test(fam)) system++;
      else if (NON_SYSTEM.test(fam)) nonSystem++;
    }
    if (nonSystem > system && nonSystem >= texts.length * 0.5) {
      findings.push({
        rule: 'ios-screen-wrong-font',
        builtNodeId: child.id,
        builtNodeName: child.name,
        message: `\u26a0\ufe0f WRONG FONT \u2014 "${child.name}" is an iOS screen but ${nonSystem}/${texts.length} text nodes use a non-system font (e.g. Inter). iOS references render SF Pro, leaving a permanent ~5-6% pixel-diff floor and text that reads subtly off. Rebuild text in "SF Pro Display"/"SF Pro Text" (flaude.row defaults to it now). Keep brand wordmarks as-is.`,
      });
    }
  }
  return findings;
}