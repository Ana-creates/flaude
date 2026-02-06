import { h } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { on, emit } from '@create-figma-plugin/utilities';
import { ChatView } from './components/features/ChatView';
import { SettingsView } from './components/features/SettingsView';
import { KnowledgeBaseView } from './components/features/KnowledgeBaseView';
import { callClaudeAPI, testClaudeConnection } from './api/claude';
import { runAgent, type ToolCall, type ToolResult, type AgentUpdate } from '../plugin/agent/runner';
import { SYSTEM_PROMPTS } from '../shared/prompts';
import { DEFAULT_MODEL } from '../shared/constants/defaults';
import { generateLicenseKey } from '../shared/utils/license';
import { checkProSubscription } from './api/supabase';
import { mcpClient } from './mcp/websocket-client';
import type { ChatMessage, SelectionContext, QuickActionType, Settings, ClaudeModel, KnowledgeBase, KnowledgeCategory, License } from '../shared/types';
import './styles/globals.css';
import mascotUrl from './assets/mascot.png';

type MCPStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed';

type View = 'chat' | 'settings' | 'knowledge';

export function App() {
  const [view, setView] = useState<View>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<Settings>({ apiKey: '', hasApiKey: false, model: DEFAULT_MODEL });
  const [selectionContext, setSelectionContext] = useState<SelectionContext | null>(null);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeBase>({ entries: [], lastUpdated: 0 });
  const [license, setLicense] = useState<License | null>(null);
  const [analysesUsedThisMonth, setAnalysesUsedThisMonth] = useState(0);
  const [connectionTestResult, setConnectionTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [licenseWarning, setLicenseWarning] = useState<string | null>(null);
  const [mcpStatus, setMcpStatus] = useState<MCPStatus>('disconnected');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Keep track of chat history for context
  const chatHistoryRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);

  // Pending tool results - keyed by requestId
  const pendingToolResultsRef = useRef<Map<string, (results: ToolResult[]) => void>>(new Map());

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

    // Tool results from plugin
    on('TOOL_RESULTS', (payload: { requestId: string; results: ToolResult[]; error?: string }) => {
      const resolver = pendingToolResultsRef.current.get(payload.requestId);
      if (resolver) {
        pendingToolResultsRef.current.delete(payload.requestId);
        resolver(payload.results);
      }
    });

    // General errors from plugin
    on('ERROR', ({ message }: { message: string }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
    });

    // Knowledge base loaded
    on('KNOWLEDGE_BASE_LOADED', (kb: KnowledgeBase) => {
      setKnowledgeBase(kb);
    });

    // License loaded
    on('LICENSE_LOADED', (payload: { license: License | null; analysesUsedThisMonth: number }) => {
      setLicense(payload.license);
      setAnalysesUsedThisMonth(payload.analysesUsedThisMonth);
    });

    // Load initial data from plugin
    emit('LOAD_SETTINGS');
    emit('GET_SELECTION_CONTEXT');
    emit('LOAD_KNOWLEDGE_BASE');
    emit('LOAD_LICENSE');
  }, []);

  // Track MCP connection status
  useEffect(() => {
    mcpClient.onStatusChange((status) => {
      setMcpStatus(status);
      // Auto-expand when disconnected
      if (status === 'disconnected' || status === 'error') {
        setIsCollapsed(false);
      }
    });
  }, []);

  // DEV MODE: Skip Supabase verification during development
  const DEV_MODE = true; // Set to false for production

  // Verify Pro license against Supabase on startup (skip in dev mode)
  useEffect(() => {
    if (DEV_MODE) {
      console.log('[Flaude] DEV MODE: Skipping license verification');
      return;
    }
    if (license?.plan === 'pro' && license.email) {
      checkProSubscription(license.email).then(({ isPro, verified }) => {
        if (!isPro) {
          // Email not in subscribers table - revoke
          setLicense(null);
          emit('SAVE_LICENSE', null);
          setLicenseWarning('Your subscription could not be verified. Please contact studio@flaude.com');
        } else if (!verified) {
          // Email exists but not verified - revoke
          setLicense(null);
          emit('SAVE_LICENSE', null);
          setLicenseWarning('Your subscription could not be verified. Please contact studio@flaude.com');
        }
      }).catch(() => {
        // Network error - don't revoke, just let them use it
        console.log('[Flaude] Could not verify license (network error)');
      });
    }
  }, [license?.email]);

  // Execute tools via plugin messaging
  const executeToolsViaPlugin = useCallback(async (toolCalls: ToolCall[]): Promise<ToolResult[]> => {
    return new Promise((resolve) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingToolResultsRef.current.set(requestId, resolve);

      emit('EXECUTE_TOOLS', {
        requestId,
        toolCalls: toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          input: tc.input,
        })),
      });

      // Timeout fallback
      setTimeout(() => {
        if (pendingToolResultsRef.current.has(requestId)) {
          pendingToolResultsRef.current.delete(requestId);
          resolve(toolCalls.map(tc => ({
            toolUseId: tc.id,
            result: { error: 'Timeout waiting for tool execution' },
            isError: true,
          })));
        }
      }, 30000);
    });
  }, []);

  // Show error for 5 seconds
  const showError = useCallback((msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  }, []);

  // Add message to chat
  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const message: ChatMessage = {
      id: `${role}-${Date.now()}`,
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, message]);
    chatHistoryRef.current.push({ role, content });
  }, []);

  // Handle agent status updates
  const handleAgentUpdate = useCallback((update: AgentUpdate) => {
    if (update.type === 'thinking' || update.type === 'tool_call' || update.type === 'tool_result') {
      setAgentStatus(update.message);
    } else if (update.type === 'error') {
      showError(update.message);
      setAgentStatus(null);
    } else if (update.type === 'response') {
      setAgentStatus(null);
    }
  }, [showError]);

  // Build knowledge context string for Claude
  const buildKnowledgeContext = useCallback(() => {
    if (knowledgeBase.entries.length === 0) return '';

    const sections: string[] = [];
    sections.push('\n\n---\n## KNOWLEDGE BASE (App Context)\n');
    sections.push('The following is background knowledge about this application:\n');

    // Group by category
    const byCategory = new Map<string, typeof knowledgeBase.entries>();
    for (const entry of knowledgeBase.entries) {
      if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
      byCategory.get(entry.category)!.push(entry);
    }

    for (const [category, entries] of byCategory) {
      sections.push(`\n### ${category.toUpperCase()}\n`);
      for (const entry of entries) {
        sections.push(`**${entry.title}**\n${entry.content}\n`);
      }
    }

    sections.push('\n---\n\n');
    return sections.join('');
  }, [knowledgeBase]);

  // Handle sending a chat message - API call happens HERE in UI
  const handleSendMessage = useCallback(async (userMessage: string) => {
    if (!settings.apiKey) {
      showError('Please configure your Claude API key in settings.');
      return;
    }

    // Add user message
    addMessage('user', userMessage);

    // Build context string
    let contextStr = '';
    if (selectionContext && selectionContext.count > 0) {
      contextStr = `\n\n---\n**Current Selection Context:**\n${selectionContext.summary}\n- ${selectionContext.count} element(s) selected\n- Types: ${selectionContext.nodeTypes.join(', ')}\n---\n\n`;
    }

    // Call Claude API from UI
    setIsLoading(true);
    try {
      const response = await callClaudeAPI(
        settings.apiKey,
        [...chatHistoryRef.current.slice(0, -1), { role: 'user' as const, content: contextStr + userMessage }],
        SYSTEM_PROMPTS.chat,
        settings.model
      );
      addMessage('assistant', response);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [settings.apiKey, settings.model, selectionContext, addMessage, showError]);

  // Handle quick action with AGENT MODE - uses tools
  const handleQuickAction = useCallback(async (action: QuickActionType) => {
    if (!settings.apiKey) {
      showError('Please configure your Claude API key in settings.');
      return;
    }

    // Add user message showing the action
    const actionLabels = {
      flows: '🔀 Map User Flows',
      validate: '✅ Validate Against Requirements',
    };
    addMessage('user', `[Agent Mode: ${actionLabels[action]}]`);

    // Get the appropriate agent prompt
    const agentPromptMap: Record<QuickActionType, string> = {
      flows: SYSTEM_PROMPTS.agentFlows,
      validate: SYSTEM_PROMPTS.agentValidate,
    };

    // Build knowledge context for the agent
    const knowledgeContext = buildKnowledgeContext();
    const userPrompt = knowledgeContext
      ? `${knowledgeContext}Analyze the current Figma file based on the knowledge context above. Use the available tools to gather information and provide a comprehensive ${action} analysis.`
      : `Analyze the current Figma file. Use the available tools to gather information and provide a comprehensive ${action} analysis.`;

    // Run the agent with tools
    setIsLoading(true);
    try {
      const response = await runAgent(
        settings.apiKey,
        settings.model,
        agentPromptMap[action],
        userPrompt,
        handleAgentUpdate,
        executeToolsViaPlugin
      );
      addMessage('assistant', response);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setAgentStatus(null);
    }
  }, [settings.apiKey, settings.model, addMessage, showError, handleAgentUpdate, executeToolsViaPlugin, buildKnowledgeContext]);

  // Save API key - sends to plugin for storage
  const handleSaveApiKey = useCallback((key: string) => {
    emit('SAVE_API_KEY', { key });
    setConnectionTestResult(null);
    // Also update local state immediately
    setSettings(prev => ({ ...prev, apiKey: key, hasApiKey: !!key }));
  }, []);

  // Save model - sends to plugin for storage
  const handleSaveModel = useCallback((model: ClaudeModel) => {
    emit('SAVE_MODEL', { model });
    // Also update local state immediately
    setSettings(prev => ({ ...prev, model }));
  }, []);

  // Test connection - API call happens HERE in UI
  const handleTestConnection = useCallback(async () => {
    if (!settings.apiKey) {
      setConnectionTestResult({ success: false, message: 'No API key configured' });
      return;
    }

    setConnectionTestResult(null);
    setIsLoading(true);
    try {
      const result = await testClaudeConnection(settings.apiKey, settings.model);
      setConnectionTestResult({
        success: result.success,
        message: result.success ? 'Connected to Claude API!' : `Connection failed: ${result.error}`,
      });
    } catch (err) {
      setConnectionTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  }, [settings.apiKey, settings.model]);

  // === Knowledge Base handlers ===

  const handleAddKnowledgeEntry = useCallback((entry: { title: string; category: KnowledgeCategory; content: string }) => {
    emit('ADD_KNOWLEDGE_ENTRY', entry);
  }, []);

  const handleUpdateKnowledgeEntry = useCallback((id: string, updates: { title?: string; category?: KnowledgeCategory; content?: string }) => {
    emit('UPDATE_KNOWLEDGE_ENTRY', { id, ...updates });
  }, []);

  const handleDeleteKnowledgeEntry = useCallback((id: string) => {
    emit('DELETE_KNOWLEDGE_ENTRY', { id });
  }, []);

  // === License handlers ===

  const handleDeactivateLicense = useCallback(() => {
    setLicense(null);
    emit('SAVE_LICENSE', null);
  }, []);

  const handleActivateLicense = useCallback((email: string) => {
    const normalizedEmail = email.toLowerCase().trim();
    const newLicense: License = {
      email: normalizedEmail,
      key: generateLicenseKey(normalizedEmail),
      plan: 'pro',
      activatedAt: Date.now(),
    };
    setLicense(newLicense);
    emit('SAVE_LICENSE', newLicense);
  }, []);

  // DEBUG: Mock Pro license for testing (remove before production)
  const handleMockProLicense = useCallback(() => {
    const mockLicense = {
      email: 'test@example.com',
      key: 'mock-key-123',
      plan: 'pro' as const,
      activatedAt: Date.now(),
    };
    setLicense(mockLicense);
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
          onClick={() => setIsCollapsed(false)}
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
                onClick={() => setIsCollapsed(true)}
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
              onClick={() => setView('knowledge')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                backgroundColor: knowledgeBase.entries.length > 0
                  ? 'var(--color-accent-soft)'
                  : 'var(--figma-color-bg-secondary)',
                color: knowledgeBase.entries.length > 0
                  ? 'var(--color-accent)'
                  : 'var(--figma-color-text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title={`Knowledge Base (${knowledgeBase.entries.length} entries)`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
            {/* DEBUG: Mock Pro button - remove before production */}
            {!license && (
              <button
                onClick={handleMockProLicense}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  border: '1px dashed #e86a10',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'transparent',
                  color: '#e86a10',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 700,
                }}
                title="DEBUG: Activate Mock Pro License"
              >
                PRO
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

      {/* License Warning Banner */}
      {licenseWarning && (
        <div
          className="fade-in"
          style={{
            margin: '0 16px 12px',
            padding: '12px 16px',
            fontSize: '12px',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            color: '#b45309',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {licenseWarning}
          </div>
          <button
            onClick={() => setLicenseWarning(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#b45309',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'chat' && (
          <ChatView
            messages={messages}
            isLoading={isLoading}
            hasApiKey={settings.hasApiKey}
            selectionContext={selectionContext}
            agentStatus={agentStatus}
            knowledgeEntryCount={knowledgeBase.entries.length}
            knowledgeTotalChars={knowledgeBase.entries.reduce((sum, e) => sum + e.content.length, 0)}
            onSendMessage={handleSendMessage}
            onQuickAction={handleQuickAction}
            onOpenSettings={() => setView('settings')}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            apiKey={settings.apiKey}
            hasApiKey={settings.hasApiKey}
            model={settings.model}
            license={license}
            analysesUsedThisMonth={analysesUsedThisMonth}
            isLoading={isLoading}
            connectionTestResult={connectionTestResult}
            onSaveApiKey={handleSaveApiKey}
            onSaveModel={handleSaveModel}
            onActivateLicense={handleActivateLicense}
            onDeactivateLicense={handleDeactivateLicense}
            onTestConnection={handleTestConnection}
            onBack={() => setView('chat')}
          />
        )}
        {view === 'knowledge' && (
          <KnowledgeBaseView
            knowledgeBase={knowledgeBase}
            onAddEntry={handleAddKnowledgeEntry}
            onUpdateEntry={handleUpdateKnowledgeEntry}
            onDeleteEntry={handleDeleteKnowledgeEntry}
            onBack={() => setView('chat')}
          />
        )}
      </div>
    </div>
  );
}
