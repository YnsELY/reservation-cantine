import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { LogIn, UserPlus, School, User, Building2 } from 'lucide-react-native';

type AuthMode = 'login' | 'signup';
type UserType = 'parent' | 'school' | 'provider';

export default function AuthScreen() {
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
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('Session error:', sessionError);
        setCheckingSession(false);
        return;
      }

      if (session?.user) {
        const [parentResult, schoolResult, providerResult] = await Promise.all([
          supabase.from('parents').select('*').eq('user_id', session.user.id).maybeSingle(),
          supabase.from('schools').select('*').eq('user_id', session.user.id).maybeSingle(),
          supabase.from('providers').select('*').eq('user_id', session.user.id).maybeSingle(),
        ]);

        if (parentResult.error) {
          console.error('Parent check error:', parentResult.error);
        }

        if (schoolResult.error) {
          console.error('School check error:', schoolResult.error);
        }

        const parentData = parentResult.data;
        const schoolData = schoolResult.data;
        const providerData = providerResult.data;

        if (providerData) {
          setCheckingSession(false);
          setTimeout(() => {
            router.replace('/(provider)');
          }, 50);
          return;
        }

        if (schoolData) {
          setCheckingSession(false);
          setTimeout(() => {
            router.replace('/(school)');
          }, 50);
          return;
        }

        if (parentData) {
          setCheckingSession(false);
          setTimeout(() => {
            if (parentData.is_admin) {
              router.replace('/(admin)');
            } else {
              router.replace('/(parent)');
            }
          }, 50);
          return;
        }
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
          const [parentResult, schoolResult, providerResult] = await Promise.all([
            supabase.from('parents').select('*').eq('user_id', authData.user.id).maybeSingle(),
            supabase.from('schools').select('*').eq('user_id', authData.user.id).maybeSingle(),
            supabase.from('providers').select('*').eq('user_id', authData.user.id).maybeSingle(),
          ]);

          const parentData = parentResult.data;
          const schoolData = schoolResult.data;
          const providerData = providerResult.data;

          if (providerData) {
            setLoading(false);
            setTimeout(() => {
              router.replace('/(provider)');
            }, 100);
            return;
          }

          if (schoolData) {
            setLoading(false);
            setTimeout(() => {
              router.replace('/(school)');
            }, 100);
            return;
          }

          if (parentData) {
            setLoading(false);
            setTimeout(() => {
              if (parentData.is_admin) {
                router.replace('/(admin)');
              } else {
                router.replace('/(parent)');
              }
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

  if (checkingSession) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconContainer}>
            {mode === 'login' ? (
              <LogIn size={48} color="#000000" />
            ) : (
              <UserPlus size={48} color="#000000" />
            )}
          </View>
          <Text style={styles.title}>Réservation Repas</Text>
          <Text style={styles.subtitle}>
            {mode === 'login' ? 'Connectez-vous' : 'Créez votre compte'}
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

              <View style={styles.switchAccountTypeContainer}>
                <TouchableOpacity
                  style={styles.switchAccountTypeButton}
                  onPress={() => setUserType('school')}
                >
                  <School size={16} color="#6B7280" />
                  <Text style={styles.switchAccountTypeText}>Je suis une école</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.switchAccountTypeButton}
                  onPress={() => setUserType('provider')}
                >
                  <Building2 size={16} color="#6B7280" />
                  <Text style={styles.switchAccountTypeText}>Je suis un prestataire</Text>
                </TouchableOpacity>
              </View>
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

              <View style={styles.switchAccountTypeContainer}>
                <TouchableOpacity
                  style={styles.switchAccountTypeButton}
                  onPress={() => setUserType('parent')}
                >
                  <User size={16} color="#6B7280" />
                  <Text style={styles.switchAccountTypeText}>Je suis un parent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.switchAccountTypeButton}
                  onPress={() => setUserType('provider')}
                >
                  <Building2 size={16} color="#6B7280" />
                  <Text style={styles.switchAccountTypeText}>Je suis un prestataire</Text>
                </TouchableOpacity>
              </View>
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

              <View style={styles.switchAccountTypeContainer}>
                <TouchableOpacity
                  style={styles.switchAccountTypeButton}
                  onPress={() => setUserType('parent')}
                >
                  <User size={16} color="#6B7280" />
                  <Text style={styles.switchAccountTypeText}>Je suis un parent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.switchAccountTypeButton}
                  onPress={() => setUserType('school')}
                >
                  <School size={16} color="#6B7280" />
                  <Text style={styles.switchAccountTypeText}>Je suis une école</Text>
                </TouchableOpacity>
              </View>
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
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  switchAccountTypeContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  switchAccountTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  switchAccountTypeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
});
