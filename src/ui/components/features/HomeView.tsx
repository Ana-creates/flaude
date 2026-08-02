import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { PlanCover, isTrialling } from '../common/PlanCover';
import { MCPConnection } from './MCPConnection';
import { saveUserEmail } from '../../api/supabase';
import type { License } from '../../../shared/types';

/**
 * The whole plugin, on one screen.
 *
 * WHAT THIS REPLACES. The old first run was a mascot, "Welcome to Flaude",
 * "Design with Claude directly in Figma. Free & open source." and a black
 * "Get Started" pill — a splash screen that named the product to someone who
 * had just installed it by name, and whose one button led to a chat. That chat
 * was scenery: App.tsx passed `onSendMessage={() => {}}`, `onQuickAction={()
 * => {}}` and an always-empty message list, so the plugin's default view was
 * an input box wired to nothing, and the only thing it can actually do —
 * connect Claude to this file — was hidden behind a gear icon in the corner.
 *
 * So the chat is gone and the connection is the plugin. One cover, one state,
 * one next action. Settings keeps the rarely-touched things (upgrading,
 * clearing a licence) instead of hiding the main event.
 *
 * The three states are exhaustive and deliberately do not overlap:
 *   anon — no email yet. One field. Nothing else is offered, because nothing
 *          else works yet and a menu of dead options is what we just removed.
 *   free — has an email, no subscription. Local MCP instructions + the upgrade.
 *   pro  — connection status, the URL to paste into Claude, and a thank-you.
 */

type MCPStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed';

interface HomeViewProps {
  license: License | null;
  mcpStatus: MCPStatus;
  hostedUrl: string;
  cliCommand: string;
  onSaveEmail: (email: string) => void;
  onOpenSettings: () => void;
  onCopy: (text: string, which: 'desktop' | 'cli') => void;
  copied: 'desktop' | 'cli' | null;
}

export function HomeView({
  license,
  mcpStatus,
  hostedUrl,
  cliCommand,
  onSaveEmail,
  onOpenSettings,
  onCopy,
  copied,
}: HomeViewProps) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [emailError, setEmailError] = useState('');

  const isPro = license?.plan === 'pro';
  const hasEmail = !!license?.email;

  const submitEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('That does not look like an email address.');
      return;
    }
    setEmailError('');
    setSaving(true);
    try {
      await saveUserEmail(trimmed);
      onSaveEmail(trimmed);
      setEmail('');
    } catch {
      setEmailError('Could not reach Flaude. Check your connection.');
    } finally {
      setSaving(false);
    }
  };

  const caption = isTrialling(license)
    ? 'Your trial is live. Claude is wired straight into this file.'
    : isPro
      ? 'Thanks for subscribing. Claude is wired straight into this file.'
      : hasEmail
        ? 'Connect Claude to this file through your local MCP server.'
        : /* unused while signed out - the cover is artwork only there */ '';

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <PlanCover
        license={license}
        caption={caption}
        plain={!hasEmail}
        onSettings={hasEmail ? onOpenSettings : undefined}
      />

      {!hasEmail && (
        <Section title="Get connected">
          <p style={hint}>
            Use the address you bought Flaude with, or any address if you have not yet. It works
            free.
          </p>

          {/* ONE PILL, input and button sharing a single dark capsule.

              This is the founder's original form, restored. A stacked
              field-then-button pair is the generic web-signup shape and it made
              a two-field-looking form out of one question; the capsule reads as
              a single control, which is what it is. The divider is the only
              thing separating them. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
            }}
          >
            <input
              type="email"
              value={email}
              autoFocus
              placeholder="your@email.com"
              onInput={(e) => {
                setEmail((e.target as HTMLInputElement).value);
                setEmailError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitEmail();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '13px 16px',
                fontSize: '13px',
                border: 'none',
                background: 'transparent',
                color: '#ffffff',
                outline: 'none',
              }}
            />
            <button
              onClick={submitEmail}
              disabled={saving || !email.trim()}
              style={{
                padding: '13px 18px',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                borderLeft: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: saving || !email.trim() ? 'rgba(255,255,255,0.35)' : '#ffffff',
                cursor: saving || !email.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {saving ? '…' : 'Get Started'}
            </button>
          </div>
          {emailError && <p style={errorText}>{emailError}</p>}
        </Section>
      )}

      {hasEmail && isPro && (
        <Fragment>
          <Section title="Claude connection">
            <StatusRow status={mcpStatus} />
            <p style={hint}>
              Paste this once into Claude → Settings → Connectors → Add custom connector, then
              restart Claude.
            </p>
            <button
              onClick={() => onCopy(hostedUrl, 'desktop')}
              style={{
                ...primaryButton,
                background:
                  copied === 'desktop' ? 'var(--color-success)' : primaryButton.background,
              }}
            >
              {copied === 'desktop' ? '✓ Copied' : 'Copy connection URL'}
            </button>
            <button onClick={() => onCopy(cliCommand, 'cli')} style={linkButton}>
              {copied === 'cli'
                ? '✓ Copied CLI command'
                : 'Using Claude Code? Copy the CLI command'}
            </button>
          </Section>
        </Fragment>
      )}

      {hasEmail && !isPro && (
        <Fragment>
          <Section title="Claude connection">
            <MCPConnection license={license} />
          </Section>
          <button onClick={onOpenSettings} style={upsell}>
            <span style={{ fontWeight: 600 }}>Skip the local server</span>
            <span style={{ opacity: 0.7 }}>
              {/* No price. See the note in SettingsView — a number baked into
                  a shipped plugin binary cannot be corrected without a
                  re-release. */}
              Pro is one URL pasted into Claude. Nothing to run on your machine.
            </span>
          </button>
        </Fragment>
      )}
    </div>
  );
}

