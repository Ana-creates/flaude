import { h } from 'preact';
import type { QuickActionType } from '../../../shared/types';

interface QuickActionProps {
  action: QuickActionType;
  onClick: (action: QuickActionType) => void;
  disabled?: boolean;
}

const ACTION_CONFIG = {
  flows: {
    label: 'Map Flows',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="6" r="3" />
        <circle cx="19" cy="6" r="3" />
        <circle cx="12" cy="18" r="3" />
        <path d="M5 9v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9" />
        <path d="M12 15v-3" />
      </svg>
    ),
    description: 'Analyze user flows',
    color: '#8b5cf6',
  },
  validate: {
    label: 'Validate',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" />
        <path d="M12 3a9 9 0 1 0 9 9" />
      </svg>
    ),
    description: 'Check against docs',
    color: '#10b981',
  },
};

export function QuickAction({ action, onClick, disabled = false }: QuickActionProps) {
  const config = ACTION_CONFIG[action];
  const actionColor = config.color || '#f97316';

  return (
    <button
      onClick={() => onClick(action)}
      disabled={disabled}
      title={config.description}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: disabled
          ? 'var(--figma-color-bg-disabled)'
          : 'var(--figma-color-bg)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: disabled
            ? 'var(--figma-color-bg-secondary)'
            : `${actionColor}15`,
          color: disabled
            ? 'var(--figma-color-text-disabled)'
            : actionColor,
          transition: 'all 0.2s ease',
          flexShrink: 0,
        }}
      >
        {config.icon}
      </div>
      <div style={{ textAlign: 'left' }}>
        <div style={{
          fontSize: '13px',
          fontWeight: 600,
          color: disabled ? 'var(--figma-color-text-disabled)' : 'var(--figma-color-text)',
          marginBottom: '2px',
        }}>
          {config.label}
        </div>
        <div style={{
          fontSize: '11px',
          color: 'var(--figma-color-text-tertiary)',
        }}>
          {config.description}
        </div>
      </div>
    </button>
  );
}

interface QuickActionsBarProps {
  onAction: (action: QuickActionType) => void;
  disabled?: boolean;
}

export function QuickActionsBar({ onAction, disabled = false }: QuickActionsBarProps) {
  return (
    <div
      style={{
        padding: '12px 16px',
        display: 'flex',
        gap: '12px',
      }}
    >
      <QuickAction action="flows" onClick={onAction} disabled={disabled} />
      <QuickAction action="validate" onClick={onAction} disabled={disabled} />
    </div>
  );
}
