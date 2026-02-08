/**
 * Supabase client for subscription verification
 *
 * Queries the Prisma-managed Subscription table to verify Pro status
 */

const SUPABASE_URL = 'https://lrgwkvmiihatpfiesima.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NCa4zE_gcw-6ns_Cu53yXQ_Y873IfDC';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface SubscriptionRow {
  email: string;
  status: string;
  currentPeriodEnd: string;
}

type CachedResult = { isPro: boolean; currentPeriodEnd: Date | null; expiry: number };
const cache = new Map<string, CachedResult>();

/**
 * Check if an email has an active Pro subscription
 * Queries the Prisma-managed "Subscription" table via Supabase REST API
 * Results are cached for 1 hour to reduce API calls on plugin startup
 */
export async function checkProSubscription(
  email: string
): Promise<{ isPro: boolean; currentPeriodEnd: Date | null }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Return cached result if still valid
  const cached = cache.get(normalizedEmail);
  if (cached && Date.now() < cached.expiry) {
    return { isPro: cached.isPro, currentPeriodEnd: cached.currentPeriodEnd };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/Subscription?email=eq.${encodeURIComponent(normalizedEmail)}&status=eq.active&select=email,status,currentPeriodEnd&order=currentPeriodEnd.desc&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      console.error('[Supabase] Query failed:', response.status);
      throw new Error(`Supabase query failed: ${response.status}`);
    }

    const data: SubscriptionRow[] = await response.json();

    if (data.length === 0) {
      return { isPro: false, currentPeriodEnd: null };
    }

    const sub = data[0];
    if (!sub.currentPeriodEnd) {
      return { isPro: false, currentPeriodEnd: null };
    }
    const periodEnd = new Date(sub.currentPeriodEnd);
    if (isNaN(periodEnd.getTime())) {
      return { isPro: false, currentPeriodEnd: null };
    }

    // Check if subscription is still within its period
    if (periodEnd < new Date()) {
      const result = { isPro: false, currentPeriodEnd: periodEnd };
      cache.set(normalizedEmail, { ...result, expiry: Date.now() + CACHE_TTL });
      return result;
    }

    const result = { isPro: true, currentPeriodEnd: periodEnd };
    cache.set(normalizedEmail, { ...result, expiry: Date.now() + CACHE_TTL });
    return result;
  } catch (err) {
    // Re-throw so callers can distinguish network errors from "not subscribed"
    throw err;
  }
}
