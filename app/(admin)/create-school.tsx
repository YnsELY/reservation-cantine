import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';
import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { copyToClipboard } from '@/lib/clipboard';
import { ArrowLeft, School, Eye, EyeOff, RefreshCw, Copy, Plus } from 'lucide-react-native';
import Constants from 'expo-constants';

const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Isolated client without session persistence — signUp here won't affect the admin session
const isolatedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

function generatePassword(): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$!';
  const all = uppercase + lowercase + digits + symbols;

  let password =
    uppercase[Math.floor(Math.random() * uppercase.length)] +
    lowercase[Math.floor(Math.random() * lowercase.length)] +
    digits[Math.floor(Math.random() * digits.length)] +
    symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = 4; i < 12; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export default function CreateSchoolScreen() {
  const [schoolName, setSchoolName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleGeneratePassword = () => {
    setPassword(generatePassword());
    setShowPassword(true);
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    try {
      await copyToClipboard(password);
      showAlert('Copié', 'Mot de passe copié dans le presse-papier');
    } catch {
      showAlert('Erreur', 'Impossible de copier');
    }
  };

  const handleCreateSchool = async () => {
    if (!schoolName.trim()) {
      showAlert('Erreur', "Le nom de l'école est requis");
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      showAlert('Erreur', 'Adresse email invalide');
      return;
    }
    if (!password || password.length < 8) {
      showAlert('Erreur', 'Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setIsCreating(true);
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent?.is_admin) {
        router.replace('/auth');
        return;
      }

      // Create the auth user via isolated client — does NOT affect the admin session
      const { data: authData, error: signUpError } = await isolatedClient.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signUpError) {
        const message = signUpError.message.includes('already registered')
          ? 'Cette adresse email est déjà utilisée'
          : signUpError.message;
        showAlert('Erreur', message);
        return;
      }

      if (!authData.user) {
        showAlert('Erreur', "Impossible de créer le compte. Vérifiez que l'email est valide.");
        return;
      }

      const accessCode = `SCH-${Date.now().toString(36).toUpperCase()}`;

      // Use the main admin client to insert the school record
      const { error: insertError } = await supabase.from('schools').insert({
        user_id: authData.user.id,
        name: schoolName.trim(),
        contact_email: email.trim().toLowerCase(),
        access_code: accessCode,
        is_school_user: true,
      });

      if (insertError) {
        // Best-effort cleanup of the orphaned auth user
        await isolatedClient.auth.admin.deleteUser(authData.user.id).catch(() => {});
        throw insertError;
      }

      // Mémorise le mot de passe initial (table admin-only) pour la fiche admin.
      const { error: credError } = await supabase.from('managed_account_passwords').upsert({
        user_id: authData.user.id,
        account_type: 'school',
        email: email.trim().toLowerCase(),
        temp_password: password,
      });
      if (credError) console.error('store temp password (school) error:', credError);

      const capturedPassword = password;
      const capturedEmail = email.trim().toLowerCase();
      const capturedName = schoolName.trim();

      setSchoolName('');
      setEmail('');
      setPassword('');

      showAlert(
        'École créée !',
        `Le compte de "${capturedName}" a été créé.\n\nEmail : ${capturedEmail}\nMot de passe temporaire : ${capturedPassword}\n\nCommuniquez ces identifiants à l'école.`,
        [
          {
            text: 'Copier le mot de passe',
            onPress: async () => {
              await copyToClipboard(capturedPassword).catch(() => {});
            },
          },
          { text: 'OK' },
        ]
      );
    } catch (err: any) {
      console.error('Error creating school:', err);
      showAlert('Erreur', err.message || "Impossible de créer l'école");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topSection}>
        <TouchableOpacity style={styles.backButton} onPress={() => safeBack('/(admin)')}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Créer une école</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.infoCard}>
          <School size={48} color="#F59E0B" />
          <Text style={styles.infoTitle}>Nouveau compte école</Text>
          <Text style={styles.infoText}>
            Créez directement le compte d'une école. L'école pourra se connecter avec l'email et le mot de passe temporaire que vous lui communiquerez.
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nom de l'école *</Text>
            <TextInput
              style={styles.input}
              value={schoolName}
              onChangeText={setSchoolName}
              placeholder="Ex : École Primaire Victor Hugo"
              placeholderTextColor="#9CA3AF"
              maxLength={100}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Adresse email *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="contact@ecole.fr"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={200}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mot de passe temporaire *</Text>

            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Générez ou saisissez un mot de passe"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                maxLength={64}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                {showPassword
                  ? <EyeOff size={20} color="#6B7280" />
                  : <Eye size={20} color="#6B7280" />
                }
              </TouchableOpacity>
            </View>

            <View style={styles.passwordActions}>
              <TouchableOpacity style={styles.passwordActionButton} onPress={handleGeneratePassword}>
                <RefreshCw size={16} color="#F59E0B" />
                <Text style={styles.passwordActionText}>Générer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.passwordActionButton, !password && styles.passwordActionButtonDisabled]}
                onPress={handleCopyPassword}
                disabled={!password}
              >
                <Copy size={16} color={password ? '#4F46E5' : '#D1D5DB'} />
                <Text style={[styles.passwordActionText, { color: password ? '#4F46E5' : '#D1D5DB' }]}>
                  Copier
                </Text>
              </TouchableOpacity>
            </View>

            {password.length > 0 && password.length < 8 && (
              <Text style={styles.passwordWarning}>Le mot de passe doit faire au moins 8 caractères</Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.createButton, isCreating && styles.createButtonDisabled]}
            onPress={handleCreateSchool}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.createButtonText}>Créer le compte école</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Comment ça marche ?</Text>
          <Text style={styles.instructionsText}>1. Renseignez le nom et l'email de l'école</Text>
          <Text style={styles.instructionsText}>2. Générez un mot de passe temporaire sécurisé</Text>
          <Text style={styles.instructionsText}>3. Créez le compte — l'école est immédiatement active</Text>
          <Text style={styles.instructionsText}>4. Communiquez l'email et le mot de passe à l'école</Text>
          <Text style={styles.instructionsText}>5. L'école pourra changer son mot de passe après connexion</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
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
    marginBottom: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: '#FEF3C7',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  passwordInputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  passwordInput: {
    flex: 1,
    paddingRight: 48,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
  },
  passwordActions: {
    flexDirection: 'row',
    gap: 8,
  },
  passwordActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  passwordActionButtonDisabled: {
    opacity: 0.5,
  },
  passwordActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  passwordWarning: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
  },
  createButton: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  instructionsCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  instructionsText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 24,
    marginBottom: 8,
  },
});
