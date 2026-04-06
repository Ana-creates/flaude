import { h, Fragment } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { ChatMessage } from '../common/ChatMessage';
import { ChatInput } from '../common/ChatInput';
import { QuickActionsBar } from '../common/QuickAction';
import { AgentLoadingSteps } from '../common/AgentLoadingSteps';
import { saveUserEmail } from '../../api/supabase';
import mascotUrl from '../../assets/mascot.png';
import type { ChatMessage as ChatMessageType, QuickActionType, SelectionContext } from '../../../shared/types';

interface ChatViewProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  hasApiKey: boolean;
  selectionContext: SelectionContext | null;
  agentStatus: string | null;
  knowledgeEntryCount?: number;
  knowledgeTotalChars?: number;
  userEmail: string | null;
  onSaveEmail: (email: string) => void;
  onSendMessage: (message: string) => void;
  onQuickAction: (action: QuickActionType) => void;
  onOpenSettings: () => void;
}

export function ChatView({
  messages,
  isLoading,
  hasApiKey,
  selectionContext,
  agentStatus,
  knowledgeEntryCount = 0,
  knowledgeTotalChars = 0,
  userEmail,
  onSaveEmail,
  onSendMessage,
  onQuickAction,
  onOpenSettings,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleEmailSubmit = async () => {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError('Please enter a valid email');
      return;
    }
    setEmailError('');
    setEmailSaving(true);
    try {
      await saveUserEmail(trimmed);
      onSaveEmail(trimmed);
      setEmailInput('');
      // Go straight to settings after email is saved
      onOpenSettings();
    } catch {
      // silently fail
    } finally {
      setEmailSaving(false);
    }
  };

  if (!hasApiKey) {
    return (
      <div
        className="slide-up"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        {/* Flaude Mascot */}
        <img
          src={mascotUrl}
          alt="Flaude"
          style={{
            width: '80px',
            height: '80px',
            objectFit: 'contain',
            marginBottom: '24px',
          }}
        />

        <div
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--figma-color-text)',
            marginBottom: '8px',
          }}
        >
          Welcome to Flaude
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--figma-color-text-secondary)',
            marginBottom: '28px',
            lineHeight: '1.6',
            maxWidth: '280px',
          }}
        >
          Connect your Claude API key to start designing with AI directly in Figma.
        </div>

        {/* Email + Get Started pill */}
        {userEmail ? (
          <button
            onClick={onOpenSettings}
            style={{
              padding: '14px 32px',
              fontSize: '14px',
              fontWeight: 600,
              border: 'none',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
              color: 'white',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.2s ease',
            }}
          >
            Get Started
          </button>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              width: '100%',
              maxWidth: '320px',
            }}
          >
            <input
              type="email"
              value={emailInput}
              onInput={(e) => { setEmailInput((e.target as HTMLInputElement).value); setEmailError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEmailSubmit(); }}
              placeholder="your@email.com"
              style={{
                flex: 1,
                padding: '14px 16px',
                fontSize: '13px',
                border: 'none',
                background: 'transparent',
                color: 'white',
                outline: 'none',
                minWidth: 0,
              }}
            />
            <button
              onClick={handleEmailSubmit}
              disabled={emailSaving || !emailInput.trim()}
              style={{
                padding: '14px 20px',
                fontSize: '14px',
                fontWeight: 600,
                border: 'none',
                borderLeft: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: emailSaving || !emailInput.trim() ? 'rgba(255,255,255,0.3)' : 'white',
                cursor: emailSaving || !emailInput.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
              }}
            >
              {emailSaving ? '...' : 'Get Started'}
            </button>
          </div>
        )}
        {emailError && (
          <div style={{
            marginTop: '8px',
            fontSize: '12px',
            color: '#ef4444',
          }}>
            {emailError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Quick Actions */}
      <QuickActionsBar onAction={onQuickAction} disabled={isLoading} />

      {/* Selection Context Banner */}
      {selectionContext && selectionContext.count > 0 && (
        <div
          style={{
            margin: '0 16px',
            padding: '10px 14px',
            fontSize: '12px',
            backgroundColor: 'var(--figma-color-bg-secondary)',
            color: 'var(--figma-color-text-secondary)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
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
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>
            {selectionContext.count} element{selectionContext.count !== 1 ? 's' : ''} selected
          </span>
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
        }}
      >
        {messages.length === 0 ? (
          <div
            className="fade-in"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
              padding: '20px',
            }}
          >
            {/* Mascot */}
            <img
              src={mascotUrl}
              alt="Flaude"
              style={{
                width: '72px',
                height: '72px',
                objectFit: 'contain',
                marginBottom: '20px',
              }}
            />

            <div
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--figma-color-text)',
                marginBottom: '8px',
              }}
            >
              What would you like to create?
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--figma-color-text-tertiary)',
                lineHeight: '1.6',
                maxWidth: '260px',
              }}
            >
              Describe your design, use the quick actions, or upload your brand docs for context.
            </div>

            {/* Knowledge Base indicator */}
            {knowledgeEntryCount > 0 && (() => {
              const tokens = Math.ceil(knowledgeTotalChars / 4);
              const isLarge = knowledgeTotalChars > 20000;
              return (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '10px 16px',
                    fontSize: '11px',
                    backgroundColor: isLarge
                      ? 'var(--color-warning-soft)'
                      : 'var(--figma-color-bg-secondary)',
                    color: isLarge
                      ? 'var(--color-warning)'
                      : 'var(--figma-color-text-secondary)',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
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
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  <span>
                    {knowledgeEntryCount} {knowledgeEntryCount === 1 ? 'entry' : 'entries'} • ~{tokens.toLocaleString()} tokens
                  </span>
                </div>
              );
            })()}
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && <AgentLoadingSteps agentStatus={agentStatus} />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={onSendMessage} disabled={isLoading} />
    </div>
  );
}
