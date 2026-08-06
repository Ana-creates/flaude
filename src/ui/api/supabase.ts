/**
 * Supabase client — single project hosts:
 *   - `subscribers` table (community email collection from OSS welcome screen)
 *   - `Subscription` / `User` / `Order` tables (Pro subscriptions, managed by flaude-website / Prisma)
 */

import { WEBSITE_BASE_URL } from './handoff';

const SUPABASE_URL = 'https://tmuevunmxwmrmluxzayd.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtdWV2dW5teHdtcm1sdXh6YXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQ3NzAsImV4cCI6MjA5MTA2MDc3MH0.orAhD15AB3F-Xub2on7kJNiBMdjyJKtWB6LBIS8lMjI';

// Aliases (kept for readability across function bodies)
const EMAIL_SUPABASE_URL = SUPABASE_URL;
const EMAIL_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
const SUBSCRIPTION_SUPABASE_URL = SUPABASE_URL;
const SUBSCRIPTION_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

/**
 * Where the plugin sends someone who wants to buy.
 *
 * IT NO LONGER HARDCODES PRICES OR CHECKOUT LINKS. This file used to declare
 * a lifetime price and a monthly price as constants, next to two raw Revolut
 * payment links. Every one of those four facts was stale. The real plans —
 * monthly, yearly and lifetime, with their amounts — live in ONE place,
 * flaude-website/src/lib/plans.ts, and are sold through the site's own
 * checkout, which enforces trial eligibility, referral codes and team seats
 * that a fixed Revolut link bypasses entirely.
 *
 * A price baked into a shipped plugin binary cannot be corrected without a
 * re-release, so the plugin now states no price at all and hands off to the
 * page that owns them. If you find yourself adding a number here, don't.
 */
export const FLAUDE_PRICING_URL = 'https://www.flaude.app/pricing';

/**
 * What the customer actually bought, for the plugin to say back to them.
 *
 * `interval` is the Subscription row's own column: 'month' | 'year' |
 * 'lifetime'. We surface it because a paying customer opening the plugin and
 * seeing a bare "PRO" badge cannot tell which plan the plugin thinks they are
 * on — it holds that fact and used to throw it away. The interval only; the
 * AMOUNT stays out of the plugin (see FLAUDE_PRICING_URL below).
 * `trialEndsAt` is non-null only during a card-required free trial, which the
 * schema deliberately models as status='active' so Pro unlocks; without
 * reading it the plugin would tell a trialist they are a paid subscriber.
 */
export type PlanInterval = 'month' | 'year' | 'lifetime' | null;

export interface ProStatus {
  isPro: boolean;
  currentPeriodEnd: Date | null;
  interval: PlanInterval;
  /** Non-null while a free trial is running. */
  trialEndsAt: Date | null;
}

// Cache subscription checks for an hour to reduce API calls on plugin startup
const SUBSCRIPTION_CACHE_TTL = 60 * 60 * 1000;
type CachedResult = ProStatus & {
  expiry: number;
};
const subscriptionCache = new Map<string, CachedResult>();

/**
 * Save a user's email to the community subscribers table. Best-effort, silent failure.
 */
