import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { PlanCover } from '../common/PlanCover';
import welcomeUrl from '../../assets/cover-welcome.jpg';
import { MCPConnection } from './MCPConnection';
import { saveUserEmail, FLAUDE_PRICING_URL } from '../../api/supabase';
import type { License } from '../../../shared/types';

/**
 * The whole plugin, on ONE page. There is no second screen any more.
 *
 * WHAT THIS REPLACES (1): the old first run was a mascot, "Welcome to Flaude"
 * and a "Get Started" pill leading to a chat that was scenery — App.tsx passed
 * `onSendMessage={() => {}}` and an always-empty message list, so the default
 * view was an input wired to nothing while the only thing the plugin can
 * actually do, connect Claude to this file, hid behind a gear.
 *
 * WHAT THIS REPLACES (2): Settings. It held exactly two live controls — your
 * email with a Sign out button, and the collapse control — and it took a gear
 * click, a subview, and a back arrow to reach them. Worse, COLLAPSE was in
 * there: the one action you want while working (shrink this panel so it stops
 * covering the canvas) was reachable only by leaving the page that shows your
 * connection. So the gear is now the collapse button, in the same corner, and
 * the email row moved down here under the connection. Two things on one page
 * beats two things on two pages.
 *
 * The three states are exhaustive and deliberately do not overlap:
 *   anon — no email yet. One field. Nothing else, because nothing else works
 *          yet and a menu of dead options is what we just removed.
 *   free — email, no subscription. Local MCP setup + what Pro would change.
 *   pro  — connection state and the URL to paste into Claude.
 */

type MCPStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed';

interface HomeViewProps {
  license: License | null;
  mcpStatus: MCPStatus;
  hostedUrl: string;
  cliCommand: string;
  onSaveEmail: (email: string) => void;
  onSignOut: () => void;
  /** Shrink the panel to a status strip. Only offered once connected. */
  onCollapse?: () => void;
  onCopy: (text: string, which: 'desktop' | 'cli') => void;
  copied: 'desktop' | 'cli' | null;
}

