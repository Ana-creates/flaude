/**
 * Copy -> Insert handoff (UI side).
 * ---------------------------------------------------------------------------
 * The website's "Copy to Figma" writes a tiny JSON payload to the clipboard:
 *   { type: 'flaude/screen', slug, version }
 * When the user opens the plugin, we read that payload, fetch the screen's DSL
 * doc from the website (ONLY the UI iframe can `fetch` — the plugin sandbox
 * can't), and hand the doc to `main` via emit. `main` runs the `insert_screen`
 * command, which rebuilds real, editable layers on the canvas. There is no
 * screenshot and no "paste this JSON" dead end.
 */

import { emit, on } from '@create-figma-plugin/utilities';

/** Where the gallery + payload API live. */
export const WEBSITE_BASE_URL = 'https://flaude.app';

type HandoffKind = 'screen' | 'flow';

export interface HandoffPayload {
  type: `flaude/${HandoffKind}`;
  slug: string;
  version: number;
}

/** Result surfaced by the `insert_screen` command (see command-handler.ts). */
export interface InsertScreenResult {
  ok: boolean;
  screenId: string;
  nodeId: string | null;
  nodeIds: string[];
  batches: number;
  applied: number;
  errors: { batchIndex: number; opIndex: number; id: string; message: string }[];
}

/**
 * Parse a clipboard string into a Flaude handoff payload, or null if it isn't
 * one. Tolerant of surrounding whitespace; never throws.
 */
export function parseHandoffPayload(text: string): HandoffPayload | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.trim()) as Partial<HandoffPayload>;
    if (
      parsed &&
      typeof parsed.slug === 'string' &&
      typeof parsed.type === 'string' &&
      parsed.type.indexOf('flaude/') === 0
    ) {
      return parsed as HandoffPayload;
    }
  } catch {
    // Not JSON, or not our payload — treat as "nothing copied".
  }
  return null;
}

/**
 * Fetch a screen's DSL doc from the website payload API. Throws a
 * human-readable error the UI can show as a toast.
 */
export async function fetchScreenDoc(slug: string): Promise<unknown> {
  const url = `${WEBSITE_BASE_URL}/api/catalog/screen/${encodeURIComponent(
    slug
  )}/payload`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(
      'Could not reach flaude.app. Check your connection and try again.'
    );
  }
  if (res.status === 404) {
    throw new Error(
      `“${slug}” doesn’t have an insertable layout yet. Community screens insert directly; some catalog screens are still being prepared.`
    );
  }
  if (!res.ok) {
    throw new Error(`Couldn’t load “${slug}” (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as { doc?: unknown };
  if (!json || json.doc === undefined || json.doc === null) {
    throw new Error(`The server returned no layout for “${slug}”.`);
  }
  return json.doc;
}

let insertSeq = 0;

/**
 * Hand a fetched DSL doc to `main` for insertion and resolve with the created
 * node ids. Resolves/rejects only for the matching request id, and unsubscribes
 * itself so repeated inserts don't stack listeners.
 */
export function insertScreenDoc(doc: unknown): Promise<InsertScreenResult> {
  const requestId = `insert-${Date.now()}-${insertSeq++}`;
  return new Promise((resolve, reject) => {
    const off = on(
      'INSERT_SCREEN_RESULT',
      (r: { requestId: string; data?: InsertScreenResult; error?: string }) => {
        if (r.requestId !== requestId) return;
        off();
        if (r.error) reject(new Error(r.error));
        else resolve(r.data as InsertScreenResult);
      }
    );
    emit('INSERT_SCREEN', { requestId, doc });
  });
}

/**
 * Full copy -> insert flow: read the clipboard, resolve the copied screen's DSL
 * doc, and insert it. `readClipboard` is injectable for testing. Throws a
 * toast-ready error at every failure point (nothing copied, a flow copied,
 * fetch failed, insert failed).
 */
export async function insertCopiedScreen(
  readClipboard: () => Promise<string> = () => navigator.clipboard.readText()
): Promise<InsertScreenResult> {
  let clipboard = '';
  try {
    clipboard = await readClipboard();
  } catch {
    throw new Error(
      'Flaude can’t read your clipboard here. Copy a screen on flaude.app, then click Insert again.'
    );
  }

  const payload = parseHandoffPayload(clipboard);
  if (!payload) {
    throw new Error(
      'Nothing to insert. Hit “Copy to Figma” on a screen at flaude.app first, then come back.'
    );
  }
  if (payload.type !== 'flaude/screen') {
    throw new Error(
      'That’s a flow. Flows insert screen-by-screen (coming soon) — copy a single screen for now.'
    );
  }

  const doc = await fetchScreenDoc(payload.slug);
  return insertScreenDoc(doc);
}
