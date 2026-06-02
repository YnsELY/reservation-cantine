import { supabase } from '@/lib/supabase';

export type StartupRoute = '/auth' | '/(admin)' | '/(parent)' | '/(provider)' | '/(school)';

export const MIN_LAUNCH_SCREEN_DURATION_MS = 1200;

let skipNextAuthStartupCheck = false;

export function waitForDuration(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function markNextAuthStartupCheckAsSkipped() {
  skipNextAuthStartupCheck = true;
}

export function consumeSkippedAuthStartupCheck() {
  const shouldSkip = skipNextAuthStartupCheck;
  skipNextAuthStartupCheck = false;
  return shouldSkip;
}

export async function resolveRouteForUser(
  userId: string
): Promise<Exclude<StartupRoute, '/auth'> | null> {
  const [parentResult, schoolResult, providerResult] = await Promise.all([
    supabase.from('parents').select('id, is_admin').eq('user_id', userId).maybeSingle(),
    supabase.from('schools').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('providers').select('id').eq('user_id', userId).maybeSingle(),
  ]);

  if (parentResult.error) {
    console.error('Parent check error:', parentResult.error);
  }

  if (schoolResult.error) {
    console.error('School check error:', schoolResult.error);
  }

  if (providerResult.error) {
    console.error('Provider check error:', providerResult.error);
  }

  if (providerResult.data) {
    // Prestataire désactivé : connexion bloquée.
    // Requête séparée et tolérante : si la colonne is_active n'existe pas encore
    // (migration non appliquée), providerStatus est null et on ne bloque pas.
    const { data: providerStatus } = await supabase
      .from('providers')
      .select('is_active')
      .eq('user_id', userId)
      .maybeSingle();
    if (providerStatus && providerStatus.is_active === false) {
      return null;
    }
    return '/(provider)';
  }

  if (schoolResult.data) {
    return '/(school)';
  }

  if (parentResult.data) {
    return parentResult.data.is_admin ? '/(admin)' : '/(parent)';
  }

  return null;
}

export async function resolveStartupRoute(): Promise<StartupRoute> {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return '/auth';
    }

    if (!session?.user) {
      return '/auth';
    }

    return (await resolveRouteForUser(session.user.id)) ?? '/auth';
  } catch (error) {
    console.error('Startup resolution error:', error);
    return '/auth';
  }
}
