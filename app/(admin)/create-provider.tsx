import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';
import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { copyToClipboard } from '@/lib/clipboard';
import { ArrowLeft, Building2, RefreshCw, Plus } from 'lucide-react-native';

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function CreateProviderScreen() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProvider = async () => {
    if (!companyName.trim()) {
      showAlert('Erreur', "Le nom de l'entreprise est requis");
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      showAlert('Erreur', 'Adresse email invalide');
      return;
    }
    if (!/^[0-9]{4}$/.test(pin)) {
      showAlert('Erreur', 'Le PIN doit contenir exactement 4 chiffres');
      return;
    }

    setIsCreating(true);
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent?.is_admin) {
        router.replace('/auth');
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-managed-account', {
        body: { accountType: 'provider', name: companyName.trim(), email: email.trim().toLowerCase(), pin },
      });
      if (error || !data?.activationLink) throw new Error(data?.error || 'Impossible de créer le compte. Vérifiez si cet email est déjà utilisé.');
      const activationLink: string = data.activationLink;
      setCompanyName('');
      setEmail('');
      setPin('');
      showAlert('Compte créé', 'Copiez le lien d’activation et transmettez-le au titulaire. Il choisira son propre mot de passe. Le lien est personnel, temporaire et à usage unique.', [
        { text: 'Copier le lien', onPress: async () => {
          try { await copyToClipboard(activationLink); showAlert('Copié', 'Lien d’activation copié.'); }
          catch { showAlert('Copie impossible', activationLink); }
        } },
      ], { requireExplicitChoice: true });
    } catch (err: any) {
      console.error('Error creating provider:', err);
      showAlert('Erreur', err.message || 'Impossible de créer le prestataire');
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
          <Text style={styles.badgeText}>Créer un prestataire</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.infoCard}>
          <Building2 size={48} color="#4F46E5" />
          <Text style={styles.infoTitle}>Nouveau compte prestataire</Text>
          <Text style={styles.infoText}>
            Le titulaire recevra un lien personnel pour choisir son mot de passe. Aucun mot de passe ne sera conservé dans l’application.
          </Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nom de l'entreprise *</Text>
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="Ex : Cuisine du Quartier"
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
              placeholder="contact@prestataire.fr"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={200}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PIN d'accès (4 chiffres) *</Text>
            <View style={styles.passwordActions}>
              <TextInput
                style={[styles.input, { flex: 1, minWidth: 0 }]}
                value={pin}
                onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="Ex : 4821"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={4}
              />
              <TouchableOpacity
                style={[styles.passwordActionButton, { flex: 0, minWidth: 100, paddingHorizontal: 12 }]}
                onPress={() => setPin(generatePin())}
              >
                <RefreshCw size={16} color="#4F46E5" />
                <Text style={styles.passwordActionText}>Générer</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.pinHint}>Protège les pages de gestion (semaines, menus, suppléments).</Text>
          </View>

          <TouchableOpacity
            style={[styles.createButton, isCreating && styles.createButtonDisabled]}
            onPress={handleCreateProvider}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.createButtonText}>Créer le compte prestataire</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Comment ça marche ?</Text>
          <Text style={styles.instructionsText}>1. Renseignez le nom et l’email du titulaire.</Text>
          <Text style={styles.instructionsText}>2. Créez le compte et copiez le lien d’activation.</Text>
          <Text style={styles.instructionsText}>3. Transmettez ce lien uniquement au titulaire du compte.</Text>
          <Text style={styles.instructionsText}>4. Il choisira son mot de passe. Un lien expiré se renouvelle depuis « Mot de passe oublié ».</Text>
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
    backgroundColor: '#4F46E5',
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
    backgroundColor: '#EEF2FF',
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
    color: '#4F46E5',
  },
  passwordWarning: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
  },
  pinHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  createButton: {
    backgroundColor: '#4F46E5',
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
