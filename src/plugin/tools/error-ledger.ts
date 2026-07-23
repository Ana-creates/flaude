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
  /** Where this defect came from: 'lint' = a deterministic rule already
   * caught it; 'manual'/'vision' = logged by a human or a vision reviewer as
   * a defect that has NO mechanical rule yet. This is the flywheel's key
   * distinction — a recurring 'manual'/'vision' class is exactly what needs a
   * NEW deterministic rule written for it. */
  source: DefectSource;
}

export type DefectSource = 'lint' | 'manual' | 'vision';

/**
 * The deterministic rule names the structural lint + tracking already emit.
 * Anything recorded in the ledger whose `rule` is NOT in this set is a defect
 * class with no mechanical check yet — i.e. a candidate for a brand-new rule
 * (the flywheel's job). Keep in sync when a new `_lint` rule ships.
 */
export const BUILTIN_RULES: readonly string[] = [
  'hand-drawn-icon',
  'hand-drawn-ios-chrome',
  'button-hug-both-axes',
  'possible-toggle-track',
  'ungrouped-label-over-shape',
  'avatar-placeholder',
  'low-contrast-text',
  'row-cross-axis-misalignment',
  'label-not-centered-in-button',
  'cropped-keyboard',
  'swallowed-icon-lookup-failure',
  'built-without-reference-capture',
  'built-without-pixel-diff',
];

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