/** A titled group. The plugin is 400px wide; cards inside cards read as noise. */
function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--figma-color-text-tertiary)',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

/* PasteSection DELETED.

   There was a "Paste a screen from flaude.app" button here, backed by a paste
   box in App.tsx. It described a workflow that does not exist: copying a screen
   on flaude.app puts FIGMA'S OWN clipboard bytes on your clipboard (see
   CopyToFigmaButton -> fetchFigmaClipboard on the website), so you switch to
   Figma and press Cmd-V. That is the whole flow. No plugin involved, and
   certainly not "paste the thing you copied into a text field inside a plugin
   so the plugin can paste it for you".

   It survived from an older JSON-pointer handoff that needed the plugin to
   rebuild a screen from a slug. The faithful clipboard path replaced it, and
   this button was left pointing at the dead one. */

/**
 * The connection, stated plainly.
 *
 * A green dot on its own is a decoration; people read a coloured dot as "the
 * plugin is alive". Each state names what is true and, when something is
 * wrong, what the user is supposed to do about it.
 */
function StatusRow({ status }: { status: MCPStatus }) {
  const map: Record<MCPStatus, { color: string; text: string }> = {
    connected: { color: 'var(--color-success)', text: 'Claude is connected' },
    connecting: { color: 'var(--color-warning)', text: 'Connecting…' },
    disconnected: {
      color: 'var(--figma-color-text-tertiary)',
      text: 'Not connected yet',
    },
    error: {
      color: '#ef4444',
      text: 'Connection dropped. It will retry on its own',
    },
    auth_failed: {
      color: '#ef4444',
      text: 'Subscription not recognised. Re-activate in Settings',
    },
  };
  const { color, text } = map[status];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--figma-color-bg-secondary)',
        fontSize: '12px',
        color: 'var(--figma-color-text)',
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
          animation: status === 'connecting' ? 'pulse 1.6s ease-in-out infinite' : 'none',
        }}
      />
      {text}
    </div>
  );
}

const field: h.JSX.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 13px',
  fontSize: '13px',
  border: '1px solid var(--card-border)',
  borderRadius: 'var(--radius-md)',
  backgroundColor: 'var(--figma-color-bg-secondary)',
  color: 'var(--figma-color-text)',
};

const primaryButton: h.JSX.CSSProperties = {
  width: '100%',
  padding: '11px 16px',
  fontSize: '13px',
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-md)',
  // The website's own CTA blue, not Figma's, so the plugin and the site read
  // as one product rather than two.
  background: 'linear-gradient(135deg, #2563eb 0%, #0026ff 100%)',
  color: '#ffffff',
  cursor: 'pointer',
};

const secondaryButton: h.JSX.CSSProperties = {
  width: '100%',
  padding: '11px 16px',
  fontSize: '13px',
  fontWeight: 500,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--card-border)',
  backgroundColor: 'var(--figma-color-bg-secondary)',
  color: 'var(--figma-color-text)',
  cursor: 'pointer',
};

const linkButton: h.JSX.CSSProperties = {
  width: '100%',
  padding: '4px',
  fontSize: '11px',
  background: 'transparent',
  border: 'none',
  color: 'var(--figma-color-text-tertiary)',
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
};

const upsell: h.JSX.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  width: '100%',
  padding: '12px 14px',
  textAlign: 'left',
  fontSize: '12px',
  lineHeight: 1.45,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--card-border)',
  backgroundColor: 'var(--figma-color-bg-secondary)',
  color: 'var(--figma-color-text)',
  cursor: 'pointer',
};

const hint: h.JSX.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  lineHeight: 1.5,
  color: 'var(--figma-color-text-secondary)',
};

const errorText: h.JSX.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  color: '#ef4444',
};
