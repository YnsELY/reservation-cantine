import { ReactNode, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Lock, ArrowLeft } from 'lucide-react-native';
import { authService } from '@/lib/auth';

interface Props {
  /** Libellé de la page protégée (affiché sous le titre) */
  title?: string;
  children: ReactNode;
}

/**
 * Verrou PIN : protège une page prestataire par un code à 4 chiffres.
 * Le PIN est demandé À CHAQUE FOIS que la page reprend le focus.
 * Si le prestataire n'a aucun PIN défini, la page n'est pas verrouillée.
 */
export function PinGate({ title, children }: Props) {
  const [pin, setPin] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const provider = await authService.getCurrentProviderFromAuth();
        if (!active) return;
        const p = ((provider as any)?.pin as string) || null;
        setPin(p);
        setLocked(!!p);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Re-verrouille à chaque fois que la page reprend le focus.
  useFocusEffect(
    useCallback(() => {
      setCode('');
      setError(false);
      if (pin) setLocked(true);
    }, [pin])
  );

  const verify = (value: string) => {
    if (value === pin) {
      setLocked(false);
      setCode('');
      setError(false);
    } else {
      setError(true);
      setCode('');
    }
  };

  const onChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
    setError(false);
    setCode(digits);
    if (digits.length === 4) verify(digits);
  };

  if (!loaded) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  if (!pin || !locked) {
    return <>{children}</>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#111827" />
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Lock size={30} color="#4F46E5" />
        </View>
        <Text style={styles.title}>Code d'accès requis</Text>
        {title ? <Text style={styles.subtitle}>{title}</Text> : null}
        <Text style={styles.hint}>Saisissez le code à 4 chiffres pour accéder à cette page.</Text>

        <TextInput
          style={[styles.input, error && styles.inputError]}
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
          autoFocus
          placeholder="••••"
          placeholderTextColor="#D1D5DB"
        />

        {error ? <Text style={styles.errorText}>Code incorrect. Réessayez.</Text> : null}

        <TouchableOpacity
          style={[styles.button, code.length !== 4 && styles.buttonDisabled]}
          onPress={() => verify(code)}
          disabled={code.length !== 4}
        >
          <Text style={styles.buttonText}>Valider</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    width: 180,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 12,
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '600',
    marginTop: 12,
  },
  button: {
    marginTop: 28,
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
