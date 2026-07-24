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