/**
 * WebSocket client for MCP server connection
 *
 * Runs in the UI iframe and bridges MCP commands to the Figma plugin.
 *
 * Flow:
 * MCP Server -> WebSocket -> UI -> Plugin -> Figma
 * Figma -> Plugin -> UI -> WebSocket -> MCP Server
 *
 * Sends user email for identification (no license required)
 */

import { emit, on } from '@create-figma-plugin/utilities';
import type { License } from '../../shared/types';

const WS_URL = 'ws://localhost:9876';
const RECONNECT_INTERVAL = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

interface MCPCommand {
  requestId: string;
  command: string;
  params: Record<string, unknown>;
}

interface MCPResponse {
  requestId: string;
  type: 'response' | 'error';
  data?: unknown;
  error?: string;
}

interface AuthResult {
  type: 'auth_result';
  success: boolean;
  email?: string;
  error?: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_failed';
type StatusChangeCallback = (status: ConnectionStatus, message?: string) => void;

class MCPWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private statusCallbacks: StatusChangeCallback[] = [];
  private isManuallyDisconnected = false;
  private license: License | null = null;
  private isAuthenticated = false;

  constructor() {
    // Listen for results from plugin
    on('MCP_TOOL_RESULT', this.handlePluginResult.bind(this));
  }

  /**
   * Set the license for identification
   */
  setLicense(license: License | null) {
    this.license = license;
  }

  onStatusChange(callback: StatusChangeCallback): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyStatus(status: ConnectionStatus, message?: string) {
    this.statusCallbacks.forEach(cb => cb(status, message));
  }

  connect() {
    console.log('[MCP Client] connect() called');

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[MCP Client] Already connected');
      return;
    }

    // Close any existing connection first
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        console.log('[MCP Client] Error closing existing connection:', e);
      }
      this.ws = null;
    }

    this.isManuallyDisconnected = false;
    this.isAuthenticated = false;
    this.notifyStatus('connecting');

    try {
      console.log('[MCP Client] Creating WebSocket to', WS_URL);
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[MCP Client] WebSocket connected, sending authentication...');
        // Send authentication immediately on connect
        this.sendAuth();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle authentication result
          if (message.type === 'auth_result') {
            this.handleAuthResult(message as AuthResult);
            return;
          }

          // Handle commands from MCP server
          if (message.requestId && message.command) {
            this.handleCommand(message as MCPCommand);
            return;
          }

          // Handle errors
          if (message.type === 'error') {
            console.error('[MCP Client] Server error:', message.error);
            this.notifyStatus('error', message.error);
            return;
          }
        } catch (e) {
          console.error('[MCP Client] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[MCP Client] Disconnected from MCP server');
        this.isAuthenticated = false;
        this.rejectPendingRequests('Connection lost');
        this.notifyStatus('disconnected');

        if (!this.isManuallyDisconnected && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.reconnectAttempts++;
          console.log(`[MCP Client] Reconnecting in ${RECONNECT_INTERVAL}ms (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connect(), RECONNECT_INTERVAL);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[MCP Client] WebSocket error:', error);
        this.notifyStatus('error', 'Connection failed. Is the MCP server running?');
      };

    } catch (error) {
      console.error('[MCP Client] Failed to create WebSocket:', error);
      this.notifyStatus('error', 'Failed to connect');
    }
  }

  /**
   * Send authentication to MCP server
   */
  private sendAuth() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'auth',
      email: this.license?.email || 'anonymous',
      key: this.license?.key || 'community',
    }));
  }

  /**
   * Handle authentication result from server
   */
  private handleAuthResult(result: AuthResult) {
    if (result.success) {
      console.log('[MCP Client] Authentication successful');
      this.isAuthenticated = true;
      this.reconnectAttempts = 0;
      this.notifyStatus('connected', `Authenticated as ${result.email}`);
    } else {
      console.error('[MCP Client] Authentication failed:', result.error);
      this.isAuthenticated = false;
      this.notifyStatus('auth_failed', result.error || 'Authentication failed');
      this.disconnect();
    }
  }

  disconnect() {
    this.isManuallyDisconnected = true;
    this.ws?.close();
    this.ws = null;
    this.rejectPendingRequests('Disconnected');
    this.notifyStatus('disconnected');
  }

  private rejectPendingRequests(reason: string) {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  private handleCommand(command: MCPCommand) {
    console.log('[MCP Client] Received command:', command.command);

    // Send command to plugin for execution
    emit('MCP_EXECUTE_COMMAND', {
      requestId: command.requestId,
      command: command.command,
      params: command.params,
    });
  }

  private handlePluginResult(result: { requestId: string; data?: unknown; error?: string }) {
    console.log('[MCP Client] Received plugin result for:', result.requestId);

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[MCP Client] Cannot send result - WebSocket not connected');
      return;
    }

    const response: MCPResponse = {
      requestId: result.requestId,
      type: result.error ? 'error' : 'response',
      data: result.data,
      error: result.error,
    };

    this.ws.send(JSON.stringify(response));
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const mcpClient = new MCPWebSocketClient();
