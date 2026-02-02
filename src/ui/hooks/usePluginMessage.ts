import { useEffect, useState, useCallback } from 'preact/hooks';
import { on, emit } from '@create-figma-plugin/utilities';
import type { PluginToUIMessage } from '../../shared/types';

/**
 * Hook for handling plugin-to-UI message communication
 */
export function usePluginMessage<T extends PluginToUIMessage['type']>(
  messageType: T,
  handler: (payload: Extract<PluginToUIMessage, { type: T }>['payload']) => void
) {
  useEffect(() => {
    return on(messageType, handler as (payload: unknown) => void);
  }, [messageType, handler]);
}

/**
 * Hook for sending messages from UI to plugin
 */
export function useEmit() {
  return useCallback(<T extends string>(type: T, payload?: unknown) => {
    emit(type, payload);
  }, []);
}

/**
 * Hook for managing async operation state
 */
export function useAsyncOperation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  useEffect(() => {
    on('OPERATION_SUCCESS', ({ message }: { message: string }) => {
      setLoading(false);
      setSuccess(message);
      setError(null);
    });

    on('OPERATION_ERROR', ({ error }: { error: string }) => {
      setLoading(false);
      setError(error);
      setSuccess(null);
    });
  }, []);

  return { loading, error, success, setLoading, reset };
}
