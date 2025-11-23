import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="menus" />
      <Stack.Screen name="parents" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