export async function saveUserEmail(email: string): Promise<void> {
  const normalized = email.toLowerCase().trim();
  try {
    await fetch(`${EMAIL_SUPABASE_URL}/rest/v1/subscribers`, {
      method: 'POST',
      headers: {
        apikey: EMAIL_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${EMAIL_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: normalized }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.log('[Flaude] Could not save email (network error):', err);
  }
}

/**
 * Check if an email has an active Pro subscription.
 * Queries the Prisma-managed Subscription table via Supabase REST API.
 * Side-effect: also calls saveUserEmail() so the community list stays current.
 */
export async function checkProSubscription(email: string): Promise<ProStatus> {
  const normalized = email.toLowerCase().trim();

  // Fire-and-forget: keep community list current (free users still get tracked)
  saveUserEmail(normalized).catch(() => {});

  // Cached?
  const cached = subscriptionCache.get(normalized);
  if (cached && Date.now() < cached.expiry) return stripExpiry(cached);

  try {
    // flaude.app, NOT Supabase directly.
    //
    // This used to hit /rest/v1/Subscription with the public anon key. That
    // forced the Subscription table to stay readable by anon - the one table
    // that could not have row-level security enabled - which meant anybody
    // holding the anon key (it ships in the website's own JS) could list every
    // customer email, plan and amount in the database.
    //
    // The API answers the single question this screen needs and returns only
    // the three fields below, so the table can now be locked down.
    const response = await fetch(
      `${WEBSITE_BASE_URL}/api/entitlement?email=${encodeURIComponent(normalized)}`,
      { method: 'GET', signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      // Supabase error — fall back to cached value (grace) or "free"
      return cached ? stripExpiry(cached) : FREE;
    }

    // An object now, not a PostgREST array: the API returns the resolved
    // answer rather than a raw row to be interpreted here.
    const row = (await response.json()) as {
      plan?: 'pro' | 'free';
      currentPeriodEnd?: string;
      interval?: string | null;
      trialEndsAt?: string | null;
    };
    let status: ProStatus = FREE;

    if (row?.plan === 'pro' && row.currentPeriodEnd) {
      const periodEnd = new Date(row.currentPeriodEnd);
      if (!isNaN(periodEnd.getTime()) && periodEnd > new Date()) {
        const trialEndsAt = row.trialEndsAt ? new Date(row.trialEndsAt) : null;
        status = {
          isPro: true,
          currentPeriodEnd: periodEnd,
          interval: normalizeInterval(row.interval ?? null),
          // A trial whose end date has passed is not a trial any more; the row
          // is simply not cleaned up until the renewal webhook lands.
          trialEndsAt:
            trialEndsAt && !isNaN(trialEndsAt.getTime()) && trialEndsAt > new Date()
              ? trialEndsAt
              : null,
        };
      }
    }

    subscriptionCache.set(normalized, {
      ...status,
      expiry: Date.now() + SUBSCRIPTION_CACHE_TTL,
    });
    return status;
  } catch (err) {
    console.error('[Flaude] Subscription check failed:', err);
    return cached ? stripExpiry(cached) : FREE;
  }
}

const FREE: ProStatus = {
  isPro: false,
  currentPeriodEnd: null,
  interval: null,
  trialEndsAt: null,
};

function stripExpiry(c: CachedResult): ProStatus {
  return {
    isPro: c.isPro,
    currentPeriodEnd: c.currentPeriodEnd,
    interval: c.interval,
    trialEndsAt: c.trialEndsAt,
  };
}

/** Anything unrecognised becomes null rather than being shown to the user. */
function normalizeInterval(raw: string | null): PlanInterval {
  if (raw === 'month' || raw === 'year' || raw === 'lifetime') return raw;
  return null;
}

/**
 * Called after the user clicks "Activate" — clears the cache and re-checks.
 * Returns success if their email is now in the Subscription table as active.
 */
export async function activateProSubscription(email: string): Promise<{
  success: boolean;
  isPro: boolean;
  error?: string;
  mcpToken?: string;
  status?: ProStatus;
}> {
  const normalized = email.toLowerCase().trim();

  if (!normalized || !normalized.includes('@')) {
    return { success: false, isPro: false, error: 'Please enter a valid email address.' };
  }

  // Force re-check (skip cache)
  subscriptionCache.delete(normalized);
  const result = await checkProSubscription(normalized);

  if (result.isPro) {
    // Fetch the Bearer credential for the hosted MCP. Goes through the Pro
    // server (service key), NOT Supabase directly — the anon key embedded in
    // this public plugin deliberately cannot read the mcpToken column.
    // Best-effort: activation still succeeds without it (email auth works
    // during the migration window), the connection just stays on ?email=.
    const mcpToken = await fetchMcpToken(normalized);
    return { success: true, isPro: true, mcpToken, status: result };
  }

  return {
    success: false,
    isPro: false,
    error:
      'No active Pro subscription found for this email. If you just paid, wait 30 seconds and try again.',
  };
}

/**
 * Fetch the caller's MCP Bearer token from the Pro server. Returns undefined on
 * any failure — callers treat the token as an upgrade, never a requirement.
 */
export async function fetchMcpToken(email: string): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://flaude-pro-mcp.fly.dev/my-token?email=${encodeURIComponent(email.toLowerCase().trim())}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { token?: string };
    return typeof data.token === 'string' && data.token.startsWith('mcp-')
      ? data.token
      : undefined;
  } catch {
    return undefined;
  }
}
