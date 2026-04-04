import { useEffect, useRef } from 'react';
import { notificationService, UserType } from '@/lib/notifications';
import * as Notifications from 'expo-notifications';

/**
 * Hook to register push notifications and set up listeners.
 * Call this in each user type's home screen once the userId is known.
 */
export function useNotifications(
  userId: string | null | undefined,
  userType: UserType,
  onNotificationTap?: (data: Record<string, any>) => void
) {
  const registered = useRef(false);

  useEffect(() => {
    if (!userId || registered.current) return;
    registered.current = true;

    notificationService.registerForPushNotifications(userId, userType).then(token => {
      if (token) {
        console.log(`[Notifications] Registered ${userType} ${userId} with token`);
      }
    });
  }, [userId, userType]);

  // Listen for notification taps
  useEffect(() => {
    const sub = notificationService.addNotificationResponseListener(response => {
      const data = response.notification.request.content.data;
      console.log('[Notifications] Tapped:', data);
      onNotificationTap?.(data as Record<string, any>);
    });

    return () => sub.remove();
  }, [onNotificationTap]);

  // Listen for foreground notifications
  useEffect(() => {
    const sub = notificationService.addNotificationReceivedListener(notification => {
      console.log('[Notifications] Received in foreground:', notification.request.content);
    });

    return () => sub.remove();
  }, []);
}
