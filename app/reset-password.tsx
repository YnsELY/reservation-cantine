import { useEffect, useState } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff } from 'lucide-react-native';

type Phase = 'loading' | 'form' | 'invalid' | 'done';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void establishRecoverySession();
  }, []);

  // Le lien de l'email arrive sur cette page avec un jeton de récupération dans
  // l'URL (#access_token=...&refresh_token=...&type=recovery). Le client est en
  // detectSessionInUrl:false, donc on l'exploite manuellement pour ouvrir une
  // session temporaire, puis on autorise le changement de mot de passe.
  const establishRecoverySession = async () => {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const raw = window.location.hash || '';
        const params = new URLSearchParams(raw.startsWith('#') ? raw.slice(1) : raw);

        const errorDescription = params.get('error_description');
        if (errorDescription) {
          setError(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
          setPhase('invalid');
          return;
        }

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error: sessErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessErr) {
            setError(sessErr.message);
            setPhase('invalid');
            return;
          }
          // On retire les jetons de l'URL (sécurité / refresh propre)
          window.history.replaceState(null, '', window.location.pathname);
          setPhase('form');
          return;
        }
      }

      // Repli : une session de récupération est peut-être déjà active
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setPhase('form');
        return;
      }

      setError('Lien de réinitialisation invalide ou expiré. Refaites une demande depuis la page de connexion.');
      setPhase('invalid');
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la vérification du lien.');
      setPhase('invalid');
    }
  };

  const handleSave = async () => {
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      setPhase('done');
    } catch (err: any) {
      setError(err.message || 'Impossible de réinitialiser le mot de passe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Réinitialiser le mot de passe</Text>
        </View>

        {phase === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#000000" />
          </View>
        )}

        {phase === 'invalid' && (
          <View style={styles.form}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth')}>
              <Text style={styles.buttonText}>Retour à la connexion</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'form' && (
          <View style={styles.form}>
            <Text style={styles.subtitle}>Choisissez un nouveau mot de passe (8 caractères minimum).</Text>

            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Nouveau mot de passe"
                placeholderTextColor="#6B7280"
                value={password}
                onChangeText={(t) => { setPassword(t); setError(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!saving}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword((s) => !s)}
                accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={20} color="#6B7280" /> : <Eye size={20} color="#6B7280" />}
              </TouchableOpacity>
            </View>

            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Confirmer le mot de passe"
                placeholderTextColor="#6B7280"
                value={confirm}
                onChangeText={(t) => { setConfirm(t); setError(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!saving}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Enregistrer le nouveau mot de passe</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.form}>
            <Text style={styles.successText}>
              Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth')}>
              <Text style={styles.buttonText}>Se connecter</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  header: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 96, height: 96, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#000000', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 20, lineHeight: 21 },
  center: { alignItems: 'center', paddingVertical: 40 },
  form: { width: '100%' },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, marginBottom: 12, color: '#000000',
  },
  passwordRow: { position: 'relative', justifyContent: 'center', marginBottom: 12 },
  passwordInput: { marginBottom: 0, paddingRight: 48 },
  eyeButton: { position: 'absolute', right: 12, height: '100%', justifyContent: 'center', paddingHorizontal: 4 },
  button: { backgroundColor: '#000000', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  errorText: { color: '#EF4444', fontSize: 14, marginBottom: 16, textAlign: 'center', paddingHorizontal: 8 },
  successText: { color: '#059669', fontSize: 15, marginBottom: 20, textAlign: 'center', paddingHorizontal: 8, lineHeight: 21 },
});
