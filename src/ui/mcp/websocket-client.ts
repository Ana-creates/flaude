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

const LOCAL_WS_URL = 'ws://localhost:9876';
const HOSTED_WS_URL = 'wss://flaude-pro-mcp.fly.dev/plugin';
const RECONNECT_INTERVAL = 3000;
/**
 * Retry ceiling, in milliseconds between attempts.
 *
 * There used to be MAX_RECONNECT_ATTEMPTS = 10 at a flat 3s, so the client gave
 * up 30 SECONDS after a drop and then sat on "Not connected yet" forever, with
 * no way back except closing and reopening the plugin. Thirty seconds is
 * shorter than a lunch break, a laptop sleeping, a wifi handover, or a relay
 * redeploy - so the normal state of a plugin left open all day was
 * disconnected, which is exactly what it looked like.
 *
 * Now it never stops trying; it just backs off, so an unreachable relay costs a
 * request every 30s instead of one every 3s.
 */
const MAX_RECONNECT_INTERVAL = 30000;

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
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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

    /**
     * Reconnect the moment the user comes back, instead of waiting out the
     * backoff.
     *
     * The common way this connection dies is not a server fault: the laptop
     * sleeps, or Figma sits in a background tab where browsers throttle timers
     * heavily, so the retry that should have fired never did. The user then
     * returns to a panel that says "Not connected yet" and has no reason to
     * believe it will fix itself.
     *
     * Focus and `online` are the two moments we know a human is back and the
     * network is up, so both retry immediately. Guarded on isManuallyDisconnected
     * so this never fights a user who deliberately disconnected, and on
     * readyState so an already-healthy socket is left alone.
     */
    if (typeof window !== 'undefined') {
      const wake = () => {
        if (this.isManuallyDisconnected) return;
        if (this.ws?.readyState === WebSocket.OPEN) return;
        if (!this.license?.email) return;
        // Reset so the retry starts at 3s rather than resuming a long backoff.
        this.reconnectAttempts = 0;
        this.connect();
      };
      window.addEventListener('focus', wake);
      window.addEventListener('online', wake);
    }
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

  /**
   * Resolve which MCP server URL to use based on license:
   *  - Pro user → hosted MCP at wss://flaude-pro-mcp.fly.dev/plugin?email=X
   *  - Otherwise → local MCP at ws://localhost:9876 (requires `npx flaude-mcp` running)
   */
  private getWebSocketUrl(): string {
    if (this.license?.plan === 'pro' && this.license.email) {
      // Prefer the Bearer token (a real secret) over the email (public and
      // guessable). Browsers can't set headers on a WebSocket, so it rides as
      // ?token=. Email remains the fallback for licenses activated before
      // token auth existed — valid until the server's migration window closes.
      if (this.license.mcpToken) {
        return `${HOSTED_WS_URL}?token=${encodeURIComponent(this.license.mcpToken)}`;
      }
      return `${HOSTED_WS_URL}?email=${encodeURIComponent(this.license.email)}`;
    }
    return LOCAL_WS_URL;
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

    const wsUrl = this.getWebSocketUrl();
    try {
      console.log('[MCP Client] Creating WebSocket to', wsUrl);
      this.ws = new WebSocket(wsUrl);

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

        if (!this.isManuallyDisconnected) {
          this.reconnectAttempts++;
          // Exponential backoff, capped. No attempt limit: the only reason to
          // stop retrying is the user disconnecting, and that sets the flag
          // above. reconnectAttempts is reset on successful auth, so a healthy
          // session always starts its next outage at 3s.
          const delay = Math.min(
            RECONNECT_INTERVAL * 2 ** (this.reconnectAttempts - 1),
            MAX_RECONNECT_INTERVAL
          );
          console.log(`[MCP Client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          this.reconnectTimer = setTimeout(() => this.connect(), delay);
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
    // A pending retry would otherwise reconnect seconds after a deliberate
    // disconnect, which reads as the toggle not working.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
