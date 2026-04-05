import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type UserType = 'parent' | 'school' | 'provider' | 'admin';

export interface NotificationData {
  type: string;
  [key: string]: any;
}

export const notificationService = {
  /**
   * Request permission and register push token for a user.
   * Call this after the user logs in.
   */
  async registerForPushNotifications(
    userId: string,
    userType: UserType
  ): Promise<string | null> {
    try {
      // Must be a physical device
      if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request if not already granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return null;
      }

      // Get Expo push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      const pushToken = tokenData.data;

      console.log('Expo Push Token:', pushToken);

      // Save to Supabase
      await this.saveToken(userId, userType, pushToken);

      // Configure Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: "Child's Kitchen",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4F46E5',
        });
      }

      return pushToken;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  },

  /**
   * Save or update push token in the database
   */
  async saveToken(
    userId: string,
    userType: UserType,
    pushToken: string
  ): Promise<void> {
    try {
      const deviceType = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

      // Upsert: update if token exists, insert if not
      const { error } = await supabase
        .from('user_push_tokens')
        .upsert(
          {
            user_id: userId,
            user_type: userType,
            push_token: pushToken,
            provider: 'expo',
            device_type: deviceType,
            is_active: true,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: 'push_token' }
        );

      if (error) {
        console.error('Error saving push token:', error);
      }
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  },

  /**
   * Remove push token (on logout)
   */
  async unregisterToken(userId: string): Promise<void> {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const pushToken = tokenData.data;

      await supabase
        .from('user_push_tokens')
        .update({ is_active: false })
        .eq('push_token', pushToken);
    } catch (error) {
      console.error('Error unregistering token:', error);
    }
  },

  /**
   * Add a listener for when the user taps a notification.
   * Returns a cleanup function.
   */
  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.EventSubscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  },

  /**
   * Add a listener for when a notification arrives in the foreground.
   * Returns a cleanup function.
   */
  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.EventSubscription {
    return Notifications.addNotificationReceivedListener(callback);
  },

  /**
   * Send a local notification (for testing)
   */
  async sendLocalNotification(
    title: string,
    body: string,
    data?: NotificationData
  ): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: 'default',
      },
      trigger: null, // Immediately
    });
  },

  /**
   * Get the notification that opened the app (if any)
   */
  async getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
    return await Notifications.getLastNotificationResponseAsync();
  },

  /**
   * Set the badge count (iOS)
   */
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  },
};
