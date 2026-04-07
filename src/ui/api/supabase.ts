/**
 * Supabase client for email collection
 *
 * Saves user emails to the subscribers table for community tracking
 */

const SUPABASE_URL = 'https://tmuevunmxwmrmluxzayd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtdWV2dW5teHdtcm1sdXh6YXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODQ3NzAsImV4cCI6MjA5MTA2MDc3MH0.orAhD15AB3F-Xub2on7kJNiBMdjyJKtWB6LBIS8lMjI';

/**
 * Save a user's email to the subscribers table
 */
export async function saveUserEmail(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/subscribers`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail }),
        signal: AbortSignal.timeout(8000),
      }
    );
  } catch (err) {
    console.log('[Flaude] Could not save email (network error):', err);
  }
}

/**
 * Backwards-compatible stub — always returns isPro: true since everything is free now
 */
export async function checkProSubscription(
  email: string
): Promise<{ isPro: boolean; currentPeriodEnd: Date | null }> {
  // Save the email for collection purposes
  await saveUserEmail(email);
  // Everything is free now — always return true
  return { isPro: true, currentPeriodEnd: null };
}
