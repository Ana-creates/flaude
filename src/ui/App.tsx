import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { on, emit } from '@create-figma-plugin/utilities';
import { ChatView } from './components/features/ChatView';
import { SettingsView } from './components/features/SettingsView';
import { DEFAULT_MODEL, UI_DIMENSIONS } from '../shared/constants/defaults';
import { generateLicenseKey } from '../shared/utils/license';
import { saveUserEmail, checkProSubscription } from './api/supabase';
import { mcpClient } from './mcp/websocket-client';
import type { ChatMessage, SelectionContext, Settings, License } from '../shared/types';
import './styles/globals.css';
import mascotUrl from './assets/mascot.png';

type MCPStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed';

type View = 'chat' | 'settings';

export function App() {
  const [view, setView] = useState<View>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>({ apiKey: '', hasApiKey: false, model: DEFAULT_MODEL });
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [licenseWarning, setLicenseWarning] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<MCPStatus>('disconnected');
  const [isCollapsed, setIsCollapsed] = useState(false);


  // Setup event listeners for plugin communication
  useEffect(() => {
    // Settings loaded from plugin storage
    on('SETTINGS_LOADED', (payload: Settings) => {
      setSettings(payload);
    });

    // Selection context from Figma
    on('SELECTION_CONTEXT', (context: SelectionContext) => {
      setSelectionContext(context);
    });

    // General errors from plugin
    on('ERROR', ({ message }: { message: string }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
    });

    // License loaded
    on('LICENSE_LOADED', (payload: { license: License | null; analysesUsedThisMonth: number }) => {
      setLicense(payload.license);
    });

    // Load initial data from plugin
    emit('LOAD_SETTINGS');
    emit('GET_SELECTION_CONTEXT');
    emit('LOAD_LICENSE');
  }, []);

  // Track MCP connection status
  useEffect(() => {
    mcpClient.onStatusChange((status) => {
      setMcpStatus(status);
      // Auto-expand when disconnected
      if (status === 'disconnected' || status === 'error') {
        setIsCollapsed(false);
        emit('RESIZE_UI', { width: UI_DIMENSIONS.width, height: UI_DIMENSIONS.height });
      }
    });
  }, []);

  // Collapse/expand handlers
  const handleCollapse = useCallback(() => {
    setIsCollapsed(true);
    emit('RESIZE_UI', { width: UI_DIMENSIONS.collapsedWidth, height: UI_DIMENSIONS.collapsedHeight });
  }, []);

  const handleExpand = useCallback(() => {
    setIsCollapsed(false);
    emit('RESIZE_UI', { width: UI_DIMENSIONS.width, height: UI_DIMENSIONS.height });
  }, []);

  // Save email to Supabase for community tracking
  useEffect(() => {
    if (license?.email) {
      saveUserEmail(license.email).catch(() => {
        console.log('[Flaude] Could not save email (network error)');
      });
    }
  }, [license?.email]);

  // Auto-connect the WebSocket whenever we have a Pro license.
  // (Free users have to opt in via the legacy MCPConnection Connect button
  // because their MCP runs locally and may not be started yet.)
  useEffect(() => {
    mcpClient.setLicense(license);
    if (license?.plan === 'pro' && license.email) {
      console.log('[Flaude] Pro license detected — auto-connecting to hosted MCP');
      mcpClient.connect();
    } else {
      // Disconnect if license was cleared or downgraded
      mcpClient.disconnect();
    }
  }, [license?.plan, license?.email]);



  // === License handlers ===

  const handleDeactivateLicense = useCallback(() => {
    setLicense(null);
    emit('SAVE_LICENSE', null);
  }, []);

  const handleActivateLicense = useCallback(async (email: string) => {
    const normalizedEmail = email.toLowerCase().trim();

    // Check real subscription status against Supabase.
    // Free users get plan='free' → websocket-client uses local MCP.
    // Paid users get plan='pro' → websocket-client uses hosted MCP at flaude-pro-mcp.fly.dev.
    const proCheck = await checkProSubscription(normalizedEmail);

    const newLicense: License = {
      email: normalizedEmail,
      key: generateLicenseKey(normalizedEmail),
      plan: proCheck.isPro ? 'pro' : 'free',
      activatedAt: Date.now(),
    };
    setLicense(newLicense);
    emit('SAVE_LICENSE', newLicense);
  }, []);

  // Collapsed view - minimal UI when MCP is connected
  if (isCollapsed && mcpStatus === 'connected') {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: 'var(--figma-color-bg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#22c55e',
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--figma-color-text)' }}>
            Connected to Claude Code
          </span>
        </div>
        <button
          onClick={handleExpand}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: 'var(--figma-color-bg-secondary)',
            color: 'var(--figma-color-text-secondary)',
            cursor: 'pointer',
          }}
          title="Expand plugin"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--figma-color-bg)',
      }}
    >
      {/* Header */}
      {view === 'chat' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--card-border)',
          }}
        >
          {/* Logo & Tagline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img
              src={mascotUrl}
              alt="Flaude"
              style={{
                width: '32px',
                height: '32px',
                objectFit: 'contain',
              }}
            />
            <div>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--figma-color-text)' }}>
                Flaude
              </span>
              <span style={{ fontSize: '11px', color: 'var(--figma-color-text-tertiary)', marginLeft: '8px' }}>
                AI Design Assistant
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Minimize button - only show when MCP is connected */}
            {mcpStatus === 'connected' && (
              <button
                onClick={handleCollapse}
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
            <button
              onClick={() => setView('settings')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--figma-color-bg-secondary)',
                color: 'var(--figma-color-text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title="Settings"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          className="fade-in"
          style={{
            margin: '0 16px 12px',
            padding: '12px 16px',
            fontSize: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: '#dc2626',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}


      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'chat' && (
          <ChatView
            messages={messages}
            isLoading={false}
            hasApiKey={settings.hasApiKey}
            selectionContext={selectionContext}
            agentStatus={null}
            userEmail={license?.email || null}
            onSaveEmail={handleActivateLicense}
            onSendMessage={() => {}}
            onQuickAction={() => {}}
            onOpenSettings={() => setView('settings')}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            apiKey={settings.apiKey}
            hasApiKey={settings.hasApiKey}
            model={settings.model}
            license={license}
            analysesUsedThisMonth={0}
            isLoading={false}
            connectionTestResult={null}
            mcpConnected={mcpStatus === 'connected'}
            onSaveApiKey={() => {}}
            onSaveModel={() => {}}
            onActivateLicense={handleActivateLicense}
            onActivatePro={handleActivateLicense}
            onDeactivateLicense={handleDeactivateLicense}
            onTestConnection={() => {}}
            onBack={() => setView('chat')}
            onCollapse={handleCollapse}
          />
        )}
      </div>
    </div>
  );
}
