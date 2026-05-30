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
  REVOLUT_PAYMENT_LINK,
  FLAUDE_PRICE,
} from '../../api/supabase';
import mascotUrl from '../../assets/mascot.png';
import proGradientUrl from '../../assets/pro-gradient.jpg';

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

  const copyToClipboard = (text: string, which: 'desktop' | 'cli') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopiedCommand(which);
          setTimeout(() => setCopiedCommand(null), 2000);
        },
        () => {
          // fallback for environments without clipboard API
          setCopiedCommand(which);
          setTimeout(() => setCopiedCommand(null), 2000);
        }
      );
    }
  };

  const hostedSseUrl = license?.email
    ? `https://flaude-pro-mcp.fly.dev/sse?email=${encodeURIComponent(license.email)}`
    : 'https://flaude-pro-mcp.fly.dev/sse?email=<your-email>';
  const cliCommand = `claude mcp add flaude --transport sse ${hostedSseUrl}`;

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

        {/* MCP & Email Section */}
        <div
          style={{
            padding: '0',
            marginBottom: '16px',
            borderRadius: 'var(--radius-lg)',
            background: `linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 30%, rgba(0, 0, 0, 0) 60%), url(${proGradientUrl}) center/cover no-repeat`,
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          {/* Top section - Flaude title */}
          <div style={{ padding: '16px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <img
                src={mascotUrl}
                alt="Flaude"
                style={{
                  width: '40px',
                  height: '40px',
                  objectFit: 'contain',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{
                    fontSize: '20px',
                    fontFamily: 'var(--font-display)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#ffffff'
                  }}>
                    Flaude
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-full)',
                    border: isPro
                      ? '1px solid rgba(251, 191, 36, 0.7)'
                      : '1px solid rgba(34, 197, 94, 0.6)',
                    color: isPro
                      ? 'rgba(251, 191, 36, 1)'
                      : 'rgba(34, 197, 94, 0.9)',
                    backgroundColor: isPro
                      ? 'rgba(251, 191, 36, 0.12)'
                      : 'rgba(34, 197, 94, 0.1)',
                  }}>
                    {isPro ? 'PRO' : 'FREE'}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.4 }}>
                  {isPro
                    ? 'Pro — hosted MCP, no local setup needed.'
                    : 'Free & open source. Upgrade to Pro for one-click Claude integration.'}
                </p>
              </div>
            </div>
          </div>

          {/* Bottom section - MCP Connection & Email */}
          <div style={{ padding: '12px 16px 16px' }}>
            {hasEmail ? (
              <>
                {/* MCP Connection */}
                <MCPConnection license={license} variant="dark" />

                {/* Email display */}
                <div style={{
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.9)' }}>
                    {license!.email}
                  </span>
                  <button
                    onClick={onDeactivateLicense}
                    style={{
                      padding: '4px 8px',
                      fontSize: '10px',
                      border: 'none',
                      borderRadius: '4px',
                      backgroundColor: 'transparent',
                      color: 'rgba(255, 255, 255, 0.5)',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <div style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(255,255,255,0.1)',
                textAlign: 'center',
              }}>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                  Submit your email first to connect
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────── */}
        {/* PRO UPGRADE / CONNECTED — appended bf259fe restore */}
        {/* ─────────────────────────────────────────────── */}
        {isPro ? (
          /* PRO USER — Show "how to connect Claude" with one-click copy */
          <div style={{
            padding: '16px',
            marginBottom: '16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            backgroundColor: 'rgba(251, 191, 36, 0.04)',
          }}>
            <div style={{ marginBottom: '10px' }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--figma-color-text)',
              }}>
                Connect Claude to Flaude
              </span>
              <p style={{
                fontSize: '11px',
                color: 'var(--figma-color-text-secondary)',
                margin: '4px 0 0',
                lineHeight: 1.4,
              }}>
                Paste this URL into Claude Desktop or Claude.ai → Settings → Connectors.
                Or use the CLI command for Claude Code.
              </p>
            </div>

            {/* Copy URL for Claude Desktop / Claude.ai */}
            <div style={{ marginBottom: '8px' }}>
              <button
                onClick={() => copyToClipboard(hostedSseUrl, 'desktop')}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  textAlign: 'left',
                  border: '1px solid var(--card-border)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--figma-color-bg)',
                  color: 'var(--figma-color-text)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box',
                }}
                title="Copy URL for Claude Desktop / Claude.ai"
              >
                {copiedCommand === 'desktop' ? '✓ Copied for Claude Desktop / Claude.ai' : '📋 Copy URL for Claude Desktop / Claude.ai'}
              </button>
            </div>

            {/* Copy CLI command for Claude Code */}
            <div>
              <button
                onClick={() => copyToClipboard(cliCommand, 'cli')}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  textAlign: 'left',
                  border: '1px solid var(--card-border)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--figma-color-bg)',
                  color: 'var(--figma-color-text)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box',
                }}
                title="Copy CLI command for Claude Code"
              >
                {copiedCommand === 'cli' ? '✓ Copied for Claude Code' : '📋 Copy command for Claude Code'}
              </button>
            </div>
          </div>
        ) : (
          /* FREE USER — Show Subscribe + Activate flow */
          <div style={{
            padding: '16px',
            marginBottom: '16px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--card-border)',
            backgroundColor: 'var(--figma-color-bg-secondary)',
          }}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--figma-color-text)' }}>
                  Upgrade to Flaude Pro
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(251, 191, 36, 0.5)',
                  color: 'rgba(251, 191, 36, 1)',
                  backgroundColor: 'rgba(251, 191, 36, 0.1)',
                }}>
                  {FLAUDE_PRICE} lifetime
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--figma-color-text-secondary)', margin: 0, lineHeight: 1.4 }}>
                Skip the MCP setup. Paste one URL into Claude. As easy as setting up an email account in Outlook.
              </p>
            </div>

            {/* Subscribe button */}
            <a
              href={REVOLUT_PAYMENT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setHasClickedPay(true)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 16px',
                marginBottom: '8px',
                fontSize: '12px',
                fontWeight: 600,
                textAlign: 'center',
                textDecoration: 'none',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
                color: 'white',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              {hasClickedPay ? `✓ Opened — pay ${FLAUDE_PRICE} via Revolut` : `Subscribe (${FLAUDE_PRICE}) →`}
            </a>

            {/* Activate section */}
            {hasClickedPay && (
              <div style={{ marginTop: '8px' }}>
                <p style={{ fontSize: '10px', color: 'var(--figma-color-text-secondary)', margin: '0 0 6px', lineHeight: 1.4 }}>
                  After paying, enter the email you paid with:
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
