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


      </div>
    </div>
  );
}
