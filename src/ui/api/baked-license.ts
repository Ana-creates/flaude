import type { License } from '../../shared/types';
import { generateLicenseKey } from '../../shared/utils/license';

/**
 * Personalised-download support.
 *
 * The studio at flaude.app already knows who the user is (they are signed in
 * to reach it) and whether their subscription is active. Asking them to
 * retype that email into the plugin was pure re-authentication of a fact the
 * server already held. So the studio's download route stamps the identity
 * INTO the zip it hands out: it replaces the token below with base64 of
 * {email, plan, mcpToken}. The plugin then activates itself on first run.
 *
 * Base64 rather than raw JSON so the payload can never break out of the
 * string literal it is injected into (no quotes, no backslashes).
 *
 * An unstamped build (the generic public zip, or a dev build) keeps the
 * literal token and readBakedLicense() returns null — the manual email path
 * in Settings still works exactly as before.
 */
const BAKED_LICENSE_B64 = '__FLAUDE_BAKED_LICENSE__';

/** The placeholder, split so the build cannot fold the guard into a constant. */
const PLACEHOLDER = ['__FLAUDE', 'BAKED', 'LICENSE__'].join('_');

export function readBakedLicense(): License | null {
  const raw = BAKED_LICENSE_B64;
  if (!raw || raw === PLACEHOLDER) return null;
  try {
    const parsed = JSON.parse(atob(raw)) as Partial<License>;
    if (!parsed.email || !parsed.plan) return null;
    const licence = {
      email: String(parsed.email).toLowerCase(),
      plan: parsed.plan === 'pro' ? 'pro' : 'free',
      activatedAt: Date.now(),
      mcpToken: typeof parsed.mcpToken === 'string' ? parsed.mcpToken : undefined,
    } as License;
    licence.key = generateLicenseKey(licence.email);
    return licence;
  } catch {
    return null;
  }
}
