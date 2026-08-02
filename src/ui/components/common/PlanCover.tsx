import { h } from 'preact';
import type { License } from '../../../shared/types';
import coverUrl from '../../assets/cover-dock.jpg';

/**
 * The plugin's one piece of artwork, and the only place it states who you are.
 *
 * Design note — why this image and not the flower shop. The website's hero is
 * atmosphere; reusing it here would make the plugin look like a second
 * homepage in a 400px panel where atmosphere has nowhere to breathe. The
 * referral dock (Claude → Flaude → Figma) states the product relationship in
 * one glance, which is exactly the thing a first-run user is trying to work
 * out, and it already has a bright centre for a badge to sit against.
 *
 * It replaces the old header, which was a mascot, the word "Flaude", the words
 * "AI Design Assistant", and three icon buttons — four pieces of chrome above
 * a panel whose entire job is one connection.
 *
 * The asset is the referral art with its baked-in "PRO" pill painted out
 * (reconstructed from the dock's own vertical symmetry). That pill contradicted
 * the badge below it for every free user — artwork saying PRO over a badge
 * saying Free — and left two places claiming to state the plan. Now the badge
 * is the only one, so it can never disagree with itself.
 */

export type CoverTone = 'pro' | 'free' | 'anon';

/**
 * Turn a licence into the line a customer can check against their receipt.
 *
 * A bare "PRO" is unfalsifiable from the user's side: someone on the monthly
 * plan and someone who paid once for lifetime see the identical badge, so
 * neither can tell whether the plugin has their subscription right. (No prices
 * anywhere in this plugin — they live in the website's plans.ts and a number
 * baked into a shipped binary cannot be corrected without a re-release.) Trials matter most of
 * all — the schema stores an active trial as status='active' (so Pro unlocks),
 * which means without trialEndsAt the plugin would tell a trialist they are a
 * paying subscriber and then silently stop working on them.
 */
export function isTrialling(license: License | null): boolean {
  return license?.plan === 'pro' && !!license.trialEndsAt && license.trialEndsAt > Date.now();
}

export function planLabel(license: License | null): string {
  if (license?.plan !== 'pro') return 'Free';
  if (isTrialling(license)) {
    const days = Math.max(1, Math.ceil((license.trialEndsAt! - Date.now()) / 86_400_000));
    return `Trial · ${days} day${days === 1 ? '' : 's'} left`;
  }
  switch (license.interval) {
    case 'month':
      return 'Pro · Monthly';
    case 'year':
      return 'Pro · Yearly';
    case 'lifetime':
      return 'Pro · Lifetime';
    default:
      // An older stored licence with no interval. "Pro" alone is vague but
      // TRUE; inventing an interval to fill the gap would not be.
      return 'Pro';
  }
}

interface PlanCoverProps {
  license: License | null;
  /** Shown under the badge. Kept short - this is a 400px panel. */
  caption: string;
  onSettings?: () => void;
  /**
   * Before the user has told us who they are, the cover is ARTWORK ONLY.
   *
   * It used to show a "Free" badge and a caption on first run. Both were
   * claims about an account that does not exist yet: nobody has signed in, so
   * the plugin cannot know whether they are free, trialling or a lifetime
   * customer typing the address they bought with. Greeting that person with
   * "Free" both tells them something untrue and downgrades them in the one
   * moment they are deciding whether this is worth their email.
   *
   * The artwork already carries the icon and the Claude-to-Figma relationship,
   * so the plate says everything a first-run cover should.
   */
  plain?: boolean;
}

export function PlanCover({ license, caption, onSettings, plain = false }: PlanCoverProps) {
  const isPro = license?.plan === 'pro';
  const label = planLabel(license);

  return (
    <div
      style={{
        position: 'relative',
        // 16:9-ish. The dock artwork is 880x543; anything shorter crops the
        // flowers off its corners and the composition stops reading.
        aspectRatio: '880 / 543',
        // The parent is a flex column; without this the cover is squeezed
        // shorter on the states that have more content below it, so the
        // artwork changed height depending on your plan.
        flexShrink: 0,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: `url(${coverUrl}) center/cover no-repeat`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      {/* Scrim only at the foot. The artwork's own centre is where the three
          icons live, and darkening that to make text legible would destroy the
          one thing the image is for. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: plain
            ? 'none'
            : 'linear-gradient(to top, rgba(4,12,48,0.88) 0%, rgba(4,12,48,0.45) 34%, rgba(4,12,48,0) 62%)',
        }}
      />

      {onSettings && (
        <button
          onClick={onSettings}
          title="Settings"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            border: 'none',
            borderRadius: 'var(--radius-full)',
            // Glass, matching the artwork's own dock rather than Figma's grey
            // chrome — a plain secondary button here looked stuck on.
            background: 'rgba(255,255,255,0.16)',
            backdropFilter: 'blur(8px)',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {!plain && (
        <div style={{ position: 'relative', padding: '0 14px 14px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: 'var(--radius-full)',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: '#ffffff',
              background: isPro ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.35)',
              backdropFilter: 'blur(10px)',
            }}
          >
            {isPro && (
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
            {label}
          </div>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '12px',
              lineHeight: 1.45,
              color: 'rgba(255,255,255,0.88)',
            }}
          >
            {caption}
          </p>
        </div>
      )}
    </div>
  );
}
