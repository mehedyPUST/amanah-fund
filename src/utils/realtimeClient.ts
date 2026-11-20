'use client';

import { api } from './api.ts';

export type RealtimeStreamStatus = 'connecting' | 'live' | 'reconnecting' | 'disabled';

type EventHandler = (evt: MessageEvent) => void;
type StatusHandler = (status: RealtimeStreamStatus) => void;

/**
 * Shared multiplexed EventSource singleton.
 * - Ensures at most ONE SSE connection is opened per browser tab (instead of 5-8 duplicates).
 * - Permanently stops if the server replies with `event: disabled` (Vercel serverless mode),
 *   eliminating endless 20-second reconnect loops that burn Fluid Compute CPU & memory.
 * - Automatically disconnects while the browser tab is hidden and reconnects when visible.
 */
class SharedRealtimeClient {
  private es: EventSource | null = null;
  private status: RealtimeStreamStatus = 'connecting';
  private permanentlyDisabled = false;
  private listeners = new Map<string, Set<EventHandler>>();
  private boundEventTypes = new Map<string, EventListener>();
  private statusListeners = new Set<StatusHandler>();
  private subscriberCount = 0;
  private visibilityAttached = false;

  private setStatus(next: RealtimeStreamStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const cb of this.statusListeners) {
      try {
        cb(next);
      } catch {
        // ignore listener errors
      }
    }
  }

  private handleVisibilityChange = (): void => {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      this.teardownConnection();
    } else if (this.subscriberCount > 0 && !this.permanentlyDisabled) {
      this.ensureConnection();
    }
  };

  private attachVisibility(): void {
    if (this.visibilityAttached || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.visibilityAttached = true;
  }

  private detachVisibility(): void {
    if (!this.visibilityAttached || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.visibilityAttached = false;
  }

  private bindEventTypeToSource(es: EventSource, eventName: string): void {
    if (this.boundEventTypes.has(eventName)) return;
    const dispatcher: EventListener = (rawEvent) => {
      const msgEvt = rawEvent as MessageEvent;
      const set = this.listeners.get(eventName);
      if (!set) return;
      for (const handler of set) {
        try {
          handler(msgEvt);
        } catch {
          // isolate individual subscriber errors
        }
      }
    };
    this.boundEventTypes.set(eventName, dispatcher);
    es.addEventListener(eventName, dispatcher);
  }

  private ensureConnection(): void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    if (this.permanentlyDisabled) {
      this.setStatus('disabled');
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.es) return;

    this.setStatus('connecting');
    const es = new EventSource(api.getEventsStreamUrl(), { withCredentials: true });
    this.es = es;

    es.addEventListener('disabled', () => {
      this.permanentlyDisabled = true;
      this.teardownConnection();
      this.setStatus('disabled');
    });

    es.addEventListener('connected', () => {
      this.setStatus('live');
    });

    es.onopen = () => {
      if (!this.permanentlyDisabled) {
        this.setStatus('live');
      }
    };

    es.onerror = () => {
      if (this.permanentlyDisabled) {
        this.teardownConnection();
        this.setStatus('disabled');
        return;
      }
      // If the browser permanently closed the EventSource (e.g. HTTP 204 / 401), do not spin
      if (es.readyState === EventSource.CLOSED) {
        this.teardownConnection();
        this.setStatus('disabled');
        return;
      }
      this.setStatus('reconnecting');
    };

    for (const eventName of this.listeners.keys()) {
      this.bindEventTypeToSource(es, eventName);
    }
  }

  private teardownConnection(): void {
    if (!this.es) return;
    for (const [eventName, dispatcher] of this.boundEventTypes.entries()) {
      this.es.removeEventListener(eventName, dispatcher);
    }
    this.boundEventTypes.clear();
    this.es.close();
    this.es = null;
  }

  subscribe(
    eventHandlers: Record<string, EventHandler>,
    onStatus?: StatusHandler
  ): () => void {
    this.subscriberCount += 1;
    this.attachVisibility();

    const entries = Object.entries(eventHandlers);
    for (const [eventName, handler] of entries) {
      let set = this.listeners.get(eventName);
      if (!set) {
        set = new Set();
        this.listeners.set(eventName, set);
      }
      set.add(handler);
      if (this.es) {
        this.bindEventTypeToSource(this.es, eventName);
      }
    }

    if (onStatus) {
      this.statusListeners.add(onStatus);
      onStatus(this.permanentlyDisabled ? 'disabled' : this.status);
    }

    this.ensureConnection();

    return () => {
      for (const [eventName, handler] of entries) {
        const set = this.listeners.get(eventName);
        if (set) {
          set.delete(handler);
          if (set.size === 0) {
            this.listeners.delete(eventName);
            const dispatcher = this.boundEventTypes.get(eventName);
            if (dispatcher && this.es) {
              this.es.removeEventListener(eventName, dispatcher);
            }
            this.boundEventTypes.delete(eventName);
          }
        }
      }

      if (onStatus) {
        this.statusListeners.delete(onStatus);
      }

      this.subscriberCount = Math.max(0, this.subscriberCount - 1);
      if (this.subscriberCount === 0) {
        this.teardownConnection();
        this.detachVisibility();
      }
    };
  }

  /** Immediately close any open EventSource connection and clear session-bound stream state. */
  resetForSessionChange(): void {
    this.teardownConnection();
    this.permanentlyDisabled = false;
    this.setStatus('disabled');
  }
}

const sharedRealtimeClient = new SharedRealtimeClient();

export function subscribeRealtimeEvents(
  eventHandlers: Record<string, EventHandler>,
  onStatus?: StatusHandler
): () => void {
  return sharedRealtimeClient.subscribe(eventHandlers, onStatus);
}

export function resetRealtimeClient(): void {
  sharedRealtimeClient.resetForSessionChange();
}
