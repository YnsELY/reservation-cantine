import { Stack } from 'expo-router';

export default function ProviderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="preparation" />
      <Stack.Screen name="menu-orders" />
      <Stack.Screen name="library" />
      <Stack.Screen name="create-week" />
      <Stack.Screen name="week" />
      <Stack.Screen name="menus" />
      <Stack.Screen name="supplements" />
      <Stack.Screen name="add-menu" />
      <Stack.Screen name="add-supplement" />
      <Stack.Screen name="schools" />
      <Stack.Screen name="statistics" />
      <Stack.Screen name="account" />
    </Stack>
  );
}
