import { useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { getToken } from './api';

export interface NewPurchaseRequestNotification {
  id: string;
  prNumber: string;
  clientName: string;
  itemCount: number;
  source: string;
  quotationNumber?: string;
}

// Connects to the backend NotificationHub (only while `enabled`, e.g. once logged
// in as purchasing) and surfaces the most recent "NewPurchaseRequest" broadcast.
export function useNotificationHub(enabled: boolean) {
  const [notification, setNotification] = useState<NewPurchaseRequestNotification | null>(null);
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/notifications', {
        accessTokenFactory: () => getToken() || ''
      })
      .withAutomaticReconnect()
      .build();

    connection.on('NewPurchaseRequest', (payload: NewPurchaseRequestNotification) => {
      setNotification(payload);
    });

    connection.start().catch((err) => {
      console.error('SignalR connection failed:', err);
    });

    connectionRef.current = connection;

    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, [enabled]);

  const clearNotification = () => setNotification(null);

  return { notification, clearNotification };
}
