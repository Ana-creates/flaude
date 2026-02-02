/**
 * Supabase client for subscriber management
 *
 * Handles Pro subscription activation and verification
 */

const SUPABASE_URL = 'https://lrgwkvmiihatpfiesima.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NCa4zE_gcw-6ns_Cu53yXQ_Y873IfDC';

// Edge Function URL (handles CORS properly)
const ADD_SUBSCRIBER_URL = `${SUPABASE_URL}/functions/v1/add-subscriber`;

interface Subscriber {
  email: string;
  activated_at: string;
  verified: boolean;
}

/**
 * Activate Pro for an email (honor system)
 * User claims they paid, we add them to the database
 */
export async function activateProSubscription(email: string): Promise<{ success: boolean; error?: string }> {
  console.log('[Supabase] Attempting to record subscriber:', email);

  try {
    // Use Edge Function which handles CORS properly (no auth needed)
    const response = await fetch(ADD_SUBSCRIBER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email.toLowerCase().trim() }),
    });

    console.log('[Supabase] Response status:', response.status);

    if (response.ok) {
      console.log('[Supabase] Success!');
      return { success: true };
    }

    const errorData = await response.json().catch(() => ({}));
    console.error('[Supabase] Error response:', errorData);
    return { success: false, error: errorData.error || 'Failed to record' };
  } catch (err) {
    console.error('[Supabase] Fetch error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Check if an email has Pro subscription
 */
export async function checkProSubscription(email: string): Promise<{ isPro: boolean; verified: boolean }> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/subscribers?email=eq.${encodeURIComponent(normalizedEmail)}&select=email,verified`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    if (!response.ok) {
      return { isPro: false, verified: false };
    }

    const data: Subscriber[] = await response.json();

    if (data.length === 0) {
      return { isPro: false, verified: false };
    }

    return { isPro: true, verified: data[0].verified };
  } catch {
    return { isPro: false, verified: false };
  }
}

/**
 * Revolut payment link
 */
export const REVOLUT_PAYMENT_LINK = 'https://checkout.revolut.com/pay/fe98f40c-fd93-41cf-82fd-a34a204fabca';
