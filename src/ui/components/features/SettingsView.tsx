import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  CLAUDE_MODELS,
  type ClaudeModel,
  type License,
} from '../../../shared/types';
import { MCPConnection } from './MCPConnection';
import { saveUserEmail } from '../../api/supabase';
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

  // Email collection state
  const [activationEmail, setActivationEmail] = useState('');
  const [activationStatus, setActivationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activationError, setActivationError] = useState('');

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
                    border: '1px solid rgba(34, 197, 94, 0.6)',
                    color: 'rgba(34, 197, 94, 0.9)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  }}>
                    FREE
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.4 }}>
                  Free & open source. All features unlocked.
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

        {/* API Key Section - FREE */}
        <div
          className="card"
          style={{
            padding: '16px',
            marginBottom: '16px',
            backgroundColor: 'var(--figma-color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--figma-color-border)',
            opacity: hasEmail ? 1 : 0.5,
            pointerEvents: hasEmail ? 'auto' : 'none',
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
              All models available
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {CLAUDE_MODELS.map((m) => {
                const isAvailable = true;
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
