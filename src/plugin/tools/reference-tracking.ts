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
