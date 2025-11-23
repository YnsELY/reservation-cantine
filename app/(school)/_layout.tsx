import { Stack } from 'expo-router';

export default function SchoolLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="students" />
      <Stack.Screen name="commander" />
      <Stack.Screen name="history" />
      <Stack.Screen name="share-access" />
      <Stack.Screen name="orders" />
    </Stack>
  );
}
