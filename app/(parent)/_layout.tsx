import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';

export default function ParentLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope: require('@/assets/fonts/Manrope-400.ttf'),
    ManropeSemiBold: require('@/assets/fonts/Manrope-600.ttf'),
    ManropeBold: require('@/assets/fonts/Manrope-700.ttf'),
    ManropeExtraBold: require('@/assets/fonts/Manrope-800.ttf'),
  });
  if (!fontsLoaded && !fontError)
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F4F6FB',
        }}
      >
        <ActivityIndicator color="#0E5FC0" />
      </View>
    );
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="history" />
      <Stack.Screen name="my-meals" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="reservation" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="payment" options={{ presentation: 'modal' }} />
      <Stack.Screen name="order-summary" />
    </Stack>
  );
}
