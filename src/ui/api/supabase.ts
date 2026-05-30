/**
 * Supabase client — email collection (free) + Pro subscription verification
 *
 * Two backends:
 *   - tmuevunmxwmrmluxzayd: community email collection (free OSS users)
 *   - lrgwkvmiihatpfiesima:  Pro subscriptions (managed by flaude-website / Prisma)
 */

// Community email collection
const EMAIL_SUPABASE_URL = 'https://tmuevunmxwmrmluxzayd.supabase.co';
const EMAIL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtdWV2dW5teHdtcm1sdXh6YXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQ3NzAsImV4cCI6MjA5MTA2MDc3MH0.orAhD15AB3F-Xub2on7kJNiBMdjyJKtWB6LBIS8lMjI';

// Pro subscription verification (read-only against website's DB)
const SUBSCRIPTION_SUPABASE_URL = 'https://lrgwkvmiihatpfiesima.supabase.co';
const SUBSCRIPTION_SUPABASE_ANON_KEY =
  'sb_publishable_NCa4zE_gcw-6ns_Cu53yXQ_Y873IfDC';

// Revolut Payment Link — customers click this to buy Pro
export const REVOLUT_PAYMENT_LINK =
  'https://checkout.revolut.com/pay/fe98f40c-fd93-41cf-82fd-a34a204fabca';
export const FLAUDE_PRICE = '$45';

// Cache subscription checks for an hour to reduce API calls on plugin startup
const SUBSCRIPTION_CACHE_TTL = 60 * 60 * 1000;
type CachedResult = {
  isPro: boolean;
  currentPeriodEnd: Date | null;
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
export async function checkProSubscription(
  email: string
): Promise<{ isPro: boolean; currentPeriodEnd: Date | null }> {
  const normalized = email.toLowerCase().trim();

  // Fire-and-forget: keep community list current (free users still get tracked)
  saveUserEmail(normalized).catch(() => {});

  // Cached?
  const cached = subscriptionCache.get(normalized);
  if (cached && Date.now() < cached.expiry) {
    return { isPro: cached.isPro, currentPeriodEnd: cached.currentPeriodEnd };
  }

  try {
    const response = await fetch(
      `${SUBSCRIPTION_SUPABASE_URL}/rest/v1/Subscription?email=eq.${encodeURIComponent(
        normalized
      )}&status=eq.active&select=currentPeriodEnd&order=currentPeriodEnd.desc&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: SUBSCRIPTION_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUBSCRIPTION_SUPABASE_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      // Supabase error — fall back to cached value (grace) or "free"
      return cached
        ? { isPro: cached.isPro, currentPeriodEnd: cached.currentPeriodEnd }
        : { isPro: false, currentPeriodEnd: null };
    }

    const data = (await response.json()) as { currentPeriodEnd: string }[];
    let isPro = false;
    let currentPeriodEnd: Date | null = null;

    if (data.length > 0 && data[0].currentPeriodEnd) {
      const periodEnd = new Date(data[0].currentPeriodEnd);
      if (!isNaN(periodEnd.getTime()) && periodEnd > new Date()) {
        isPro = true;
        currentPeriodEnd = periodEnd;
      }
    }

    subscriptionCache.set(normalized, {
      isPro,
      currentPeriodEnd,
      expiry: Date.now() + SUBSCRIPTION_CACHE_TTL,
    });
    return { isPro, currentPeriodEnd };
  } catch (err) {
    console.error('[Flaude] Subscription check failed:', err);
    return cached
      ? { isPro: cached.isPro, currentPeriodEnd: cached.currentPeriodEnd }
      : { isPro: false, currentPeriodEnd: null };
  }
}

/**
 * Called after the user clicks "Activate" — clears the cache and re-checks.
 * Returns success if their email is now in the Subscription table as active.
 */
export async function activateProSubscription(
  email: string
): Promise<{ success: boolean; isPro: boolean; error?: string }> {
  const normalized = email.toLowerCase().trim();

  if (!normalized || !normalized.includes('@')) {
    return { success: false, isPro: false, error: 'Please enter a valid email address.' };
  }

  // Force re-check (skip cache)
  subscriptionCache.delete(normalized);
  const result = await checkProSubscription(normalized);

  if (result.isPro) {
    return { success: true, isPro: true };
  }

  return {
    success: false,
    isPro: false,
    error:
      'No active Pro subscription found for this email. If you just paid, wait 30 seconds and try again.',
  };
}
