/**
 * Flaude Layout DSL — compiler PLANNER (migration step 2a + step 4 diffing)
 * Pure logic: no figma.*, no I/O. Lives on the Pro server (or shared package).
 *
 * planBuild(prev, next)  -> Op[]        minimal ops to turn prev-canvas into next
 * chunkOps(ops, buildId) -> BuildBatch[] acked, resumable batches for the relay
 *
 * The applier (plugin side) consumes BuildBatch messages and acks each one.
 * Every op is idempotent: re-applying an op is a no-op or converges to the
 * same state, so retries after transport timeouts are always safe.
 */

/* ------------------------------------------------------------------ */
/* Op model                                                            */
/* ------------------------------------------------------------------ */

/** Node props with children/overlays stripped — what "upsert" writes. */
export type NodeProps = Record<string, unknown>;

export type Op =
  | {
      op: "upsert";
      id: string;                 // DSL id (stable key)
      parentId: string | null;    // null = screen root
      index: number;              // position among parent's children
      nodeType: string;           // "stack" | "text" | ...
      props: NodeProps;           // full desired props (declarative, not delta)
      overlay?: { anchor: string; offset?: { x?: unknown; y?: unknown } };
    }
  | { op: "remove"; id: string }
  | {
      op: "screen";               // always first op of a full build
      id: string;                 // screen id
      device: string;
      theme: string;
      chrome: Record<string, unknown>;
    };

export interface BuildBatch {
  buildId: string;
  screenId: string;
  batchIndex: number;
  totalBatches: number;
  ops: Op[];
}

/* ------------------------------------------------------------------ */
/* Tree flattening                                                     */
/* ------------------------------------------------------------------ */

interface FlatNode {
  id: string;
  parentId: string | null;
  index: number;
  nodeType: string;
  props: NodeProps;
  overlay?: { anchor: string; offset?: { x?: unknown; y?: unknown } };
}

const STRUCTURAL_KEYS = new Set(["children", "overlays", "id", "type"]);

function propsOf(node: any): NodeProps {
  const out: NodeProps = {};
  for (const k of Object.keys(node)) {
    if (!STRUCTURAL_KEYS.has(k)) out[k] = node[k];
  }
  return out;
}

/** Depth-first flatten; parents always precede children in the result. */
export function flattenScreen(screen: any): FlatNode[] {
  const out: FlatNode[] = [];
  const visit = (
    node: any,
    parentId: string | null,
    index: number,
    overlay?: FlatNode["overlay"]
  ) => {
    out.push({
      id: node.id,
      parentId,
      index,
      nodeType: node.type,
      props: propsOf(node),
      ...(overlay ? { overlay } : {}),
    });
    (node.children ?? []).forEach((c: any, i: number) => visit(c, node.id, i));
    (node.overlays ?? []).forEach((o: any, i: number) =>
      visit(o.node, node.id, 1000 + i, { anchor: o.anchor, offset: o.offset })
    );
  };
  visit(screen.root, null, 0);
  return out;
}

/* ------------------------------------------------------------------ */
/* Diff → plan                                                         */
/* ------------------------------------------------------------------ */

/** Stable stringify (sorted keys) so prop comparison is order-insensitive. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/**
 * prevDoc: the last schema successfully applied for this screen (null = first
 * build → full plan). nextDoc: the validated schema to apply now.
 */
export function planBuild(prevDoc: any | null, nextDoc: any): Op[] {
  const next = flattenScreen(nextDoc.screen);
  const prev = prevDoc ? flattenScreen(prevDoc.screen) : [];
  const prevById = new Map(prev.map((n) => [n.id, n]));
  const nextIds = new Set(next.map((n) => n.id));

  const ops: Op[] = [];

  // 1. Screen op: emitted on first build or when screen-level config changed.
  const screenMeta = (d: any) => ({
    device: d.screen.device,
    theme: d.screen.theme,
    chrome: d.screen.chrome,
  });
  if (
    !prevDoc ||
    stableStringify(screenMeta(prevDoc)) !== stableStringify(screenMeta(nextDoc))
  ) {
    ops.push({ op: "screen", id: nextDoc.screen.id, ...screenMeta(nextDoc) });
  }

  // 2. Upserts, parent-before-child (flatten order guarantees this).
  for (const n of next) {
    const p = prevById.get(n.id);
    const changed =
      !p ||
      p.parentId !== n.parentId ||
      p.index !== n.index ||
      p.nodeType !== n.nodeType ||
      stableStringify(p.props) !== stableStringify(n.props) ||
      stableStringify(p.overlay ?? null) !== stableStringify(n.overlay ?? null);
    if (changed) {
      ops.push({
        op: "upsert",
        id: n.id,
        parentId: n.parentId,
        index: n.index,
        nodeType: n.nodeType,
        props: n.props,
        ...(n.overlay ? { overlay: n.overlay } : {}),
      });
    }
  }

  // 3. Removals last (children before parents, so reverse flatten order).
  for (const p of [...prev].reverse()) {
    if (!nextIds.has(p.id)) ops.push({ op: "remove", id: p.id });
  }

  return ops;
}

/* ------------------------------------------------------------------ */
/* Chunking                                                            */
/* ------------------------------------------------------------------ */

export const OPS_PER_BATCH = 20;

export function chunkOps(
  ops: Op[],
  buildId: string,
  screenId: string,
  opsPerBatch = OPS_PER_BATCH
): BuildBatch[] {
  const batches: BuildBatch[] = [];
  for (let i = 0; i < ops.length; i += opsPerBatch) {
    batches.push({
      buildId,
      screenId,
      batchIndex: batches.length,
      totalBatches: 0, // filled below
      ops: ops.slice(i, i + opsPerBatch),
    });
  }
  batches.forEach((b) => (b.totalBatches = batches.length));
  return batches.length
    ? batches
    : [{ buildId, screenId, batchIndex: 0, totalBatches: 1, ops: [] }];
}

/* ------------------------------------------------------------------ */
/* Relay driver (server-side send loop, transport-agnostic)            */
/* ------------------------------------------------------------------ */

export interface BatchAck {
  buildId: string;
  batchIndex: number;
  applied: number;
  skipped: number;           // ops already applied (dedupe hits)
  errors: { opIndex: number; id: string; message: string }[];
}

/**
 * Drives batches through any send function (your sendToPlugin wrapper).
 * Retries each batch up to `retries` times on timeout — safe because the
 * applier dedupes by (buildId, batchIndex). Resumes, never restarts.
 */
export async function driveBuild(
  batches: BuildBatch[],
  send: (batch: BuildBatch) => Promise<BatchAck>,
  opts: { retries?: number; onProgress?: (a: BatchAck) => void } = {}
): Promise<{ ok: boolean; acks: BatchAck[]; failedBatch?: number }> {
  const retries = opts.retries ?? 2;
  const acks: BatchAck[] = [];
  for (const batch of batches) {
    let ack: BatchAck | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= retries && !ack; attempt++) {
      try {
        ack = await send(batch);
      } catch (e) {
        lastErr = e;
      }
    }
    if (!ack) {
      return { ok: false, acks, failedBatch: batch.batchIndex };
    }
    acks.push(ack);
    opts.onProgress?.(ack);
    if (ack.errors.length) {
      // Op-level errors are not retried blindly — surface to the coder.
      return { ok: false, acks, failedBatch: batch.batchIndex };
    }
  }
  return { ok: true, acks };
}
