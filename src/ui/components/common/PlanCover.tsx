import { h } from 'preact';
import type { License } from '../../../shared/types';
import coverUrl from '../../assets/cover-dock.jpg';
import shopUrl from '../../assets/cover-shop.jpg';

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
    return `TRIAL · ${days} DAY${days === 1 ? '' : 'S'} LEFT`;
  }
  switch (license.interval) {
    case 'month':
      return 'PRO · MONTHLY';
    case 'year':
      return 'PRO · YEARLY';
    case 'lifetime':
      return 'PRO · LIFETIME';
    default:
      // An older stored licence with no interval. "Pro" alone is vague but
      // TRUE; inventing an interval to fill the gap would not be.
      return 'PRO';
  }
}

interface PlanCoverProps {
  license: License | null;
  /**
   * Before the user has told us who they are, the cover is a DIFFERENT image
   * and carries no badge.
   *
   * It used to be the same dock artwork as the signed-in state with a "Free"
   * pill on it. Two problems in one. The badge was a claim about an account
   * that does not exist yet - nobody has signed in, so the plugin cannot know
   * whether they are free, trialling, or a lifetime customer about to type the
   * address they bought with; greeting that person with "Free" is both untrue
   * and a downgrade in the one moment they are deciding whether to hand over
   * an email. And reusing one image for first run and steady state meant
   * connecting your account changed nothing visible: the reward for the only
   * action on the page was the same picture you were already looking at.
   *
   * So first run gets the flower shop with the Flaude mark at its centre - the
   * brand, and nothing claimed - and the Claude-to-Figma dock arrives when the
   * connection does.
   */
  plain?: boolean;
  /**
   * Shrink the panel to a status strip. This is the gear's old corner.
   *
   * It used to live inside Settings, which meant the one control you want
   * WHILE WORKING - get this panel off my canvas - was three clicks deep,
   * behind the page that shows your connection. Settings is gone; this is what
   * that corner does now, and only once there is a live connection worth
   * collapsing down to.
   */
  onCollapse?: () => void;
}

export function PlanCover({ license, plain = false, onCollapse }: PlanCoverProps) {
  const isPro = license?.plan === 'pro';
  const label = planLabel(license);

  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '880 / 543',
        // The parent is a flex column; without this the cover is squeezed
        // shorter on the states that have more content below it, so the
        // artwork changed height depending on your plan.
        flexShrink: 0,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: `url(${plain ? shopUrl : coverUrl}) center/cover no-repeat`,
      }}
    >
      {onCollapse && (
        <button
          onClick={onCollapse}
          title="Collapse to a status strip"
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
            // chrome - a plain secondary button here looked stuck on.
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
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      )}

      {/* TOP CENTRE, not bottom left, and no caption under it.

          The caption said "Thanks for subscribing. Claude is wired straight
          into this file." Thanking someone for paying, every single time they
          open the plugin, is a receipt they did not ask for; and the sentence
          restated what the connection row below already reports, except the
          row reports it LIVE and the caption asserted it whether or not the
          server was reachable. The badge alone is now the claim, and it only
          claims the thing the licence actually knows: which plan you are on.

          The dock artwork's own composition is symmetrical about the centre
          with clear sky above it, so a centred plate sits in the one place the
          image leaves empty. Bottom-left needed a scrim across the whole foot
          of the picture to stay legible, which flattened the flowers. */}
      {!plain && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#ffffff',
              background: isPro ? 'rgba(255,255,255,0.24)' : 'rgba(10,14,40,0.42)',
              border: '1px solid rgba(255,255,255,0.4)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            }}
          >
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
