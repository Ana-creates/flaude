import type { License } from '../../shared/types';

/**
 * The strings a Pro user pastes into Claude, derived in ONE place.
 *
 * These used to be built inside SettingsView. Now that the home screen also
 * offers "Copy connection URL", two copies of this logic would be two chances
 * to drift — and the thing that drifts is the auth mode, which is exactly the
 * thing that silently breaks a connection.
 *
 * Prefer the Bearer token (a real secret). The ?email= form is the legacy
 * fallback for licences activated before token auth existed, and it dies when
 * the server's migration window closes.
 */
export function hostedSseUrl(license: License | null): string {
  if (license?.mcpToken) {
    return `https://flaude-pro-mcp.fly.dev/sse?token=${encodeURIComponent(license.mcpToken)}`;
  }
  if (license?.email) {
    return `https://flaude-pro-mcp.fly.dev/sse?email=${encodeURIComponent(license.email)}`;
  }
  return 'https://flaude-pro-mcp.fly.dev/sse?email=<your-email>';
}

export function cliCommandFor(license: License | null): string {
  if (license?.mcpToken) {
    return `claude mcp add flaude --transport sse https://flaude-pro-mcp.fly.dev/sse --header "Authorization: Bearer ${license.mcpToken}"`;
  }
  return `claude mcp add flaude --transport sse ${hostedSseUrl(license)}`;
}

/**
 * Copy text, in a sandboxed iframe.
 *
 * navigator.clipboard is frequently blocked by Figma's iframe permissions, and
 * when it is, the promise rejects rather than falling back — so a plain
 * writeText() call looks like a dead button. The textarea + execCommand path
 * is deprecated everywhere and still the only thing that reliably works here.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Blocked. Fall through.
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
