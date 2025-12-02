import { Stack } from 'expo-router';

export default function ProviderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="preparation" />
      <Stack.Screen name="menus" />
      <Stack.Screen name="schools" />
      <Stack.Screen name="statistics" />
      <Stack.Screen name="share-access" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
