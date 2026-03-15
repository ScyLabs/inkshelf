'use client';

import { useState, useCallback } from 'react';
import { useUserStore } from '@/stores/userStore';
import { fetchVapidKey, subscribePush, unsubscribePush } from '@/services/api';

type NotifState = 'loading' | 'unsupported' | 'denied' | 'enabled' | 'disabled';

const NOTIF_KEY = 'push-notifications-enabled';

function getInitialNotifState(): NotifState {
  if (typeof window === 'undefined' || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const stored = localStorage.getItem(NOTIF_KEY);
  return stored === 'true' ? 'enabled' : 'disabled';
}

export default function NotificationsPanel() {
  const userId = useUserStore((s) => s.userId);
  const [state, setState] = useState<NotifState>(getInitialNotifState);

  const handleToggle = useCallback(async () => {
    if (state === 'enabled') {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribePush(userId, sub.endpoint);
          await sub.unsubscribe();
        }
      } catch {
        /* ignore */
      }
      localStorage.setItem(NOTIF_KEY, 'false');
      setState('disabled');
      return;
    }

    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const vapidKey = await fetchVapidKey();
      if (!vapidKey) {
        setState('disabled');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await subscribePush(userId, sub.toJSON());
      localStorage.setItem(NOTIF_KEY, 'true');
      setState('enabled');
    } catch {
      setState('disabled');
    }
  }, [state, userId]);

  if (state === 'unsupported') return null;

  const isEnabled = state === 'enabled';
  const isLoading = state === 'loading';

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isLoading || state === 'denied'}
      className="flex w-full items-center justify-between rounded-xl bg-ink-card border border-ink-border p-4"
    >
      <div className="flex flex-col items-start">
        <span className="text-sm text-white">Push Notifications</span>
        {state === 'denied' && (
          <span className="text-xs text-red-400">Blocked by browser</span>
        )}
      </div>
      <div
        className={`relative h-6 w-11 rounded-full transition-colors ${
          isEnabled ? 'bg-ink-cyan' : 'bg-zinc-700'
        } ${isLoading ? 'opacity-50' : ''}`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            isEnabled ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
