import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AlertProvider } from '@/lib/alert';
import 'react-native-url-polyfill/auto';

export default function RootLayout() {
  useFrameworkReady();

  return (
    <AlertProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="legal/cgv" options={{ headerShown: false }} />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="(parent)" options={{ headerShown: false }} />
        <Stack.Screen name="(school)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </AlertProvider>
  );
}
