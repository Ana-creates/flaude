import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  CLAUDE_MODELS,
  type ClaudeModel,
  type License,
} from '../../../shared/types';
import { MCPConnection } from './MCPConnection';
import {
  saveUserEmail,
  activateProSubscription,
  FLAUDE_PRICING_URL,
} from '../../api/supabase';
import { PlanCover } from '../common/PlanCover';
import {
  hostedSseUrl as hostedSseUrlFor,
  cliCommandFor,
  copyText,
} from '../../api/connection';

interface SettingsViewProps {
  apiKey: string;
  hasApiKey: boolean;
  model: ClaudeModel;
  license: License | null;
  analysesUsedThisMonth: number;
  isLoading: boolean;
  connectionTestResult: { success: boolean; message: string } | null;
  mcpConnected?: boolean;
  onSaveApiKey: (key: string) => void;
  onSaveModel: (model: ClaudeModel) => void;
  onActivateLicense: (email: string) => void;
  onActivatePro?: (email: string) => void;
  onDeactivateLicense: () => void;
  onTestConnection: () => void;
  onBack: () => void;
  onCollapse?: () => void;
}

export function SettingsView({
  apiKey,
  hasApiKey,
  model,
  license,
  analysesUsedThisMonth,
  isLoading,
  connectionTestResult,
  mcpConnected,
  onSaveApiKey,
  onSaveModel,
  onActivateLicense,
  onActivatePro,
  onDeactivateLicense,
  onTestConnection,
  onBack,
  onCollapse,
}: SettingsViewProps) {
  const [inputValue, setInputValue] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);

  // Email collection state
  const [activationEmail, setActivationEmail] = useState('');
  const [activationStatus, setActivationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activationError, setActivationError] = useState('');

  // Pro upgrade flow state
  const [hasClickedPay, setHasClickedPay] = useState(false);
  const [proActivationEmail, setProActivationEmail] = useState('');
  const [proActivationStatus, setProActivationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [proActivationError, setProActivationError] = useState('');
  const [copiedCommand, setCopiedCommand] = useState<'desktop' | 'cli' | null>(null);

  const isPro = license?.plan === 'pro';

  useEffect(() => {
    setInputValue(apiKey);
  }, [apiKey]);

  const handleSaveEmail = async () => {
    if (!activationEmail.trim()) {
      setActivationError('Please enter your email');
      setActivationStatus('error');
      return;
    }

    setActivationStatus('loading');
    setActivationError('');

    try {
      await saveUserEmail(activationEmail.trim());
      setActivationStatus('success');
      onActivateLicense(activationEmail.trim());
      setActivationEmail('');
    } catch {
      setActivationError('Could not save email. Check your connection and try again.');
      setActivationStatus('error');
    }
  };

  const handleActivatePro = async () => {
    const emailToActivate = proActivationEmail.trim() || license?.email || '';
    if (!emailToActivate || !emailToActivate.includes('@')) {
      setProActivationError('Please enter the email you paid with.');
      setProActivationStatus('error');
      return;
    }

    setProActivationStatus('loading');
    setProActivationError('');

    const result = await activateProSubscription(emailToActivate);

    if (result.success && result.isPro) {
      setProActivationStatus('success');
      // Notify the parent so it can update the License plan to 'pro'
      if (onActivatePro) {
        onActivatePro(emailToActivate);
      } else {
        // Fallback: at least save the email
        onActivateLicense(emailToActivate);
      }
    } else {
      setProActivationStatus('error');
      setProActivationError(result.error || 'Activation failed.');
    }
  };

  const copyToClipboard = async (text: string, which: 'desktop' | 'cli') => {
    if (!(await copyText(text))) return;
    setCopiedCommand(which);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  // One derivation, shared with the home screen — see api/connection.ts. This
  // used to be duplicated here, and a second copy of the auth-mode choice is a
  // second chance to silently break someone's connection.
  const hostedSseUrl = hostedSseUrlFor(license);
  const cliCommand = cliCommandFor(license);

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onSaveApiKey(trimmed);
    }
  };

  const handleClearKey = () => {
    setInputValue('');
    onSaveApiKey('');
  };

  const hasChanges = inputValue.trim() !== apiKey;
  const hasValidKey = inputValue.trim().length > 0;
  const canSave = hasChanges && hasValidKey;
  const hasEmail = !!license?.email;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--card-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--figma-color-bg-secondary)',
              color: 'var(--figma-color-text)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--figma-color-text)' }}>
            Settings
          </span>
        </div>
        {/* Minimize button - only show when MCP is connected */}
        {mcpConnected && onCollapse && (
          <button
            onClick={onCollapse}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              color: '#22c55e',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Minimize - MCP Connected"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>

        {/* ACCOUNT ONLY.

            This used to be a 250-line clone of the home screen: the same cover
            art, the same PRO badge, the same Copy-URL / paste-into-Claude
            steps. Two places to change one flow, and the one people reached
            first (the home screen) did not exist yet — the connection lived
            HERE, behind a gear icon, which is why the plugin felt like it did
            nothing when you opened it.

            Settings is now what its name says: who you are signed in as, and
            the upgrade. The connection lives on the home screen. */}
        <PlanCover
          license={license}
          caption={
            isPro
              ? 'Thanks for subscribing.'
              : 'Free plan. Claude connects through a local MCP server.'
          }
        />

        {hasEmail && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              margin: '12px 0 16px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--card-border)',
              backgroundColor: 'var(--figma-color-bg-secondary)',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                color: 'var(--figma-color-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {license!.email}
            </span>
            <button
              onClick={onDeactivateLicense}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                fontSize: '11px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--card-border)',
                backgroundColor: 'transparent',
                color: 'var(--figma-color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        )}

        {/* ─────────────────────────────────────────────── */}
        {/* FREE USER ONLY — Pro upgrade card (Pro users see all actions in the gradient card above) */}
        {/* ─────────────────────────────────────────────── */}
        {!isPro && (
          /* FREE USER — Show Subscribe + Activate flow */
          <div style={{
            padding: '16px',
            marginBottom: '16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--card-border)',
            backgroundColor: 'var(--figma-color-bg-secondary)',
          }}>
            {/* NO PRICES HERE.

                This block used to print a lifetime price and a monthly price
                and link straight at two hardcoded Revolut payment links. All
                four facts were stale — none of those numbers matched the real
                plans, which live in plans.ts on the website — and they were
                stale in the worst possible place: a price
                baked into a shipped plugin binary cannot be corrected without
                a re-release, so it quietly lies for as long as the old build
                is installed. Those raw checkout links also bypassed trial
                eligibility, referral codes and team seats, all of which the
                site's checkout enforces server-side.

                So the plugin states no price and owns no checkout. It sends
                people to the page whose job that is. */}
            <div style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--figma-color-text)' }}>
                Upgrade to Flaude Pro
              </span>
              <p style={{ fontSize: '11px', color: 'var(--figma-color-text-secondary)', margin: '4px 0 0', lineHeight: 1.45 }}>
                Skip the local server. Paste one URL into Claude and designs
                land in this file.
              </p>
            </div>

            <a
              href={FLAUDE_PRICING_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setHasClickedPay(true)}
              style={{
                display: 'block',
                width: '100%',
                padding: '11px 16px',
                marginBottom: '8px',
                fontSize: '12px',
                fontWeight: 600,
                textAlign: 'center',
                textDecoration: 'none',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #2563eb 0%, #0026ff 100%)',
                color: 'white',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              {hasClickedPay ? '✓ Opened flaude.app/pricing' : 'See plans on flaude.app →'}
            </a>

            {/* Activate section */}
            {hasClickedPay && (
              <div style={{ marginTop: '8px' }}>
                <p style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)', margin: '0 0 6px', lineHeight: 1.4 }}>
                  Already paid? Enter the email you paid with:
                </p>
                <input
                  type="email"
                  value={proActivationEmail}
                  onInput={(e) => setProActivationEmail((e.target as HTMLInputElement).value)}
                  placeholder={license?.email || 'you@email.com'}
                  disabled={proActivationStatus === 'loading'}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    border: '1px solid var(--card-border)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--figma-color-bg)',
                    color: 'var(--figma-color-text)',
                    marginBottom: '6px',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleActivatePro}
                  disabled={proActivationStatus === 'loading'}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    background: proActivationStatus === 'loading'
                      ? 'var(--figma-color-bg-tertiary)'
                      : 'linear-gradient(135deg, #50BCFF 0%, #0026FF 35%, #001799 65%, #5C74FF 100%)',
                    color: proActivationStatus === 'loading'
                      ? 'var(--figma-color-text-disabled)'
                      : 'white',
                    cursor: proActivationStatus === 'loading' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {proActivationStatus === 'loading' ? 'Activating…' : 'Activate Pro'}
                </button>

                {proActivationStatus === 'error' && proActivationError && (
                  <p style={{ fontSize: '10px', color: 'var(--figma-color-text-danger, #e53e3e)', margin: '6px 0 0' }}>
                    {proActivationError}
                  </p>
                )}
                {proActivationStatus === 'success' && (
                  <p style={{ fontSize: '10px', color: 'rgba(34, 197, 94, 0.9)', margin: '6px 0 0' }}>
                    ✓ Activated! Reload the plugin to see Pro features.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
