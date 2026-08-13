import { useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { apiFetch, getToken } from './api';

export interface NewPurchaseRequestNotification {
  id: string;
  prNumber: string;
  clientName: string;
  itemCount: number;
  source: string;
  quotationNumber?: string;
}

// Database-backed notification (see backend UserNotification entity).
export interface UserNotificationItem {
  id: number;
  type: string;
  title: string;
  details?: string | null;
  // Optional in-app destination (relative SPA route). When present the header
  // dropdown renders the entry as a link that navigates there on click.
  linkUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

// Connects to the backend NotificationHub (only while `enabled`) and surfaces:
// - the most recent "NewPurchaseRequest" broadcast (purchasing side popup)
// - persisted role notifications: fetched from the DB on load so they survive
//   refreshes/offline periods, with live "UserNotification" pushes merged in.
export function useNotificationHub(enabled: boolean) {
  const [notification, setNotification] = useState<NewPurchaseRequestNotification | null>(null);
  const [userNotifications, setUserNotifications] = useState<UserNotificationItem[]>([]);
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Load what's already stored (missed-while-offline notifications included).
    (async () => {
      try {
        const res = await apiFetch('/api/notifications');
        if (res.ok) {
          const data = await res.json();
          setUserNotifications(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
      }
    })();

    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/notifications', {
        accessTokenFactory: () => getToken() || ''
      })
      .withAutomaticReconnect()
      .build();

    connection.on('NewPurchaseRequest', (payload: NewPurchaseRequestNotification) => {
      setNotification(payload);
    });

    connection.on('UserNotification', (payload: UserNotificationItem) => {
      setUserNotifications((prev) =>
        prev.some((n) => n.id === payload.id) ? prev : [payload, ...prev]
      );
    });

    connection.start().catch((err) => {
      // In dev, React StrictMode mounts this effect twice; the cleanup aborts
      // the first negotiation and the retry connects fine — that transient
      // abort isn't a real failure, so don't shout about it.
      const aborted =
        err?.name === 'AbortError' || /stopped during negotiation|abort/i.test(err?.message ?? '');
      if (!aborted) {
        console.error('SignalR connection failed:', err);
      }
    });

    connectionRef.current = connection;

    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, [enabled]);

  const clearNotification = () => setNotification(null);

  const unreadCount = userNotifications.filter((n) => !n.isRead).length;

  // Optimistically flips everything to read, then persists.
  const markAllRead = async () => {
    setUserNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await apiFetch('/api/notifications/mark-read', { method: 'PUT' });
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
    }
  };

  return { notification, clearNotification, userNotifications, unreadCount, markAllRead };
}