export function HomeView({
  license,
  mcpStatus,
  hostedUrl,
  cliCommand,
  onSaveEmail,
  onSignOut,
  onCollapse,
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

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        overflowY: 'auto',
        boxSizing: 'border-box',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      {/* FULL BLEED on first run.

          The welcome art is a 1.98:1 strip. Dropped into a card at the top of
          a 380x560 panel it stood 178px tall, "Welcome to Flaude" shrank to
          unreadable, and the ~300px of white left underneath read as a page
          still loading. Letting it fill the panel crops the outer app icons
          but keeps the whole centre - the dock, the mark, the wordmark - at a
          size where the composition actually works, and there is no void left
          to explain.

          Only here. Once you are connected the art goes back to being a card,
          because from then on the page has content that matters more. */}
      {!hasEmail && (
        <Fragment>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `url(${welcomeUrl}) center/cover no-repeat`,
            }}
          />
          {/* Scrim at the foot only, so the capsule and its label sit on
              something quiet without flattening the flowers above them. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to top, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.90) 26%, rgba(255,255,255,0) 52%)',
            }}
          />
        </Fragment>
      )}

      {hasEmail && (
        <PlanCover
          license={license}
          onCollapse={mcpStatus === 'connected' ? onCollapse : undefined}
        />
      )}

      {!hasEmail && (
        /* CENTRED, AND PUSHED DOWN.

           The heading sat hard left at 16px above a 12px grey paragraph and a
           capsule, all crammed under the art - three left edges and no air, in
           a panel that is mostly empty below them. The cover is a centred
           composition with "Welcome to Flaude" on its own axis, so anything
           left-aligned underneath fights it.

           marginTop:auto puts the form at the FOOT of whatever height Figma
           gives the panel rather than floating mid-air under the picture. */
        <div
          style={{
            // Centred in the space the art leaves, not glued to the floor.
            // The welcome cover is a wide strip; bottom-pinning the form left
            // a ~300px void between them that read as a loading state.
            position: 'relative',
            marginTop: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            padding: '0 4px 4px',
            textAlign: 'center',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '19px',
                // Regular, not 600. Fraunces is a high-contrast serif; at
                // semibold in a 380px panel its thick strokes go heavy and
                // the word reads as a warning label.
                fontWeight: 400,
                letterSpacing: '-0.01em',
                color: 'var(--figma-color-text)',
              }}
            >
              Get connected
            </div>
            <p style={{ ...hint, marginTop: '7px', maxWidth: '300px' }}>
              Use the address you bought Flaude with, or any address if you have not yet. It works
              free.
            </p>
          </div>

          {/* ONE PILL, input and button sharing a single dark capsule.

              This is the founder's original form, restored. A stacked
              field-then-button pair is the generic web-signup shape and made a
              two-field-looking form out of one question; the capsule reads as
              a single control, which is what it is. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              borderRadius: 'var(--radius-full)',
              background: INK,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
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
                padding: '13px 18px',
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
        </div>
      )}

      {hasEmail && isPro && (
        <Section title="Claude connection">
          <StatusRow status={mcpStatus} />

          {/* TWO COPY TARGETS, and the old labels never said why you would want
              one over the other. They are the SAME server reached two ways:

                Copy connection URL — the https://…/sse address you paste into
                the Claude DESKTOP app (Settings -> Connectors -> Add custom
                connector). GUI, done once, no terminal.

                Copy the CLI command — `claude mcp add flaude --transport sse
                …`, which registers that same URL with CLAUDE CODE from a
                terminal. (Confirmed against api/connection.ts: it really is
                the Claude Code CLI, not a "CLA" anything.)

              So the choice is not two products, it is which Claude you use.
              The labels now say that, and the second is a real button rather
              than an underlined link pretending to be prose. */}
          <p style={hint}>Paste this into Claude, once.</p>

          <CopyButton
            primary
            done={copied === 'desktop'}
            onClick={() => onCopy(hostedUrl, 'desktop')}
            label="Copy connection URL"
            sub="Claude desktop app · Settings → Connectors"
          />
          <CopyButton
            done={copied === 'cli'}
            onClick={() => onCopy(cliCommand, 'cli')}
            label="Copy terminal command"
            sub="Claude Code"
          />
        </Section>
      )}

      {hasEmail && !isPro && (
        <Fragment>
          <Section title="Claude connection">
            <MCPConnection license={license} />
          </Section>
          <a href={FLAUDE_PRICING_URL} target="_blank" rel="noreferrer" style={upsell}>
            <span style={{ fontWeight: 600 }}>Skip the local server</span>
            <span style={{ opacity: 0.7 }}>
              {/* No price. A number baked into a shipped plugin binary cannot
                  be corrected without a re-release, so it lies for as long as
                  the old build is installed. Prices live in the website's
                  plans.ts, which this link goes to. */}
              Pro is one URL pasted into Claude. Nothing to run on your machine.
            </span>
          </a>
        </Fragment>
      )}

      {/* The whole of the old Settings page, now a single row where it belongs:
          under the thing it identifies. */}
      {hasEmail && (
        <div style={accountRow}>
          <span
            style={{
              fontSize: '12px',
              color: 'var(--figma-color-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {license?.email}
          </span>
          <button onClick={onSignOut} style={quietButton}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A titled group.
 *
 * The title is Fraunces, the website's display serif, at a readable size
 * instead of 11px letter-spaced uppercase grey. That treatment is the default
 * "settings label" look of every plugin in the Figma sidebar, and it made the
 * one sentence of structure this panel has read like fine print.
 */
function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          fontWeight: 400,
          letterSpacing: '-0.01em',
          color: 'var(--figma-color-text)',
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
 * Copy button with a two-line label.
 *
 * The confirmation used to repaint the entire button flat green — the loudest
 * element on the page, for two seconds, to report a success nobody doubted.
 * Now only the glyph and label change and the surface holds still, so the eye
 * is not yanked back to a button you have finished with.
 */
function CopyButton({
  label,
  sub,
  done,
  primary,
  onClick,
}: {
  label: string;
  sub: string;
  done: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '11px 14px',
        textAlign: 'left',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        // Ink, not the blue gradient that was here. The gradient was borrowed
        // from the website's hero CTA, where it sits on artwork; dropped into
        // a white Figma panel it was a saturated slab with nothing to hold it.
        ...(primary
          ? { background: INK, color: '#ffffff', border: 'none' }
          : {
              background: 'var(--figma-color-bg-secondary)',
              color: 'var(--figma-color-text)',
              border: '1px solid var(--card-border)',
            }),
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          flexShrink: 0,
          color: done ? 'var(--color-success)' : 'currentColor',
          opacity: done ? 1 : 0.75,
        }}
      >
        {done ? (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>
          {done ? 'Copied' : label}
        </span>
        <span style={{ display: 'block', fontSize: '11px', opacity: 0.65, marginTop: '1px' }}>
          {sub}
        </span>
      </span>
    </button>
  );
}

/**
 * The connection, stated plainly.
 *
 * The dot used to be an 8px green circle floating in a grey bar — read as
 * decoration, or as a bullet point, and it said nothing the sentence next to
 * it did not. It is now a ring: a filled core inside a soft halo of the same
 * hue, which reads as a signal lamp rather than a dot, and the whole row is
 * tinted with the state's colour so status is legible before you read a word.
 */
function StatusRow({ status }: { status: MCPStatus }) {
  const map: Record<MCPStatus, { color: string; halo: string; tint: string; text: string }> = {
    connected: {
      color: '#10b981',
      halo: 'rgba(16, 185, 129, 0.22)',
      tint: 'rgba(16, 185, 129, 0.09)',
      text: 'Connected to Claude',
    },
    connecting: {
      color: '#eab308',
      halo: 'rgba(234, 179, 8, 0.22)',
      tint: 'rgba(234, 179, 8, 0.09)',
      text: 'Connecting…',
    },
    disconnected: {
      color: 'var(--figma-color-text-tertiary)',
      halo: 'rgba(120, 120, 120, 0.18)',
      tint: 'var(--figma-color-bg-secondary)',
      text: 'Not connected yet',
    },
    error: {
      color: '#ef4444',
      halo: 'rgba(239, 68, 68, 0.22)',
      tint: 'rgba(239, 68, 68, 0.09)',
      text: 'Connection dropped. It will retry on its own',
    },
    auth_failed: {
      color: '#ef4444',
      halo: 'rgba(239, 68, 68, 0.22)',
      tint: 'rgba(239, 68, 68, 0.09)',
      text: 'Subscription not recognised. Sign out and back in',
    },
  };
  const { color, halo, tint, text } = map[status];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '11px 13px',
        borderRadius: 'var(--radius-md)',
        background: tint,
        fontSize: '12.5px',
        fontWeight: 500,
        color: 'var(--figma-color-text)',
      }}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: color,
          // The halo is a spread shadow rather than a wrapper element, so the
          // core stays fully saturated instead of inheriting the ring's alpha.
          boxShadow: `0 0 0 4px ${halo}`,
          margin: '0 3px',
          flexShrink: 0,
          animation: status === 'connecting' ? 'pulse 1.6s ease-in-out infinite' : 'none',
        }}
      />
      {text}
    </div>
  );
}

/** Near-black, shared by the email capsule and the primary button. */
const INK = 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)';

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
  textDecoration: 'none',
  cursor: 'pointer',
};

const accountRow: h.JSX.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  marginTop: 'auto',
  paddingTop: '12px',
  borderTop: '1px solid var(--card-border)',
};

const quietButton: h.JSX.CSSProperties = {
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 500,
  borderRadius: 'var(--radius-full)',
  border: '1px solid var(--card-border)',
  background: 'transparent',
  color: 'var(--figma-color-text-secondary)',
  cursor: 'pointer',
  flexShrink: 0,
};

const hint: h.JSX.CSSProperties = {
  margin: 0,
  fontSize: '11.5px',
  lineHeight: 1.5,
  color: 'var(--figma-color-text-secondary)',
};

const errorText: h.JSX.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  color: '#ef4444',
};
