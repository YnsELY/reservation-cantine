/* eslint-disable react/no-unescaped-entities */
import { useEffect, useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AppLaunchScreen from '@/components/AppLaunchScreen';
import { sendSignupConfirmationEmail } from '@/lib/emails';
import {
  consumeSkippedAuthStartupCheck,
  MIN_LAUNCH_SCREEN_DURATION_MS,
  resolveRouteForUser,
  resolveStartupRoute,
  waitForDuration,
} from '@/lib/startup';
import { supabase } from '@/lib/supabase';

type AuthMode = 'login' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingSession, setCheckingSession] = useState(() => !consumeSkippedAuthStartupCheck());
  const router = useRouter();

  useEffect(() => {
    if (checkingSession) {
      void checkExistingSession();
    }
  }, []);

  const checkExistingSession = async () => {
    const startedAt = Date.now();

    try {
      const targetRoute = await resolveStartupRoute();
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(MIN_LAUNCH_SCREEN_DURATION_MS - elapsed, 0);

      if (remaining > 0) {
        await waitForDuration(remaining);
      }

      if (targetRoute !== '/auth') {
        router.replace(targetRoute);
        return;
      }
    } catch (error) {
      console.error('Session check error:', error);
    } finally {
      setCheckingSession(false);
    }
  };

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (mode === 'signup' && (!firstName.trim() || !lastName.trim())) {
      setError('Veuillez entrer votre prénom et nom');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        });

        if (signInError) throw signInError;

        if (authData.user) {
          const targetRoute = await resolveRouteForUser(authData.user.id);

          if (targetRoute) {
            setLoading(false);
            setTimeout(() => {
              router.replace(targetRoute);
            }, 100);
            return;
          }

          setError('Compte non trouvé');
          setLoading(false);
        }
      } else {
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });

        if (signUpError) throw signUpError;

        if (authData.user) {
          try {
            const { error: insertError } = await supabase
              .from('parents')
              .insert({
                user_id: authData.user.id,
                email: email.trim(),
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                access_code: `PAR-${Date.now().toString(36).toUpperCase()}`,
              });

            if (insertError) throw insertError;

            try {
              const { error: emailError } = await sendSignupConfirmationEmail();
              if (emailError) {
                console.error('Signup confirmation email error:', emailError);
              }
            } catch (emailError) {
              console.error('Unexpected signup confirmation email error:', emailError);
            }

            setLoading(false);
            setTimeout(() => {
              router.replace('/(parent)');
            }, 100);
          } catch (insertErr: any) {
            console.error('Error inserting parent data, cleaning up auth user:', insertErr);
            await supabase.auth.admin.deleteUser(authData.user.id).catch(console.error);
            throw new Error('Échec de la création du profil. Veuillez réessayer.');
          }
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || "Erreur lors de l'authentification");
    } finally {
      setLoading(false);
    }
  };

  const renderLegalLinks = () => (
    <View style={styles.legalSection}>
      <Text style={styles.legalTitle}>Documents légaux</Text>
      <TouchableOpacity style={styles.legalLink} onPress={() => router.push('/legal/cgv')}>
        <Text style={styles.legalLinkText}>Conditions générales de vente</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.legalLink} onPress={() => router.push('/legal/privacy')}>
        <Text style={styles.legalLinkText}>Politique de confidentialité</Text>
      </TouchableOpacity>
    </View>
  );

  if (checkingSession) {
    return <AppLaunchScreen />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>{"Child's Kitchen"}</Text>
          <Text style={styles.subtitle}>
            {mode === 'login' ? 'Connectez-vous à votre compte' : 'Créez votre compte parent'}
          </Text>
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => {
              setMode('login');
              setError('');
            }}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
              Connexion
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'signup' && styles.tabActive]}
            onPress={() => {
              setMode('signup');
              setError('');
            }}
          >
            <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
              Inscription
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#6B7280"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError('');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor="#6B7280"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError('');
            }}
            secureTextEntry
            autoCapitalize="none"
            editable={!loading}
          />

          {mode === 'signup' && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Prénom"
                placeholderTextColor="#6B7280"
                value={firstName}
                onChangeText={(text) => {
                  setFirstName(text);
                  setError('');
                }}
                editable={!loading}
              />

              <TextInput
                style={styles.input}
                placeholder="Nom"
                placeholderTextColor="#6B7280"
                value={lastName}
                onChangeText={(text) => {
                  setLastName(text);
                  setError('');
                }}
                editable={!loading}
              />
            </>
          )}

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'login' && (
            <Text style={styles.helperText}>
              Vous êtes une école ou un prestataire ? Connectez-vous avec les identifiants fournis par l'administrateur.
            </Text>
          )}
        </View>

        {renderLegalLinks()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#000000',
  },
  form: {
    width: '100%',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    color: '#000000',
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  button: {
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  legalSection: {
    marginTop: 24,
    alignItems: 'center',
  },
  legalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  legalLink: {
    paddingVertical: 6,
  },
  legalLinkText: {
    fontSize: 14,
    color: '#111827',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
