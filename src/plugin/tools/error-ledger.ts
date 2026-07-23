/**
 * Error Ledger — durable, structured record of every defect the automatic
 * checks (structural lint + reference/pixel-diff tracking) have flagged.
 *
 * This is the DATA layer of the auto-improvement loop the user asked for:
 * "record all the errors it found so we can analyze those errors and make
 * sure you never make them again." The structural lint already DETECTS
 * defects and surfaces them in `_lint`, but that signal is ephemeral — it
 * vanishes with the tool response. This persists every finding to
 * `figma.clientStorage` (per-user, survives across sessions) so the recurring
 * ones can later be analyzed and turned into new deterministic checks.
 *
 * Deduped by defect signature (rule + node + message): re-running the lint on
 * a screen whose defect isn't fixed yet BUMPS that entry's `count`/`lastTs`
 * instead of appending a duplicate. So the ledger measures *distinct* defects
 * and how persistent each was — not how many times the lint happened to run.
 */

const LEDGER_KEY = 'flaude_error_ledger_v1';
const MAX_ENTRIES = 500;

export interface LedgerEntry {
  /** Stable signature: rule + nodeId + message. Dedup key. */
  sig: string;
  rule: string;
  nodeId: string;
  nodeName: string;
  message: string;
  page: string;
  /** Session (plugin load) in which this defect was FIRST observed. */
  session: string;
  firstTs: number;
  lastTs: number;
  /** How many times this exact defect has been observed across runs. */
  count: number;
}

/** A raw finding as emitted by structural-lint / reference-tracking /
 * swallowed-icon reporting — field names vary, so we normalize on ingest. */
interface RawFinding {
  rule?: unknown;
  nodeId?: unknown;
  nodeName?: unknown;
  builtNodeId?: unknown;
  builtNodeName?: unknown;
  concept?: unknown;
  message?: unknown;
}

// One session id per plugin load — lets analysis tell "keeps happening across
// sessions" (systemic) apart from "many times in one session" (one bad build).
const SESSION_ID = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

// Serialize read-modify-write so two rapid execute calls can't clobber each
// other's ledger append (the plugin is single-threaded, but clientStorage
// access is async, so interleaving is possible without this chain).
let writeChain: Promise<void> = Promise.resolve();

function str(v: unknown): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
}

function normalize(f: RawFinding, page: string, now: number): LedgerEntry | null {
  const rule = str(f.rule);
  if (!rule) return null;
  const nodeId = str(f.nodeId ?? f.builtNodeId);
  const nodeName = str(f.nodeName ?? f.builtNodeName ?? f.concept);
  const message = str(f.message);
  return {
    sig: `${rule}\u0000${nodeId}\u0000${message}`,
    rule,
    nodeId,
    nodeName,
    message,
    page,
    session: SESSION_ID,
    firstTs: now,
    lastTs: now,
    count: 1,
  };
}

async function loadRaw(): Promise<LedgerEntry[]> {
  try {
    const data = (await figma.clientStorage.getAsync(LEDGER_KEY)) as LedgerEntry[] | undefined;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Record findings to the durable ledger. Fire-and-forget by design — the
 * ledger is best-effort telemetry and must NEVER slow down or fail a real
 * design call. Dedups by signature (bumps count/lastTs on repeats).
 */
export function recordFindings(findings: RawFinding[], page: string): void {
  if (!Array.isArray(findings) || findings.length === 0) return;
  const now = Date.now();
  const incoming = findings
    .map((f) => normalize(f, page, now))
    .filter((e): e is LedgerEntry => e !== null);
  if (incoming.length === 0) return;

  writeChain = writeChain
    .then(async () => {
      const existing = await loadRaw();
      const bySig = new Map<string, LedgerEntry>();
      for (const e of existing) bySig.set(e.sig, e);
      for (const e of incoming) {
        const prev = bySig.get(e.sig);
        if (prev) {
          prev.count += 1;
          prev.lastTs = now;
          prev.page = e.page;
          prev.nodeName = e.nodeName || prev.nodeName;
        } else {
          bySig.set(e.sig, e);
        }
      }
      let merged = Array.from(bySig.values());
      // Cap: drop the least-recently-seen entries first.
      if (merged.length > MAX_ENTRIES) {
        merged.sort((a, b) => b.lastTs - a.lastTs);
        merged = merged.slice(0, MAX_ENTRIES);
      }
      await figma.clientStorage.setAsync(LEDGER_KEY, merged);
    })
    .catch(() => {
      /* best-effort: never let ledger I/O break a design call */
    });
}

export interface LedgerSummary {
  totalDistinctDefects: number;
  totalObservations: number;
  /** Per-rule breakdown, most-frequent first — the "which mistakes recur" view. */
  byRule: Array<{ rule: string; distinct: number; observations: number }>;
  /** The most persistent individual defects (highest observation count). */
  topRecurring: Array<{ rule: string; nodeName: string; count: number; page: string }>;
  sessionsSpanned: number;
}

export async function summarizeLedger(): Promise<LedgerSummary> {
  const entries = await loadRaw();
  const ruleMap = new Map<string, { distinct: number; observations: number }>();
  const sessions = new Set<string>();
  let totalObservations = 0;
  for (const e of entries) {
    totalObservations += e.count;
    sessions.add(e.session);
    const r = ruleMap.get(e.rule) ?? { distinct: 0, observations: 0 };
    r.distinct += 1;
    r.observations += e.count;
    ruleMap.set(e.rule, r);
  }
  const byRule = Array.from(ruleMap.entries())
    .map(([rule, v]) => ({ rule, ...v }))
    .sort((a, b) => b.observations - a.observations);
  const topRecurring = entries
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((e) => ({ rule: e.rule, nodeName: e.nodeName, count: e.count, page: e.page }));
  return {
    totalDistinctDefects: entries.length,
    totalObservations,
    byRule,
    topRecurring,
    sessionsSpanned: sessions.size,
  };
}

