import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

type LoaderDotProps = {
  color: string;
  delay: number;
};

function LoaderDot({ color, delay }: LoaderDotProps) {
  const progress = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0.45,
          duration: 480,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [delay, progress]);

  return (
    <Animated.View
      style={[
        styles.loaderDot,
        { backgroundColor: color },
        {
          opacity: progress,
          transform: [
            {
              scaleY: progress.interpolate({
                inputRange: [0.45, 1],
                outputRange: [0.85, 1.2],
              }),
            },
            {
              translateY: progress.interpolate({
                inputRange: [0.45, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    />
  );
}

export default function AppLaunchScreen() {
  const intro = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const logoPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const introAnimation = Animated.timing(intro, {
      toValue: 1,
      duration: 850,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    const floatAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: -10,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    const logoPulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    introAnimation.start();
    floatAnimation.start();
    logoPulseAnimation.start();

    return () => {
      introAnimation.stop();
      floatAnimation.stop();
      logoPulseAnimation.stop();
    };
  }, [float, intro, logoPulse]);

  const heroAnimatedStyle = {
    opacity: intro,
    transform: [
      {
        translateY: Animated.add(
          intro.interpolate({
            inputRange: [0, 1],
            outputRange: [28, 0],
          }),
          float
        ),
      },
      {
        scale: intro.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1],
        }),
      },
    ],
  };

  const logoAnimatedStyle = {
    opacity: logoPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.92, 1],
    }),
    transform: [
      {
        scale: logoPulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1.015],
        }),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.content}>
        <Animated.View style={[styles.hero, heroAnimatedStyle]}>
          <Animated.View style={logoAnimatedStyle}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <Text style={styles.brandName}>{"Child's Kitchen"}</Text>
          <Text style={styles.caption}>Préparation de votre espace</Text>

          <View style={styles.loaderRow}>
            <LoaderDot color="#1D4ED8" delay={0} />
            <LoaderDot color="#2563EB" delay={150} />
            <LoaderDot color="#60A5FA" delay={300} />
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hero: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  logo: {
    width: 190,
    height: 190,
    marginBottom: 22,
  },
  brandName: {
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#0F172A',
    textAlign: 'center',
  },
  caption: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    color: '#64748B',
    textAlign: 'center',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 30,
    height: 28,
  },
  loaderDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
});