function normalize(f: RawFinding, page: string, now: number, source: DefectSource): LedgerEntry | null {
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
    source,
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
function appendEntries(incoming: LedgerEntry[]): void {
  if (incoming.length === 0) return;
  const now = Date.now();
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
          // A class first seen by a human/vision reviewer, later also caught
          // by a shipped rule, becomes 'lint' — it graduated to mechanical.
          if (e.source === 'lint') prev.source = 'lint';
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

/**
 * Record deterministic-lint findings to the durable ledger. Fire-and-forget —
 * the ledger is best-effort telemetry and must NEVER slow or fail a real
 * design call. Dedups by signature (bumps count/lastTs on repeats).
 */
export function recordFindings(findings: RawFinding[], page: string): void {
  if (!Array.isArray(findings) || findings.length === 0) return;
  const now = Date.now();
  const incoming = findings
    .map((f) => normalize(f, page, now, 'lint'))
    .filter((e): e is LedgerEntry => e !== null);
  appendEntries(incoming);
}

export interface RecordDefectInput {
  /** Short stable slug for the DEFECT CLASS (e.g. "wrong-brand-color",
   * "missing-loading-state"). This is what clusters across screens — keep it
   * consistent, not a per-instance description. */
  ruleClass: string;
  /** Human-readable description of what was wrong on THIS instance. */
  message: string;
  nodeId?: string;
  nodeName?: string;
  page?: string;
  /** 'manual' = a human flagged it; 'vision' = a model/vision reviewer did. */
  source?: 'manual' | 'vision';
}

/**
 * Record a NOVEL defect — one that no deterministic rule caught — into the
 * SAME ledger, from a human or a vision reviewer. This is the flywheel's
 * intake: it lets the system accumulate evidence about mistakes it cannot yet
 * detect on its own, so `proposePrevention` can later surface the recurring
 * ones as candidates for a new mechanical rule. Deduped by (ruleClass +
 * nodeId + message) like everything else.
 */
export function recordDefect(input: RecordDefectInput): { recorded: boolean; ruleClass: string } {
  const ruleClass = str(input.ruleClass).trim();
  if (!ruleClass) return { recorded: false, ruleClass: '' };
  const now = Date.now();
  const entry = normalize(
    {
      rule: ruleClass,
      nodeId: input.nodeId,
      nodeName: input.nodeName,
      message: input.message,
    },
    str(input.page) || 'unknown',
    now,
    input.source === 'vision' ? 'vision' : 'manual'
  );
  if (!entry) return { recorded: false, ruleClass };
  appendEntries([entry]);
  return { recorded: true, ruleClass };
}

// ===========================================================================
// SELF-SHARPENING REVIEWER — the wire that closes the loop.
//
// The visual reviewer works from ~6 universal PRINCIPLES, not a growing
// checklist. It has blind spots (tonight it missed ALIGNMENT and
// CONTAINMENT). The old loop was: reviewer misses -> a HUMAN catches it ->
// a HUMAN edits the reviewer. That is not self-sharpening.
//
// This closes it mechanically: every time a reviewer MISS is caught (by a
// human, or by a later automated check), it's recorded here TAGGED BY
// PRINCIPLE. Before the NEXT review, the reviewer loads `getReviewerSharpening`
// -> a short "you have historically under-checked these principles, look
// twice" preamble ranked by how often it has slipped. The reviewer's prompt
// stays small (still 6 principles) but its ATTENTION re-weights toward its
// own real weak spots, from evidence, with no human edit. That is the
// difference between "self-sharpening" as a word and as a fact.
// ===========================================================================

/** The 6 universal principles the visual reviewer checks. A reviewer miss is
 * always an instance of exactly one of these — so misses cluster onto a fixed
 * small set of dials to sharpen, instead of an ever-growing checklist. */
export const REVIEW_PRINCIPLES = [
  'color-fidelity',
  'elevation',
  'structure-containment',
  'alignment',
  'spacing-size',
  'completeness-type',
] as const;
export type ReviewPrinciple = (typeof REVIEW_PRINCIPLES)[number];

const REVIEWER_MISS_PREFIX = 'reviewer-miss';

function normalizePrinciple(p: string): ReviewPrinciple {
  const s = str(p).trim().toLowerCase().replace(/[\s_]+/g, '-');
  return (REVIEW_PRINCIPLES as readonly string[]).includes(s)
    ? (s as ReviewPrinciple)
    : 'completeness-type';
}

export interface RecordReviewerMissInput {
  /** Which of the 6 principles the reviewer FAILED to enforce (it passed a
   * screen that violated this). Free-form is coerced to the nearest principle. */
  principle: string;
  /** What the reviewer missed on this screen, concretely. */
  message: string;
  page?: string;
  /** 'manual' = a human caught the miss; 'auto' = a later check did. */
  source?: 'manual' | 'auto';
}

/**
 * Record that the REVIEWER missed a defect (it signed off, but the screen was
 * wrong on `principle`). Logged into the same durable ledger under a
 * `reviewer-miss:<principle>` class so misses cluster by principle.
 */
export function recordReviewerMiss(
  input: RecordReviewerMissInput
): { recorded: boolean; principle: ReviewPrinciple } {
  const principle = normalizePrinciple(input.principle);
  const now = Date.now();
  const entry = normalize(
    { rule: `${REVIEWER_MISS_PREFIX}:${principle}`, message: input.message },
    str(input.page) || 'unknown',
    now,
    'vision'
  );
  if (!entry) return { recorded: false, principle };
  appendEntries([entry]);
  return { recorded: true, principle };
}

export interface ReviewerSharpening {
  /** Principles the reviewer has historically under-checked, most-missed
   * first, with how many times each slipped and example misses. */
  weakPrinciples: Array<{ principle: ReviewPrinciple; misses: number; examples: string[] }>;
  /** Ready-to-prepend preamble for the reviewer's next run. Empty string when
   * there's no miss history yet. */
  preamble: string;
}

/**
 * Build the reviewer's "look twice at these" preamble from its own recorded
 * miss history. This is loaded BEFORE each review so the reviewer re-weights
 * attention toward its real weak spots — the mechanical close of the loop.
 */
export async function getReviewerSharpening(): Promise<ReviewerSharpening> {
  const entries = await loadRaw();
  const byPrinciple = new Map<ReviewPrinciple, { misses: number; examples: Set<string> }>();
  for (const e of entries) {
    if (!e.rule.startsWith(`${REVIEWER_MISS_PREFIX}:`)) continue;
    const principle = normalizePrinciple(e.rule.slice(REVIEWER_MISS_PREFIX.length + 1));
    const agg = byPrinciple.get(principle) ?? { misses: 0, examples: new Set<string>() };
    agg.misses += e.count;
    if (e.message && agg.examples.size < 2) agg.examples.add(e.message);
    byPrinciple.set(principle, agg);
  }
  const weakPrinciples = Array.from(byPrinciple.entries())
    .map(([principle, v]) => ({ principle, misses: v.misses, examples: Array.from(v.examples) }))
    .sort((a, b) => b.misses - a.misses);

  let preamble = '';
  if (weakPrinciples.length > 0) {
    const lines = weakPrinciples
      .slice(0, 4)
      .map(
        (w) =>
          `- ${w.principle} (missed ${w.misses}×)${w.examples[0] ? ` — e.g. "${w.examples[0]}"` : ''}`
      );
    preamble =
      `LOOK TWICE — you have historically UNDER-CHECKED these principles; scrutinize them ` +
      `hardest on this screen before signing off:\n${lines.join('\n')}`;
  }
  return { weakPrinciples, preamble };
}

export interface LedgerSummary {
  totalDistinctDefects: number;
  totalObservations: number;
  /** Per-rule breakdown, most-frequent first — the "which mistakes recur" view. */
  byRule: Array<{ rule: string; distinct: number; observations: number; hasRule: boolean }>;
  /** The most persistent individual defects (highest observation count). */
  topRecurring: Array<{ rule: string; nodeName: string; count: number; page: string; source: DefectSource }>;
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
  const builtin = new Set(BUILTIN_RULES);
  const byRule = Array.from(ruleMap.entries())
    .map(([rule, v]) => ({ rule, ...v, hasRule: builtin.has(rule) }))
    .sort((a, b) => b.observations - a.observations);
  const topRecurring = entries
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((e) => ({ rule: e.rule, nodeName: e.nodeName, count: e.count, page: e.page, source: e.source }));
  return {
    totalDistinctDefects: entries.length,
    totalObservations,
    byRule,
    topRecurring,
    sessionsSpanned: sessions.size,
  };
}

export interface PreventionProposal {
  ruleClass: string;
  /** How many distinct instances of this class are in the ledger. */
  distinct: number;
  /** Total observations across all instances (recurrence weight). */
  observations: number;
  /** Across how many separate sessions it appeared (systemic vs one-off). */
  sessionsSpanned: number;
  /** Priority score = observations × sessionsSpanned. Higher = fix first. */
  score: number;
  /** Representative example messages (deduped), to seed the rule's heuristic. */
  examples: string[];
  /** Concrete next step: how to turn this recurring class into a rule. */
  suggestedAction: string;
}

export interface PreventionReport {
  /** Recurring defect classes that have NO mechanical rule yet — the flywheel's
   * actionable output, ranked by priority. Each is a candidate new `_lint`
   * rule. */
  proposals: PreventionProposal[];
  /** Classes that recur but ALREADY have a deterministic rule — informational
   * (the rule is working; maybe the agent keeps ignoring it). */
  coveredRecurring: Array<{ ruleClass: string; observations: number }>;
  /** Minimum observations+sessions an unruled class needs before it's proposed,
   * so a single one-off mistake doesn't spawn a rule. */
  threshold: { minObservations: number; minSessions: number };
}

/**
 * The ANALYZER step of the flywheel. Reads the durable ledger, finds defect
 * classes that (a) have no deterministic rule yet AND (b) recur enough to be
 * worth encoding, and emits a ranked, structured proposal for each — the spec
 * a human (or a later rule-drafting step) turns into a new mechanical check.
 *
 * Deliberately deterministic and NON-autonomous: it PROPOSES, it does not
 * write or deploy rules. Installing a self-authored check into production
 * stays human-gated on purpose.
 */
export async function proposePrevention(
  minObservations = 3,
  minSessions = 1
): Promise<PreventionReport> {
  const entries = await loadRaw();
  const builtin = new Set(BUILTIN_RULES);

  interface Agg {
    distinct: number;
    observations: number;
    sessions: Set<string>;
    examples: Set<string>;
    covered: boolean;
  }
  const byClass = new Map<string, Agg>();
  for (const e of entries) {
    const a =
      byClass.get(e.rule) ??
      { distinct: 0, observations: 0, sessions: new Set<string>(), examples: new Set<string>(), covered: builtin.has(e.rule) };
    a.distinct += 1;
    a.observations += e.count;
    a.sessions.add(e.session);
    if (e.message && a.examples.size < 3) a.examples.add(e.message);
    byClass.set(e.rule, a);
  }

  const proposals: PreventionProposal[] = [];
  const coveredRecurring: Array<{ ruleClass: string; observations: number }> = [];

  for (const [ruleClass, a] of byClass) {
    if (a.covered) {
      if (a.observations >= minObservations) {
        coveredRecurring.push({ ruleClass, observations: a.observations });
      }
      continue;
    }
    const sessionsSpanned = a.sessions.size;
    if (a.observations < minObservations || sessionsSpanned < minSessions) continue;
    proposals.push({
      ruleClass,
      distinct: a.distinct,
      observations: a.observations,
      sessionsSpanned,
      score: a.observations * sessionsSpanned,
      examples: Array.from(a.examples),
      suggestedAction:
        `"${ruleClass}" recurred ${a.observations}× across ${sessionsSpanned} session(s) with no mechanical check. ` +
        `Draft a deterministic \`_lint\` rule in structural-lint.ts that detects it from the node tree, ` +
        `verify it fires on a known-bad node and stays silent on a known-good one, add it to BUILTIN_RULES ` +
        `and the DEFECT_LEDGER, then ship it (human-reviewed).`,
    });
  }

  proposals.sort((a, b) => b.score - a.score);
  coveredRecurring.sort((a, b) => b.observations - a.observations);
  return { proposals, coveredRecurring, threshold: { minObservations, minSessions } };
}

