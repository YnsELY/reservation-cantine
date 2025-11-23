import { Stack } from 'expo-router';

export default function ParentLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="history" />
      <Stack.Screen name="my-meals" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="reservation" />
      <Stack.Screen name="cart" />
    </Stack>
  );
}
