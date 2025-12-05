import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { copyToClipboard } from '@/lib/clipboard';
import { ArrowLeft, Key, Plus, Copy, CheckCircle, XCircle, Trash2, School } from 'lucide-react-native';

interface SchoolRegistrationCode {
  id: string;
  code: string;
  is_active: boolean;
  description: string | null;
  created_at: string;
  is_used?: boolean;
  school_name?: string;
}

export default function SchoolAccessScreen() {
  const [codes, setCodes] = useState<SchoolRegistrationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadCodes();
  }, []);

  const loadCodes = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const { data: codesData, error: codesError } = await supabase
        .from('school_registration_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (codesError) throw codesError;

      const { data: schoolsData, error: schoolsError } = await supabase
        .from('schools')
        .select('access_code, name');

      if (schoolsError) throw schoolsError;

      const usedCodes = new Map(schoolsData?.map(school => [school.access_code, school.name]) || []);

      const enrichedCodes = codesData?.map(code => ({
        ...code,
        is_used: usedCodes.has(code.code),
        school_name: usedCodes.get(code.code),
      })) || [];

      setCodes(enrichedCodes);
    } catch (err) {
      console.error('Error loading codes:', err);
      Alert.alert('Erreur', 'Impossible de charger les codes');
    } finally {
      setLoading(false);
    }
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
      if (i === 4) {
        code += '-';
      } else {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    return code;
  };

  const handleCreateCode = async () => {
    if (!newCode.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un code');
      return;
    }

    setIsCreating(true);
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const codeUpper = newCode.trim().toUpperCase();

      const { error } = await supabase
        .from('school_registration_codes')
        .insert({
          code: codeUpper,
          description: newDescription.trim() || null,
          is_active: true,
        });

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Erreur', 'Ce code existe déjà');
        } else {
          throw error;
        }
        return;
      }

      Alert.alert('Succès', 'Code créé avec succès');
      setNewCode('');
      setNewDescription('');
      loadCodes();
    } catch (err) {
      console.error('Error creating code:', err);
      Alert.alert('Erreur', 'Impossible de créer le code');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleStatus = async (code: SchoolRegistrationCode) => {
    try {
      const { error } = await supabase
        .from('school_registration_codes')
        .update({ is_active: !code.is_active })
        .eq('id', code.id);

      if (error) throw error;

      Alert.alert('Succès', code.is_active ? 'Code désactivé' : 'Code activé');
      loadCodes();
    } catch (err) {
      console.error('Error toggling code status:', err);
      Alert.alert('Erreur', 'Impossible de modifier le statut');
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await copyToClipboard(code);
      Alert.alert('Succès', 'Code copié dans le presse-papier');
    } catch (err) {
      console.error('Error copying code:', err);
      Alert.alert('Erreur', 'Impossible de copier le code');
    }
  };

  const handleDeleteCode = async (code: SchoolRegistrationCode) => {
    if (code.is_used) {
      Alert.alert('Erreur', 'Impossible de supprimer un code utilisé par une école');
      return;
    }

    Alert.alert(
      'Confirmer la suppression',
      `Êtes-vous sûr de vouloir supprimer le code ${code.code} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('school_registration_codes')
                .delete()
                .eq('id', code.id);

              if (error) throw error;

              Alert.alert('Succès', 'Code supprimé');
              loadCodes();
            } catch (err) {
              console.error('Error deleting code:', err);
              Alert.alert('Erreur', 'Impossible de supprimer le code');
            }
          },
        },
      ]
    );
  };

  const handleDeleteUnusedCodes = async () => {
    const unusedCodes = codes.filter(code => !code.is_used);

    if (unusedCodes.length === 0) {
      Alert.alert('Information', 'Aucun code non utilisé à supprimer');
      return;
    }

    Alert.alert(
      'Confirmer la suppression',
      `Êtes-vous sûr de vouloir supprimer ${unusedCodes.length} code(s) non utilisé(s) ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const unusedCodeIds = unusedCodes.map(code => code.id);

              const { error } = await supabase
                .from('school_registration_codes')
                .delete()
                .in('id', unusedCodeIds);

              if (error) throw error;

              Alert.alert('Succès', `${unusedCodes.length} code(s) supprimé(s)`);
              loadCodes();
            } catch (err) {
              console.error('Error deleting unused codes:', err);
              Alert.alert('Erreur', 'Impossible de supprimer les codes');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topSection}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Codes d'accès école</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.infoCard}>
          <Key size={48} color="#F59E0B" />
          <Text style={styles.infoTitle}>Créer des codes pour les écoles</Text>
          <Text style={styles.infoText}>
            Les écoles utiliseront ces codes pour créer leur compte et accéder à la plateforme
          </Text>
        </View>

        <View style={styles.createCard}>
          <Text style={styles.createTitle}>Créer un nouveau code</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Code d'accès</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newCode}
                onChangeText={setNewCode}
                placeholder="Ex: ABCD-EFGH"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                maxLength={20}
              />
              <TouchableOpacity
                style={styles.generateButton}
                onPress={() => setNewCode(generateRandomCode())}
              >
                <Text style={styles.generateButtonText}>Générer</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description (optionnel)</Text>
            <TextInput
              style={styles.input}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Ex: Code pour École ABC"
              placeholderTextColor="#9CA3AF"
              maxLength={200}
            />
          </View>

          <TouchableOpacity
            style={[styles.createButton, isCreating && styles.createButtonDisabled]}
            onPress={handleCreateCode}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.createButtonText}>Créer le code</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.codesSection}>
          <View style={styles.codesSectionHeader}>
            <Text style={styles.sectionTitle}>Codes existants ({codes.length})</Text>
            {codes.filter(c => !c.is_used).length > 0 && (
              <TouchableOpacity
                style={styles.deleteAllButton}
                onPress={handleDeleteUnusedCodes}
              >
                <Trash2 size={18} color="#FFFFFF" />
                <Text style={styles.deleteAllButtonText}>
                  Supprimer non utilisés ({codes.filter(c => !c.is_used).length})
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {codes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Aucun code créé</Text>
            </View>
          ) : (
            codes.map((code) => (
              <View key={code.id} style={styles.codeCard}>
                <View style={styles.codeHeader}>
                  <View style={styles.codeInfo}>
                    <View style={styles.codeValueRow}>
                      <Text style={styles.codeValue}>{code.code}</Text>
                      {code.is_used && (
                        <View style={styles.usedBadge}>
                          <School size={14} color="#F59E0B" />
                          <Text style={styles.usedBadgeText}>Utilisé</Text>
                        </View>
                      )}
                    </View>
                    {code.school_name && (
                      <Text style={styles.schoolName}>École: {code.school_name}</Text>
                    )}
                    {code.description && (
                      <Text style={styles.codeDescription}>{code.description}</Text>
                    )}
                    <Text style={styles.codeDate}>
                      Créé le {new Date(code.created_at).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, code.is_active ? styles.statusActive : styles.statusInactive]}>
                    {code.is_active ? (
                      <CheckCircle size={16} color="#10B981" />
                    ) : (
                      <XCircle size={16} color="#EF4444" />
                    )}
                    <Text style={[styles.statusText, code.is_active ? styles.statusActiveText : styles.statusInactiveText]}>
                      {code.is_active ? 'Actif' : 'Inactif'}
                    </Text>
                  </View>
                </View>

                <View style={styles.codeActions}>
                  <TouchableOpacity
                    style={styles.codeActionButton}
                    onPress={() => handleCopyCode(code.code)}
                  >
                    <Copy size={20} color="#F59E0B" />
                    <Text style={[styles.codeActionText, { color: '#F59E0B' }]}>Copier</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.codeActionButton, styles.toggleButton]}
                    onPress={() => handleToggleStatus(code)}
                  >
                    {code.is_active ? (
                      <>
                        <XCircle size={20} color="#EF4444" />
                        <Text style={[styles.codeActionText, { color: '#EF4444' }]}>Désactiver</Text>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={20} color="#10B981" />
                        <Text style={[styles.codeActionText, { color: '#10B981' }]}>Activer</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {!code.is_used && (
                    <TouchableOpacity
                      style={[styles.codeActionButton, styles.deleteButton]}
                      onPress={() => handleDeleteCode(code)}
                    >
                      <Trash2 size={20} color="#EF4444" />
                      <Text style={[styles.codeActionText, { color: '#EF4444' }]}>Supprimer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Comment ça marche ?</Text>
          <Text style={styles.instructionsText}>
            1. Créez un code unique pour chaque école
          </Text>
          <Text style={styles.instructionsText}>
            2. Partagez le code avec l'école
          </Text>
          <Text style={styles.instructionsText}>
            3. L'école utilise ce code lors de la création de son compte
          </Text>
          <Text style={styles.instructionsText}>
            4. Vous pouvez activer/désactiver les codes à tout moment
          </Text>
          <Text style={styles.instructionsText}>
            5. Supprimez les codes non utilisés pour garder une liste propre
          </Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  createCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 24,
  },
  createTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
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
  generateButton: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    justifyContent: 'center',
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
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
  codesSection: {
    marginBottom: 24,
  },
  codesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
  },
  deleteAllButton: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  deleteAllButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  codeCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  codeInfo: {
    flex: 1,
  },
  codeValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  codeValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 1,
  },
  usedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  usedBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
  },
  schoolName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 4,
  },
  codeDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  codeDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  statusActive: {
    backgroundColor: '#D1FAE5',
  },
  statusInactive: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusActiveText: {
    color: '#10B981',
  },
  statusInactiveText: {
    color: '#EF4444',
  },
  codeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  codeActionButton: {
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
  toggleButton: {
    backgroundColor: '#F9FAFB',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FEE2E2',
  },
  codeActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
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
