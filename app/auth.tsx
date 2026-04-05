import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AppLaunchScreen from '@/components/AppLaunchScreen';
import {
  consumeSkippedAuthStartupCheck,
  MIN_LAUNCH_SCREEN_DURATION_MS,
  resolveRouteForUser,
  resolveStartupRoute,
  waitForDuration,
} from '@/lib/startup';
import { supabase } from '@/lib/supabase';
import { LogIn, UserPlus, School, User, Building2, ArrowLeft, UtensilsCrossed } from 'lucide-react-native';

type AuthMode = 'login' | 'signup';
type UserType = 'parent' | 'school' | 'provider';
type Screen = 'role-selection' | 'auth-form';

export default function AuthScreen() {
  const [screen, setScreen] = useState<Screen>('role-selection');
  const [mode, setMode] = useState<AuthMode>('login');
  const [userType, setUserType] = useState<UserType>('parent');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [schoolAccessCode, setSchoolAccessCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [providerCode, setProviderCode] = useState('');
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

    if (mode === 'signup') {
      if (userType === 'parent' && (!firstName.trim() || !lastName.trim())) {
        setError('Veuillez entrer votre prénom et nom');
        return;
      }
      if (userType === 'school' && (!schoolName.trim() || !schoolAccessCode.trim())) {
        setError('Veuillez entrer le nom de l\'école et le code d\'accès');
        return;
      }
      if (userType === 'provider' && (!companyName.trim() || !providerCode.trim())) {
        setError('Veuillez entrer le nom de l\'entreprise et le code d\'accès');
        return;
      }
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
        let validatedCode: string | null = null;

        if (userType === 'school') {
          const validationCodeUpper = schoolAccessCode.trim().toUpperCase();

          const { data: validCode } = await supabase
            .from('school_registration_codes')
            .select('code')
            .eq('code', validationCodeUpper)
            .eq('is_active', true)
            .maybeSingle();

          if (!validCode) {
            setError('Code d\'accès école invalide. Contactez l\'administrateur.');
            setLoading(false);
            return;
          }
          validatedCode = validationCodeUpper;
        } else if (userType === 'provider') {
          const validationCodeUpper = providerCode.trim().toUpperCase();

          const { data: validCode, error: codeError } = await supabase
            .from('provider_registration_codes')
            .select('code')
            .eq('code', validationCodeUpper)
            .eq('is_active', true)
            .maybeSingle();

          if (codeError) {
            console.error('Error checking provider code:', codeError);
            setError('Erreur lors de la vérification du code: ' + codeError.message);
            setLoading(false);
            return;
          }

          if (!validCode) {
            setError('Code d\'accès prestataire invalide. Contactez l\'administrateur.');
            setLoading(false);
            return;
          }
          validatedCode = validationCodeUpper;
        }

        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password: password.trim(),
        });

        if (signUpError) throw signUpError;

        if (authData.user) {
          try {
            if (userType === 'parent') {
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

              setLoading(false);
              setTimeout(() => {
                router.replace('/(parent)');
              }, 100);
            } else if (userType === 'school') {
              const generatedAccessCode = `SCH-${Date.now().toString(36).toUpperCase()}`;

              const { error: insertError } = await supabase
                .from('schools')
                .insert({
                  user_id: authData.user.id,
                  name: schoolName.trim(),
                  access_code: generatedAccessCode,
                  is_school_user: true,
                });

              if (insertError) throw insertError;

              setLoading(false);
              setTimeout(() => {
                router.replace('/(school)');
              }, 100);
            } else if (userType === 'provider') {
              const { error: insertError } = await supabase
                .from('providers')
                .insert({
                  user_id: authData.user.id,
                  email: email.trim(),
                  company_name: companyName.trim(),
                  registration_code: validatedCode!,
                });

              if (insertError) throw insertError;

              setLoading(false);
              setTimeout(() => {
                router.replace('/(provider)');
              }, 100);
            }
          } catch (insertErr: any) {
            console.error('Error inserting user data, cleaning up auth user:', insertErr);

            await supabase.auth.admin.deleteUser(authData.user.id).catch(console.error);

            throw new Error('Échec de la création du profil. Veuillez réessayer.');
          }
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Erreur lors de l\'authentification');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelection = (role: UserType) => {
    setUserType(role);
    setScreen('auth-form');
    setError('');
  };

  const handleBackToRoleSelection = () => {
    setScreen('role-selection');
    setMode('login');
    setEmail('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setSchoolName('');
    setSchoolAccessCode('');
    setCompanyName('');
    setProviderCode('');
    setError('');
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

  if (screen === 'role-selection') {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.roleSelectionScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <UtensilsCrossed size={48} color="#000000" />
            </View>
            <Text style={styles.title}>{"Child's Kitchen"}</Text>
            <Text style={styles.subtitle}>Sélectionnez votre profil</Text>
          </View>

          <View style={styles.roleCardsContainer}>
            <TouchableOpacity
              style={[styles.roleCard, styles.roleCardParent]}
              onPress={() => handleRoleSelection('parent')}
              activeOpacity={0.7}
            >
              <View style={[styles.roleIconContainer, styles.roleIconParent]}>
                <User size={32} color="#FFFFFF" strokeWidth={2.5} />
              </View>
              <View style={styles.roleCardContent}>
                <Text style={styles.roleCardTitle}>Parent</Text>
                <Text style={styles.roleCardDescription}>
                  Réservez des repas pour vos enfants
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleCard, styles.roleCardSchool]}
              onPress={() => handleRoleSelection('school')}
              activeOpacity={0.7}
            >
              <View style={[styles.roleIconContainer, styles.roleIconSchool]}>
                <School size={32} color="#FFFFFF" strokeWidth={2.5} />
              </View>
              <View style={styles.roleCardContent}>
                <Text style={styles.roleCardTitle}>École</Text>
                <Text style={styles.roleCardDescription}>
                  Gérez les commandes de votre établissement
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleCard, styles.roleCardProvider]}
              onPress={() => handleRoleSelection('provider')}
              activeOpacity={0.7}
            >
              <View style={[styles.roleIconContainer, styles.roleIconProvider]}>
                <Building2 size={32} color="#FFFFFF" strokeWidth={2.5} />
              </View>
              <View style={styles.roleCardContent}>
                <Text style={styles.roleCardTitle}>Prestataire</Text>
                <Text style={styles.roleCardDescription}>
                  Proposez vos menus aux écoles
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {renderLegalLinks()}
        </ScrollView>
      </View>
    );
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
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackToRoleSelection}
        >
          <ArrowLeft size={24} color="#000000" />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconContainer}>
            {userType === 'parent' && <User size={48} color="#4F46E5" />}
            {userType === 'school' && <School size={48} color="#10B981" />}
            {userType === 'provider' && <Building2 size={48} color="#F59E0B" />}
          </View>
          <Text style={styles.title}>{"Child's Kitchen"}</Text>
          <Text style={styles.subtitle}>
            {userType === 'parent' && 'Espace Parent'}
            {userType === 'school' && 'Espace École'}
            {userType === 'provider' && 'Espace Prestataire'}
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

          {mode === 'signup' && userType === 'parent' && (
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

          {mode === 'signup' && userType === 'school' && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Nom de l'école"
                placeholderTextColor="#6B7280"
                value={schoolName}
                onChangeText={(text) => {
                  setSchoolName(text);
                  setError('');
                }}
                editable={!loading}
              />

              <TextInput
                style={styles.input}
                placeholder="Code d'accès de l'école"
                placeholderTextColor="#6B7280"
                value={schoolAccessCode}
                onChangeText={(text) => {
                  setSchoolAccessCode(text.toUpperCase());
                  setError('');
                }}
                autoCapitalize="characters"
                editable={!loading}
              />
              <Text style={styles.helperText}>
                Ce code permettra aux parents de s'affilier à votre école
              </Text>
            </>
          )}

          {mode === 'signup' && userType === 'provider' && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Nom de l'entreprise"
                placeholderTextColor="#6B7280"
                value={companyName}
                onChangeText={(text) => {
                  setCompanyName(text);
                  setError('');
                }}
                editable={!loading}
              />

              <TextInput
                style={styles.input}
                placeholder="Code d'accès prestataire"
                placeholderTextColor="#6B7280"
                value={providerCode}
                onChangeText={(text) => {
                  setProviderCode(text.toUpperCase());
                  setError('');
                }}
                autoCapitalize="characters"
                editable={!loading}
              />
              <Text style={styles.helperText}>
                Demandez ce code à l'administrateur
              </Text>
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
  roleSelectionScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    padding: 8,
    zIndex: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  roleCardsContainer: {
    gap: 12,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 0,
  },
  roleCardParent: {
    backgroundColor: '#EEF2FF',
  },
  roleCardSchool: {
    backgroundColor: '#F0FDF4',
  },
  roleCardProvider: {
    backgroundColor: '#FFFBEB',
  },
  roleIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  roleIconParent: {
    backgroundColor: '#4F46E5',
  },
  roleIconSchool: {
    backgroundColor: '#10B981',
  },
  roleIconProvider: {
    backgroundColor: '#F59E0B',
  },
  roleCardContent: {
    flex: 1,
  },
  roleCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  roleCardDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
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
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
    marginTop: -8,
    paddingHorizontal: 4,
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
