import { h } from 'preact';
import type { ChatMessage as ChatMessageType } from '../../../shared/types';
import mascotUrl from '../../assets/mascot.png';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className="fade-in"
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: '10px',
        marginBottom: '16px',
      }}
    >
      {/* Avatar */}
      {!isUser && (
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--figma-color-bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <img
            src={mascotUrl}
            alt="Assistant"
            style={{
              width: '24px',
              height: '24px',
              objectFit: 'contain',
            }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '85%',
        }}
      >
        {/* Message bubble */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: isUser
              ? 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)'
              : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)',
            background: isUser
              ? 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)'
              : 'var(--figma-color-bg-secondary)',
            color: isUser
              ? 'white'
              : 'var(--figma-color-text)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              userSelect: 'text',
              cursor: 'text',
            }}
            dangerouslySetInnerHTML={{
              __html: formatMessage(message.content, isUser),
            }}
          />
        </div>

        {/* Timestamp */}
        <div
          style={{
            fontSize: '10px',
            color: 'var(--figma-color-text-tertiary)',
            marginTop: '6px',
            paddingLeft: isUser ? '0' : '4px',
            paddingRight: isUser ? '4px' : '0',
          }}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMessage(content: string, isUser: boolean): string {
  // Basic markdown-like formatting
  const formatted = content
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(
      /```([\s\S]*?)```/g,
      `<pre style="background: ${isUser ? 'rgba(255,255,255,0.15)' : 'var(--figma-color-bg-tertiary)'}; padding: 10px 12px; border-radius: var(--radius-md); overflow-x: auto; margin: 10px 0; font-size: 11px;">$1</pre>`
    )
    // Inline code
    .replace(
      /`([^`]+)`/g,
      `<code style="background: ${isUser ? 'rgba(255,255,255,0.15)' : 'var(--figma-color-bg-tertiary)'}; padding: 2px 6px; border-radius: var(--radius-sm); font-size: 11px;">$1</code>`
    )
    // Headers (###)
    .replace(/^### (.*$)/gm, '<div style="font-weight: 600; margin-top: 12px; margin-bottom: 6px;">$1</div>')
    // Line breaks
    .replace(/\n/g, '<br />');

  return formatted;
}
