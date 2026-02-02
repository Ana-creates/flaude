import { h } from 'preact';
import { useState, useCallback } from 'preact/hooks';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled = false, placeholder = 'Describe what you want to design...' }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue('');
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const hasValue = value.trim().length > 0;

  return (
    <div
      style={{
        padding: '12px 16px 16px',
        backgroundColor: 'var(--figma-color-bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '10px',
          padding: '8px 8px 8px 16px',
          backgroundColor: 'var(--figma-color-bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: isFocused ? 'var(--shadow-md)' : 'var(--shadow-sm)',
          transition: 'all 0.2s ease',
        }}
      >
        <textarea
          value={value}
          onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            padding: '6px 0',
            fontSize: '13px',
            lineHeight: '1.5',
            border: 'none',
            backgroundColor: 'transparent',
            color: 'var(--figma-color-text)',
            resize: 'none',
            fontFamily: 'inherit',
            outline: 'none',
            minHeight: '24px',
            maxHeight: '80px',
            overflow: 'hidden',
          }}
        />
        {hasValue && !disabled && (
          <button
            onClick={handleSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>

      {/* Hint text */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: '8px',
          fontSize: '10px',
          color: 'var(--figma-color-text-tertiary)',
        }}
      >
        Press Enter to send
      </div>
    </div>
  );
}
