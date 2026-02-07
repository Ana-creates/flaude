import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  CLAUDE_MODELS,
  PLAN_LIMITS,
  FLAUDE_PRICE,
  type ClaudeModel,
  type License,
  type PlanType,
} from '../../../shared/types';
import { MCPConnection } from './MCPConnection';
import { activateProSubscription, REVOLUT_PAYMENT_LINK } from '../../api/supabase';
import mascotUrl from '../../assets/mascot.png';
import proGradientUrl from '../../assets/pro-gradient.jpg';
import upgradeBgUrl from '../../assets/upgrade-bg.png';

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
  onDeactivateLicense,
  onTestConnection,
  onBack,
  onCollapse,
}: SettingsViewProps) {
  const [inputValue, setInputValue] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);

  // Pro activation state
  const [activationEmail, setActivationEmail] = useState('');
  const [activationStatus, setActivationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activationError, setActivationError] = useState('');
  const [hasClickedPay, setHasClickedPay] = useState(false);

  useEffect(() => {
    setInputValue(apiKey);
  }, [apiKey]);

  const handleActivatePro = () => {
    if (!activationEmail.trim()) {
      setActivationError('Please enter your payment email');
      return;
    }

    // Activate immediately (honor system - we trust the user)
    setActivationStatus('success');
    onActivateLicense(activationEmail.trim());

    // Try to record in Supabase for your audit (fire and forget - don't block)
    activateProSubscription(activationEmail.trim())
      .then((result) => {
        console.log('[Flaude] Supabase record result:', result);
      })
      .catch((err) => {
        console.error('[Flaude] Supabase record failed:', err);
      });

    setActivationEmail('');
  };

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
  const isPro = license?.plan === 'pro';
  const plan: PlanType = isPro ? 'pro' : 'free';
  const limits = PLAN_LIMITS[plan];
  const analysesRemaining = limits.analysesPerMonth === Infinity
    ? Infinity
    : Math.max(0, limits.analysesPerMonth - analysesUsedThisMonth);

  // Filter models based on plan
  const availableModels = CLAUDE_MODELS.filter(m =>
    limits.models.includes(m.id)
  );

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

        {/* Plan & MCP Section */}
        <div
          style={{
            padding: isPro ? '0' : '12px',
            marginBottom: '16px',
            borderRadius: 'var(--radius-lg)',
            background: isPro
              ? `linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 30%, rgba(0, 0, 0, 0) 60%), url(${proGradientUrl}) center/cover no-repeat`
              : `url(${upgradeBgUrl}) center/cover no-repeat`,
            border: isPro ? 'none' : 'none',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
            minHeight: isPro ? '340px' : 'auto',
            display: isPro ? 'flex' : 'block',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          {isPro ? (
            <>
              {/* Top section - Flaude Pro title */}
              <div style={{ padding: '16px 16px 0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <img
                    src={mascotUrl}
                    alt="Flaude Pro"
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
                        Flaude Pro
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-full)',
                          border: '1px solid rgba(255, 255, 255, 0.5)',
                          color: 'rgba(255, 255, 255, 0.9)',
                        }}>
                          MCP
                        </span>
                        {/* DEV: Test deactivation */}
                        <button
                          onClick={onDeactivateLicense}
                          style={{
                            fontSize: '8px',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            border: '1px dashed rgba(255,255,255,0.3)',
                            backgroundColor: 'transparent',
                            color: 'rgba(255,255,255,0.5)',
                            cursor: 'pointer',
                          }}
                        >
                          TEST
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom section - MCP Connection & License */}
              <div style={{ padding: '0 16px 16px' }}>
                {/* MCP Connection - inside Pro section */}
                <MCPConnection license={license} variant="dark" />

                {/* License info */}
                {license && (
                  <div style={{
                    marginTop: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.9)' }}>
                      Licensed to: {license.email}
                    </span>
                    <a
                      href="https://flaude.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onDeactivateLicense}
                      style={{
                        padding: '4px 8px',
                        fontSize: '10px',
                        borderRadius: '4px',
                        backgroundColor: 'transparent',
                        color: 'rgba(255, 255, 255, 0.7)',
                        cursor: 'pointer',
                        textDecoration: 'none',
                      }}
                    >
                      Deactivate
                    </a>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{
                  fontSize: '15px',
                  fontFamily: 'var(--font-display)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'var(--figma-color-text)'
                }}>
                  Design Without Limits
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--figma-color-text)',
                  color: 'var(--figma-color-text)',
                }}>
                  MCP
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--figma-color-text-secondary)', marginBottom: '12px', marginTop: 0, lineHeight: 1.5 }}>
                Works with Claude Desktop or terminal via MCP. Design entire screens, generate variants, and iterate without hitting API limits.
              </p>

              {/* Subscribe button */}
              <div style={{ marginBottom: '16px' }}>
                <a
                  href={REVOLUT_PAYMENT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setHasClickedPay(true)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 24px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
                    color: 'white',
                    textDecoration: 'none',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  Subscribe now ({FLAUDE_PRICE}) →
                </a>
              </div>

              {/* Activate section */}
              <div>
                <input
                  type="email"
                  value={activationEmail}
                  onInput={(e) => setActivationEmail((e.target as HTMLInputElement).value)}
                  placeholder="you@email.com"
                  disabled={!hasClickedPay}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: '12px',
                    border: '1px solid var(--figma-color-border)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: hasClickedPay ? 'var(--figma-color-bg)' : 'var(--figma-color-bg-tertiary)',
                    color: hasClickedPay ? 'var(--figma-color-text)' : 'var(--figma-color-text-disabled)',
                    marginBottom: '8px',
                    boxSizing: 'border-box',
                    cursor: hasClickedPay ? 'text' : 'not-allowed',
                  }}
                />
                <button
                  onClick={handleActivatePro}
                  disabled={!hasClickedPay || activationStatus === 'loading' || !activationEmail.trim()}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    background: !hasClickedPay || activationStatus === 'loading' || !activationEmail.trim()
                      ? 'var(--figma-color-bg-tertiary)'
                      : 'linear-gradient(135deg, #50BCFF 0%, #0026FF 35%, #001799 65%, #5C74FF 100%)',
                    color: !hasClickedPay || activationStatus === 'loading' || !activationEmail.trim()
                      ? 'var(--figma-color-text-disabled)'
                      : 'white',
                    cursor: !hasClickedPay || activationStatus === 'loading' || !activationEmail.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {activationStatus === 'loading' ? 'Activating...' : 'Activate my account'}
                </button>

                {activationStatus === 'error' && activationError && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#dc2626',
                    borderRadius: 'var(--radius-md)',
                  }}>
                    {activationError}
                  </div>
                )}

                {activationStatus === 'success' && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    backgroundColor: 'var(--color-success-soft)',
                    color: 'var(--color-success)',
                    borderRadius: 'var(--radius-md)',
                  }}>
                    Pro activated! Refresh to see changes.
                  </div>
                )}
              </div>

              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: 'var(--figma-color-text-tertiary)' }}>
                  Questions?{' '}
                  <a
                    href="mailto:studio@flaude.com"
                    style={{ color: 'var(--figma-color-text-tertiary)', textDecoration: 'underline' }}
                  >
                    studio@flaude.com
                  </a>
                </span>
                <img
                  src={mascotUrl}
                  alt="Flaude"
                  style={{
                    width: '28px',
                    height: '28px',
                    objectFit: 'contain',
                    transform: 'scaleX(-1)',
                    opacity: 0.6,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* API Key Section - FREE */}
        <div
          className="card"
          style={{
            padding: '16px',
            marginBottom: '16px',
            backgroundColor: 'var(--figma-color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--figma-color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--figma-color-text)' }}>
              Analyze Your Designs
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--color-success-soft)',
              color: 'var(--color-success)',
              letterSpacing: '0.5px',
            }}>
              FREE
            </span>
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--figma-color-text-secondary)',
              marginBottom: '12px',
              lineHeight: '1.5',
            }}
          >
            Connect your Claude API key to get AI-powered feedback, UX critiques, and design suggestions.
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={inputValue}
              onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
              placeholder="sk-ant-api..."
              style={{
                flex: 1,
                padding: '10px 14px',
                fontSize: '12px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--figma-color-bg)',
                color: 'var(--figma-color-text)',
                fontFamily: 'monospace',
                boxShadow: 'var(--shadow-sm)',
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                width: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--figma-color-bg)',
                color: 'var(--figma-color-text-secondary)',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showKey ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSave}
              disabled={!canSave || isLoading}
              style={{
                flex: 1,
                padding: '10px 16px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: !canSave || isLoading
                  ? 'var(--figma-color-bg-tertiary)'
                  : 'var(--figma-color-text)',
                color: !canSave || isLoading
                  ? 'var(--figma-color-text-disabled)'
                  : 'var(--figma-color-bg)',
                cursor: !canSave || isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Save Key
            </button>
            <button
              onClick={onTestConnection}
              disabled={!hasValidKey || isLoading}
              style={{
                padding: '10px 16px',
                fontSize: '12px',
                fontWeight: 500,
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--figma-color-bg)',
                color: !hasValidKey || isLoading
                  ? 'var(--figma-color-text-disabled)'
                  : 'var(--figma-color-text)',
                cursor: !hasValidKey || isLoading ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.2s ease',
              }}
            >
              {isLoading ? 'Testing...' : 'Test'}
            </button>
            {hasApiKey && (
              <button
                onClick={handleClearKey}
                disabled={isLoading}
                style={{
                  padding: '10px 16px',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#dc2626',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                Clear
              </button>
            )}
          </div>

          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              marginTop: '12px',
              fontSize: '12px',
              color: '#3b82f6',
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            Get your API key →
          </a>

          {/* Connection Test Result */}
          {connectionTestResult && (
            <div
              className="fade-in"
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                fontSize: '12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: connectionTestResult.success
                  ? 'var(--color-success-soft)'
                  : 'rgba(239, 68, 68, 0.1)',
                color: connectionTestResult.success
                  ? 'var(--color-success)'
                  : '#dc2626',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {connectionTestResult.success ? (
                  <polyline points="20 6 9 17 4 12" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </>
                )}
              </svg>
              {connectionTestResult.message}
            </div>
          )}
        </div>

        {/* Model Selection - only show when API key is configured */}
        {hasApiKey && (
          <div
            style={{
              marginBottom: '16px',
            }}
          >
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--figma-color-text)',
                marginBottom: '4px',
                paddingLeft: '4px',
              }}
            >
              Claude Model
            </label>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--figma-color-text-tertiary)',
                marginBottom: '12px',
                paddingLeft: '4px',
              }}
            >
              {isPro ? 'All models available' : 'Upgrade to Pro for Sonnet & Opus'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {CLAUDE_MODELS.map((m) => {
                const isAvailable = limits.models.includes(m.id);
                const isSelected = model === m.id;

                return (
                  <button
                    key={m.id}
                    onClick={() => isAvailable && onSaveModel(m.id)}
                    disabled={!isAvailable}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      fontSize: '12px',
                      border: isSelected ? '2px solid var(--figma-color-text)' : '1px solid var(--figma-color-border)',
                      borderRadius: 'var(--radius-lg)',
                      backgroundColor: isAvailable
                        ? 'var(--figma-color-bg)'
                        : 'var(--figma-color-bg-tertiary)',
                      color: isAvailable ? 'var(--figma-color-text)' : 'var(--figma-color-text-disabled)',
                      cursor: isAvailable ? 'pointer' : 'not-allowed',
                      textAlign: 'left',
                      boxShadow: isAvailable ? 'var(--shadow-sm)' : 'none',
                      transition: 'all 0.2s ease',
                      opacity: isAvailable ? 1 : 0.6,
                    }}
                  >
                    <div>
                      <div style={{
                        fontWeight: 600,
                        color: isAvailable ? 'var(--figma-color-text)' : 'var(--figma-color-text-disabled)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}>
                        {m.name}
                        {!isAvailable && (
                          <span style={{
                            fontSize: '9px',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--color-accent-soft)',
                            color: 'var(--color-accent)',
                            fontWeight: 700,
                          }}>
                            PRO
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--figma-color-text-tertiary)', marginTop: '2px' }}>
                        {m.description}
                      </div>
                    </div>
                    {isSelected && (
                      <div
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--figma-color-text)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--figma-color-bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
