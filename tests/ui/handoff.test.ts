/**
 * Copy -> insert handoff (UI side). Covers the half that never touches the
 * Figma canvas: parsing the clipboard payload, fetching the screen DSL doc from
 * the website payload API, and the emit/on round-trip to `main`.
 *
 * `@create-figma-plugin/utilities` binds to `figma.ui` at IMPORT time (node has
 * no `window`), so we install a global `figma` stub BEFORE importing handoff via
 * `vi.hoisted` (runs above hoisted imports). The stub's `postMessage` is what
 * lets us simulate `main` replying, exercising the real emit -> on -> off path.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Runs before the imports below are evaluated — utilities needs `figma.ui`.
vi.hoisted(() => {
  (globalThis as unknown as { figma: unknown }).figma = {
    ui: {
      postMessage: (_msg: unknown) => {},
      onmessage: null as null | ((args: unknown) => void),
    },
  };
});

import {
  parseHandoffPayload,
  fetchScreenDoc,
  insertCopiedScreen,
  WEBSITE_BASE_URL,
  type InsertScreenResult,
} from '../../src/ui/api/handoff';

/** The utilities-owned dispatcher assigned to figma.ui.onmessage at import. */
function figmaUi() {
  return (globalThis as unknown as { figma: { ui: {
    postMessage: (msg: unknown) => void;
    onmessage: ((args: unknown) => void) | null;
  } } }).figma.ui;
}

/** A stand-in insert_screen result the fake `main` replies with. */
const OK_RESULT: InsertScreenResult = {
  ok: true,
  screenId: 'sample-screen',
  nodeId: 'FRAME:1',
  nodeIds: ['FRAME:1', 'TEXT:2'],
  batches: 1,
  applied: 2,
  errors: [],
};

/**
 * Make `main` answer the next INSERT_SCREEN emit. Captures the emitted
 * requestId and feeds it back through the utilities dispatcher so the UI
 * promise resolves/rejects exactly as it would in the plugin.
 */
function stubMainReply(reply: Partial<{ data: InsertScreenResult; error: string }>) {
  figmaUi().postMessage = (msg: unknown) => {
    const [name, payload] = msg as [string, { requestId: string }];
    if (name !== 'INSERT_SCREEN') return;
    queueMicrotask(() => {
      figmaUi().onmessage?.([
        'INSERT_SCREEN_RESULT',
        { requestId: payload.requestId, ...reply },
      ]);
    });
  };
}

beforeEach(() => {
  figmaUi().postMessage = () => {};
});

/* ------------------------------------------------------------------ */
/* parseHandoffPayload                                                 */
/* ------------------------------------------------------------------ */

describe('parseHandoffPayload', () => {
  it('accepts a well-formed screen payload (whitespace-tolerant)', () => {
    const p = parseHandoffPayload(
      '  {"type":"flaude/screen","slug":"spotify-home","version":1}  '
    );
    expect(p).toEqual({ type: 'flaude/screen', slug: 'spotify-home', version: 1 });
  });

  it('accepts a flow payload (kind carried through for the caller to reject)', () => {
    const p = parseHandoffPayload('{"type":"flaude/flow","slug":"onboarding","version":1}');
    expect(p?.type).toBe('flaude/flow');
  });

  it('returns null for non-JSON, empty, and foreign clipboard contents', () => {
    expect(parseHandoffPayload('')).toBeNull();
    expect(parseHandoffPayload('just some copied text')).toBeNull();
    expect(parseHandoffPayload('{"foo":"bar"}')).toBeNull();
    // Right shape, wrong namespace.
    expect(parseHandoffPayload('{"type":"other/screen","slug":"x"}')).toBeNull();
    // Missing slug.
    expect(parseHandoffPayload('{"type":"flaude/screen"}')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* fetchScreenDoc                                                      */
/* ------------------------------------------------------------------ */

describe('fetchScreenDoc', () => {
  it('hits the website payload API and returns the doc', async () => {
    const doc = { screen: { id: 'sample-screen' } };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ doc }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchScreenDoc('spotify-home')).resolves.toEqual(doc);
    expect(fetchMock).toHaveBeenCalledWith(
      `${WEBSITE_BASE_URL}/api/catalog/screen/spotify-home/payload`
    );
  });

  it('url-encodes the slug', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ doc: {} }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchScreenDoc('a/b space');
    expect(fetchMock).toHaveBeenCalledWith(
      `${WEBSITE_BASE_URL}/api/catalog/screen/a%2Fb%20space/payload`
    );
  });

  it('maps 404 to a friendly "no insertable layout yet" error', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(fetchScreenDoc('missing')).rejects.toThrow(/insertable layout yet/i);
  });

  it('surfaces other HTTP errors with the status code', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(fetchScreenDoc('boom')).rejects.toThrow(/HTTP 500/);
  });

  it('rejects when the server returns no doc', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ doc: null }) })) as unknown as typeof fetch;
    await expect(fetchScreenDoc('empty')).rejects.toThrow(/no layout/i);
  });

  it('maps a network failure to a connection error', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    await expect(fetchScreenDoc('offline')).rejects.toThrow(/reach flaude\.app/i);
  });
});

/* ------------------------------------------------------------------ */
/* insertCopiedScreen — end to end (clipboard -> fetch -> emit -> reply)*/
/* ------------------------------------------------------------------ */

describe('insertCopiedScreen', () => {
  it('reads the clipboard, fetches the doc, and resolves with main’s result', async () => {
    const doc = { screen: { id: 'sample-screen' } };
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ doc }) })) as unknown as typeof fetch;
    stubMainReply({ data: OK_RESULT });

    const result = await insertCopiedScreen(async () =>
      '{"type":"flaude/screen","slug":"sample-screen","version":1}'
    );
    expect(result).toEqual(OK_RESULT);
  });

  it('rejects with main’s error when the insert fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ doc: {} }) })) as unknown as typeof fetch;
    stubMainReply({ error: 'applier blew up' });

    await expect(
      insertCopiedScreen(async () => '{"type":"flaude/screen","slug":"x","version":1}')
    ).rejects.toThrow('applier blew up');
  });

  it('rejects with a copy-a-screen prompt when nothing is copied', async () => {
    await expect(insertCopiedScreen(async () => 'random text')).rejects.toThrow(
      /Nothing to insert/i
    );
  });

  it('rejects flows with a screen-by-screen hint', async () => {
    await expect(
      insertCopiedScreen(async () => '{"type":"flaude/flow","slug":"onboarding","version":1}')
    ).rejects.toThrow(/flow/i);
  });

  it('rejects when the clipboard cannot be read', async () => {
    await expect(
      insertCopiedScreen(async () => {
        throw new Error('denied');
      })
    ).rejects.toThrow(/clipboard/i);
  });
});
