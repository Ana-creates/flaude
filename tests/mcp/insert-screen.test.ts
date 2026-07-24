/**
 * Copy -> insert round-trip: a screen DSL doc planned with prev=null must
 * rebuild into real Figma nodes via the SAME applier the server's build path
 * uses. This is the contract behind the `insert_screen` command (the plugin
 * half of "Copy on web -> open plugin -> screen appears with editable layers").
 *
 * The applier needs a live `figma.*`, so we install a FOCUSED stub — just the
 * surface a simple doc (root stack + a text child, no chrome/images/icons)
 * exercises. It is not a general Figma mock; it asserts structure, not pixels.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  planBuild,
  chunkOps,
  type BuildBatch,
} from '../../src/plugin/mcp/dsl-compiler-plan';
import { applyBuildBatch } from '../../src/plugin/mcp/dsl-apply';

/* ------------------------------------------------------------------ */
/* Minimal Figma stub                                                  */
/* ------------------------------------------------------------------ */

let idSeq = 0;

/** A generic scene node: typed fields + arbitrary prop assignment. */
class StubNode {
  id: string;
  type: string;
  name = '';
  parent: StubNode | null = null;
  children: StubNode[] = [];
  removed = false;
  width = 0;
  height = 0;
  private pd: Record<string, string> = {};
  // Any figma prop (layoutMode, fills, fontSize, ...) is just stored.
  [k: string]: unknown;

  constructor(type: string) {
    this.type = type;
    this.id = `${type}:${++idSeq}`;
  }
  setPluginData(k: string, v: string) {
    this.pd[k] = v;
  }
  getPluginData(k: string) {
    return this.pd[k] ?? '';
  }
  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  appendChild(n: StubNode) {
    this.insertChild(this.children.length, n);
  }
  insertChild(i: number, n: StubNode) {
    if (n.parent) {
      const at = n.parent.children.indexOf(n);
      if (at >= 0) n.parent.children.splice(at, 1);
    }
    const clamped = Math.max(0, Math.min(i, this.children.length));
    this.children.splice(clamped, 0, n);
    n.parent = this;
  }
  remove() {
    if (this.parent) {
      const at = this.parent.children.indexOf(this);
      if (at >= 0) this.parent.children.splice(at, 1);
    }
    this.parent = null;
    this.removed = true;
  }
  findOne(pred: (n: StubNode) => boolean): StubNode | null {
    for (const c of this.children) {
      if (pred(c)) return c;
      const deep = c.findOne(pred);
      if (deep) return deep;
    }
    return null;
  }
  findAll(pred: (n: StubNode) => boolean): StubNode[] {
    const out: StubNode[] = [];
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      out.push(...c.findAll(pred));
    }
    return out;
  }
}

function installFigmaStub() {
  const page = new StubNode('PAGE');
  (page as unknown as { selection: StubNode[] }).selection = [];
  const figma = {
    currentPage: page,
    createFrame() {
      const n = new StubNode('FRAME');
      page.appendChild(n);
      return n;
    },
    createText() {
      const n = new StubNode('TEXT');
      n.textAutoResize = 'NONE';
      page.appendChild(n);
      return n;
    },
    createRectangle() {
      const n = new StubNode('RECTANGLE');
      page.appendChild(n);
      return n;
    },
    loadFontAsync: async () => {},
    viewport: { scrollAndZoomIntoView() {} },
    getImageByHash: () => null,
  };
  (globalThis as unknown as { figma: unknown }).figma = figma;
  return { figma, page };
}

/* ------------------------------------------------------------------ */
/* Sample doc                                                          */
/* ------------------------------------------------------------------ */

/** A trivial but real screen doc: a filled vertical stack with one heading. */
function sampleDoc() {
  return {
    screen: {
      id: 'sample-screen',
      device: 'iphone-15',
      theme: 'light',
      chrome: {},
      root: {
        id: 'root',
        type: 'stack',
        direction: 'vertical',
        gap: 's4',
        padding: 's4',
        fill: 'surface.base',
        sizing: { w: 'fill', h: 'fill' },
        children: [
          {
            id: 'title',
            type: 'text',
            style: 'title1',
            content: 'Hello Flaude',
            color: 'text.primary',
          },
        ],
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('insert_screen round-trip', () => {
  beforeEach(() => {
    idSeq = 0;
    installFigmaStub();
  });

  it('plans a full build (prev=null): screen op first, one upsert per node, parent before child', () => {
    const ops = planBuild(null, sampleDoc());

    expect(ops[0].op).toBe('screen');
    const upserts = ops.filter((o) => o.op === 'upsert');
    expect(upserts.map((o) => (o as { id: string }).id)).toEqual([
      'root',
      'title',
    ]);
    // Parent (root) must be planned before its child (title).
    const rootIdx = ops.findIndex(
      (o) => o.op === 'upsert' && (o as { id: string }).id === 'root'
    );
    const titleIdx = ops.findIndex(
      (o) => o.op === 'upsert' && (o as { id: string }).id === 'title'
    );
    expect(rootIdx).toBeLessThan(titleIdx);
  });

  it('chunks into acked batches with correct metadata', () => {
    const ops = planBuild(null, sampleDoc());
    const batches = chunkOps(ops, 'build-1', 'sample-screen');

    expect(batches.length).toBeGreaterThanOrEqual(1);
    const total = batches[0].totalBatches;
    batches.forEach((b: BuildBatch, i: number) => {
      expect(b.batchIndex).toBe(i);
      expect(b.totalBatches).toBe(total);
      expect(b.buildId).toBe('build-1');
      expect(b.screenId).toBe('sample-screen');
    });
  });

  it('applies the batches into a real editable node tree', async () => {
    const doc = sampleDoc();
    const ops = planBuild(null, doc);
    const batches = chunkOps(ops, 'build-1', 'sample-screen');

    let applied = 0;
    const errors: unknown[] = [];
    for (const batch of batches) {
      const ack = await applyBuildBatch(batch);
      applied += ack.applied;
      errors.push(...ack.errors);
    }

    expect(errors).toEqual([]);
    expect(applied).toBe(ops.length);

    // The screen frame exists, tagged + sized to the device.
    const figma = (globalThis as unknown as { figma: { currentPage: StubNode } })
      .figma;
    const frame = figma.currentPage.findOne(
      (n) => n.getPluginData('flaude:screenId') === 'sample-screen'
    );
    expect(frame).toBeTruthy();
    expect(frame!.type).toBe('FRAME');
    expect(frame!.width).toBe(393);
    expect(frame!.height).toBe(852);
    expect(frame!.layoutMode).toBe('VERTICAL');

    // The heading landed as a real TEXT node carrying the copied content.
    const title = frame!.findOne(
      (n) => n.getPluginData('flaude:dslId') === 'title'
    );
    expect(title).toBeTruthy();
    expect(title!.type).toBe('TEXT');
    expect(title!.characters).toBe('Hello Flaude');

    // The DSL-id -> node-id map is stored so insert_screen can report node ids.
    const map = JSON.parse(frame!.getPluginData('flaude:nodeMap')) as Record<
      string,
      string
    >;
    expect(map['title']).toBe(title!.id);
    expect(map['sample-screen']).toBe(frame!.id);
  });

  it('is convergent: re-planning the same doc against itself yields no ops', () => {
    const doc = sampleDoc();
    expect(planBuild(doc, doc)).toEqual([]);
  });
});
