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
      <Stack.Screen name="orders" />
      <Stack.Screen name="orders-date-detail" />
      <Stack.Screen name="orders-provider-detail" />
      <Stack.Screen name="orders-school-detail" />
      <Stack.Screen name="parents" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="statistics" />
      <Stack.Screen name="create-school" />
      <Stack.Screen name="create-provider" />
      <Stack.Screen name="account-detail" />
      <Stack.Screen name="cagnottes" />
    </Stack>
  );
}
