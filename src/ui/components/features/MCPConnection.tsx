/**
 * MCP Connection Component
 *
 * Shows connection status to the MCP server and allows
 * toggling the connection.
 *
 * MCP integration is available to all users.
 */

import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { mcpClient } from '../../mcp/websocket-client';
import type { License } from '../../../shared/types';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed';

interface MCPConnectionProps {
  license: License | null;
  variant?: 'light' | 'dark';
  onDeactivate?: () => void;
}

const MCP_COMMAND = 'npx flaude-mcp';

export function MCPConnection({ license, variant = 'light', onDeactivate }: MCPConnectionProps) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const isDark = variant === 'dark';

  useEffect(() => {
    // Update the MCP client with current license
    mcpClient.setLicense(license);
  }, [license]);

  useEffect(() => {
    const unsubscribe = mcpClient.onStatusChange((newStatus, message) => {
      setStatus(newStatus);
      setStatusMessage(message || '');
    });
    return unsubscribe;
  }, []);

  const handleToggle = () => {
    console.log('[MCPConnection] Toggle clicked, status:', status, 'license:', license);
    try {
      if (status === 'connected' || status === 'connecting') {
        mcpClient.disconnect();
      } else {
        // Ensure license is set before connecting
        mcpClient.setLicense(license);
        mcpClient.connect();
      }
    } catch (err) {
      console.error('[MCPConnection] Error:', err);
      setStatus('error');
      setStatusMessage('Failed to connect');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = MCP_COMMAND;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const statusColors: Record<ConnectionStatus, string> = {
    disconnected: isDark ? 'rgba(255,255,255,0.7)' : '#666',
    connecting: '#f59e0b',
    connected: '#22c55e',
    error: '#ef4444',
    auth_failed: '#ef4444',
  };

  const statusLabels: Record<ConnectionStatus, string> = {
    disconnected: 'Disconnected',
    connecting: 'Authenticating...',
    connected: 'Connected',
    error: 'Error',
    auth_failed: 'Auth Failed',
  };
  return (
    <div style={{
      padding: isDark ? '12px 14px' : '12px 16px',
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'var(--figma-color-bg-secondary)',
      borderRadius: '10px',
      marginTop: isDark ? '0' : '0',
      marginBottom: isDark ? '0' : '16px',
      border: '1px solid rgba(128,128,128,0.3)',
      backdropFilter: isDark ? 'blur(12px)' : 'none',
      WebkitBackdropFilter: isDark ? 'blur(12px)' : 'none',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: statusColors[status],
            flexShrink: 0,
          }} />
          <span style={{ fontSize: '12px', fontWeight: 500, color: isDark ? '#ffffff' : 'var(--figma-color-text)' }}>
            Claude Code
          </span>
          <span style={{ fontSize: '10px', color: isDark ? 'rgba(255,255,255,0.7)' : 'var(--figma-color-text-secondary)' }}>
            ({statusLabels[status]})
          </span>
        </div>

        <button
          onClick={handleToggle}
          style={{
            padding: '4px 12px',
            fontSize: '12px',
            backgroundColor: status === 'connected'
              ? 'rgba(239, 68, 68, 0.2)'
              : isDark ? 'rgba(255,255,255,0.15)' : 'var(--color-accent-soft)',
            color: status === 'connected'
              ? '#dc2626'
              : isDark ? '#ffffff' : 'var(--color-accent)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          {status === 'connected' || status === 'connecting' ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {status === 'connected' && (
        <p style={{ fontSize: '11px', color: 'var(--color-success)', marginTop: '8px', marginBottom: 0 }}>
          {statusMessage || 'Claude Code can now read and edit this Figma file.'}
        </p>
      )}

      {status === 'disconnected' && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ fontSize: '11px', color: isDark ? 'rgba(255,255,255,0.7)' : 'var(--figma-color-text-tertiary)', marginBottom: '8px' }}>
            Paste in your terminal or Claude Desktop:
          </p>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'var(--figma-color-bg)',
            borderRadius: '6px',
            border: isDark ? '1px solid rgba(255,255,255,0.2)' : 'none',
          }}>
            <code style={{
              flex: 1,
              fontSize: '13px',
              fontFamily: 'monospace',
              color: isDark ? '#ffffff' : 'var(--figma-color-text)',
              background: 'none',
              fontWeight: 500,
            }}>
              {MCP_COMMAND}
            </code>
            <button
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                border: 'none',
                background: 'none',
                color: copied ? 'var(--color-success)' : isDark ? 'rgba(255,255,255,0.7)' : 'var(--figma-color-text-tertiary)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              title={copied ? 'Copied!' : 'Copy command'}
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
          <a
            href="https://flaude.app/#get-started"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              marginTop: '8px',
              fontSize: '11px',
              color: isDark ? 'rgba(255,255,255,0.7)' : 'var(--figma-color-text-tertiary)',
              textDecoration: 'underline',
            }}
          >
            View setup guide →
          </a>
        </div>
      )}

      {status === 'error' && (
        <p style={{ fontSize: '11px', color: '#dc2626', marginTop: '8px', marginBottom: 0 }}>
          {statusMessage || 'Connection failed. Is the MCP server running?'}
        </p>
      )}

      {status === 'auth_failed' && (
        <p style={{ fontSize: '11px', color: '#dc2626', marginTop: '8px', marginBottom: 0 }}>
          {statusMessage || 'Authentication failed. Please check your license.'}
        </p>
      )}

      {/* License info - only show in light mode */}
      {!isDark && license && onDeactivate && (
        <div style={{
          marginTop: '12px',
          paddingTop: '10px',
          borderTop: '1px solid rgba(128,128,128,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '11px', color: 'var(--figma-color-text-tertiary)' }}>
            Licensed to: {license.email}
          </span>
          <button
            onClick={onDeactivate}
            style={{
              padding: '4px 8px',
              fontSize: '10px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: 'transparent',
              color: 'var(--figma-color-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            Deactivate
          </button>
        </div>
      )}
    </div>
  );
}
