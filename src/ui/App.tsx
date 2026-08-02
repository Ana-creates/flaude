import { h } from 'preact';
import { useState, useEffect, useCallback } from 'preact/hooks';
import { on, emit } from '@create-figma-plugin/utilities';
import { HomeView } from './components/features/HomeView';
import { SettingsView } from './components/features/SettingsView';
import { DEFAULT_MODEL, UI_DIMENSIONS } from '../shared/constants/defaults';
import { generateLicenseKey } from '../shared/utils/license';
import { saveUserEmail, checkProSubscription, fetchMcpToken } from './api/supabase';
import { readBakedLicense } from './api/baked-license';
import { hostedSseUrl, cliCommandFor, copyText } from './api/connection';
import { mcpClient } from './mcp/websocket-client';
import type { Settings, License } from '../shared/types';
import './styles/globals.css';

type MCPStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed';

type View = 'home' | 'settings';

export function App() {
  const [view, setView] = useState<View>('home');
  const [settings, setSettings] = useState<Settings>({
    apiKey: '',
    hasApiKey: false,
    model: DEFAULT_MODEL,
  });
  const [license, setLicense] = useState<License | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [licenseWarning, setLicenseWarning] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<MCPStatus>('disconnected');
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Copy-from-web -> insert: paste box open flag, in-flight flag, success banner.
  // Figma's sandbox blocks reading the clipboard, so instead of auto-reading we
  // pop a small input and let the user paste (⌘V) — a manual paste IS allowed.
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<'desktop' | 'cli' | null>(null);

  // Both the home screen and Settings offer these, from one derivation.
  const hostedUrl = hostedSseUrl(license);
  const cliCommand = cliCommandFor(license);

  const copyToClipboard = useCallback(async (text: string, which: 'desktop' | 'cli') => {
    const ok = await copyText(text);
    if (!ok) {
      setError('Could not reach the clipboard — select the text and copy it manually.');
      setTimeout(() => setError(null), 6000);
      return;
    }
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  // Setup event listeners for plugin communication
  useEffect(() => {
    // Settings loaded from plugin storage
    on('SETTINGS_LOADED', (payload: Settings) => {
      setSettings(payload);
    });

    // General errors from plugin
    on('ERROR', ({ message }: { message: string }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
    });

    // License loaded
    on('LICENSE_LOADED', (payload: { license: License | null; analysesUsedThisMonth: number }) => {
      // A zip downloaded from the signed-in studio carries its owner's
      // identity, so first run needs no email typed at all. A stored licence
      // always wins; this only fills the gap, and only upward (free -> pro),
      // so re-importing a build can never downgrade or overwrite anyone.
      const baked = readBakedLicense();
      if (baked && (!payload.license || (payload.license.plan !== 'pro' && baked.plan === 'pro'))) {
        console.log('[Flaude] Activating the licence baked into this download');
        setLicense(baked);
        emit('SAVE_LICENSE', baked);
        return;
      }
      setLicense(payload.license);
    });

    // Load initial data from plugin
    emit('LOAD_SETTINGS');
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
    emit('RESIZE_UI', {
      width: UI_DIMENSIONS.collapsedWidth,
      height: UI_DIMENSIONS.collapsedHeight,
    });
  }, []);

  const handleExpand = useCallback(() => {
    setIsCollapsed(false);
    emit('RESIZE_UI', { width: UI_DIMENSIONS.width, height: UI_DIMENSIONS.height });
  }, []);

  /* runInsert / insertCopiedScreen DELETED along with the paste box.

     It rebuilt a screen from a JSON pointer the website used to put on the
     clipboard. The website now copies Figma's OWN clipboard bytes, so Cmd-V on
     the canvas IS the paste. Keeping a plugin-side reimplementation of paste
     around meant two paste paths, one of them worse and no longer reachable. */

  // Save email to Supabase for community tracking
  useEffect(() => {
    if (license?.email) {
      saveUserEmail(license.email).catch(() => {
        console.log('[Flaude] Could not save email (network error)');
      });
    }
  }, [license?.email]);

  // Token backfill: licenses stored BEFORE token auth have no mcpToken. Fetch
  // it once and re-save, so existing Pro customers migrate to Bearer silently
  // (no re-activation) before the server's email-auth window closes.
  useEffect(() => {
    if (license?.plan !== 'pro' || !license.email || license.mcpToken) return;
    let cancelled = false;
    fetchMcpToken(license.email).then((mcpToken) => {
      if (cancelled || !mcpToken) return; // best-effort; email auth still works
      const upgraded: License = { ...license, mcpToken };
      setLicense(upgraded);
      emit('SAVE_LICENSE', upgraded);
      console.log('[Flaude] MCP token backfilled for existing Pro license');
    });
    return () => {
      cancelled = true;
    };
  }, [license?.plan, license?.email, license?.mcpToken]);

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
  }, [license?.plan, license?.email, license?.mcpToken]);

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

    // Pro users also get their MCP Bearer token so the hosted connection can
    // authenticate with a real secret instead of the (public) email.
    // Best-effort: a failed token fetch must never block activation.
    const mcpToken = proCheck.isPro ? await fetchMcpToken(normalizedEmail) : undefined;

    const newLicense: License = {
      email: normalizedEmail,
      key: generateLicenseKey(normalizedEmail),
      plan: proCheck.isPro ? 'pro' : 'free',
      activatedAt: Date.now(),
      mcpToken,
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
      {/* NO HEADER. There was a 56px bar here holding a mascot, the word
          "Flaude", the words "AI Design Assistant" and three icon buttons —
          chrome naming the product to someone who just launched it by name,
          above a 400px panel with one job. The cover art in HomeView carries
          the identity and the settings button; SettingsView keeps its own back
          bar because a subview needs a way out. */}

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
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {/* Success / notice banner (copy -> insert) */}
      {notice && (
        <div
          className="fade-in"
          style={{
            margin: '0 16px 12px',
            padding: '12px 16px',
            fontSize: '12px',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            color: '#16a34a',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {notice}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'home' && (
          <HomeView
            license={license}
            mcpStatus={mcpStatus}
            hostedUrl={hostedUrl}
            cliCommand={cliCommand}
            copied={copied}
            onSaveEmail={handleActivateLicense}
            onOpenSettings={() => setView('settings')}
            onCopy={copyToClipboard}
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
            onBack={() => setView('home')}
            onCollapse={handleCollapse}
          />
        )}
      </div>
    </div>
  );
}
