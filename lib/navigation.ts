import { router, type Href } from 'expo-router';

/**
 * Navigates back when possible, otherwise falls back to a sensible default
 * route. Use this instead of `router.back()` to ensure back buttons keep
 * working when the user lands on a deep link directly (no history) or
 * reloads the page on web.
 */
export const safeBack = (fallback: Href) => {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
};
