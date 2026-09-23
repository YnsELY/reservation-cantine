import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure how notifications are displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
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

      // Configure Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: "Child's Kitchen",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4F46E5',
        });
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


      // Save to Supabase
      await this.saveToken(userId, userType, pushToken);

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
    const deviceType = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    const { error } = await supabase.rpc('register_session_push_token', {
      p_token: pushToken, p_user_id: userId, p_user_type: userType, p_device_type: deviceType,
    });
    if (error) throw error;
    await AsyncStorage.setItem('@cantine/push-token', pushToken);
  },

  /** Revoke using the authenticated session, without calling Expo or reading legacy profile caches. */
  async unregisterToken(): Promise<void> {
    const { error } = await supabase.rpc('revoke_session_push_tokens');
    if (error) throw new Error('Connectez-vous à Internet pour désactiver les notifications de ce compte avant de vous déconnecter.');
    await AsyncStorage.removeItem('@cantine/push-token');
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
