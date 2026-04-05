import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import AppLaunchScreen from '@/components/AppLaunchScreen';
import {
  MIN_LAUNCH_SCREEN_DURATION_MS,
  markNextAuthStartupCheckAsSkipped,
  resolveStartupRoute,
  waitForDuration,
} from '@/lib/startup';

export default function IndexScreen() {
  const router = useRouter();
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const startedAt = Date.now();

    const bootstrapApp = async () => {
      const targetRoute = await resolveStartupRoute();
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(MIN_LAUNCH_SCREEN_DURATION_MS - elapsed, 0);

      if (remaining > 0) {
        await waitForDuration(remaining);
      }

      if (!isMounted || hasNavigatedRef.current) {
        return;
      }

      hasNavigatedRef.current = true;

      if (targetRoute === '/auth') {
        markNextAuthStartupCheckAsSkipped();
        router.replace('/auth');
        return;
      }

      router.replace(targetRoute);
    };

    void bootstrapApp();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return <AppLaunchScreen />;
}
