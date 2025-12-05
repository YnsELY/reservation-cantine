import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { copyToClipboard } from '@/lib/clipboard';
import { ArrowLeft, Key, Plus, Copy, Edit, X, School } from 'lucide-react-native';

interface School {
  id: string;
  name: string;
  access_code: string;
  created_at: string;
}

export default function SchoolAccessScreen() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [newCode, setNewCode] = useState('CreateSchool2025');
  const [isUpdating, setIsUpdating] = useState(false);
  const [createCode, setCreateCode] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadSchools();
  }, []);

  const loadSchools = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }

      const { data: schoolsData, error: schoolsError } = await supabase
        .from('schools')
        .select('*')
        .order('name', { ascending: true });

      if (schoolsError) throw schoolsError;

      setSchools(schoolsData || []);
    } catch (err) {
      console.error('Error loading schools:', err);
      Alert.alert('Erreur', 'Impossible de charger les écoles');
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

  const handleEditCode = (school: School) => {
    setEditingSchool(school);
    setNewCode(school.access_code);
  };

  const handleUpdateCode = async () => {
    if (!editingSchool || !newCode.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un code valide');
      return;
    }

    setIsUpdating(true);
    try {
      const codeUpper = newCode.trim().toUpperCase();

      const { data: existingSchool, error: checkError } = await supabase
        .from('schools')
        .select('id')
        .eq('access_code', codeUpper)
        .neq('id', editingSchool.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingSchool) {
        Alert.alert('Erreur', 'Ce code est déjà utilisé par une autre école');
        setIsUpdating(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('schools')
        .update({ access_code: codeUpper })
        .eq('id', editingSchool.id);

      if (updateError) throw updateError;

      Alert.alert('Succès', 'Code mis à jour avec succès');
      setEditingSchool(null);
      setNewCode('CreateSchool2025');
      loadSchools();
    } catch (err) {
      console.error('Error updating code:', err);
      Alert.alert('Erreur', 'Impossible de mettre à jour le code');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateCode = async () => {
    if (!createCode.trim()) {
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

      const codeUpper = createCode.trim().toUpperCase();

      const { error } = await supabase
        .from('school_registration_codes')
        .insert({
          code: codeUpper,
          description: createDescription.trim() || null,
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
      setCreateCode('');
      setCreateDescription('');
    } catch (err) {
      console.error('Error creating code:', err);
      Alert.alert('Erreur', 'Impossible de créer le code');
    } finally {
      setIsCreating(false);
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
          <Text style={styles.infoTitle}>Gérer les codes d'accès des écoles</Text>
          <Text style={styles.infoText}>
            Chaque école dispose d'un code unique pour accéder à la plateforme
          </Text>
        </View>

        <View style={styles.createCard}>
          <Text style={styles.createTitle}>Créer un nouveau code d'accès</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Code d'accès</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={createCode}
                onChangeText={setCreateCode}
                placeholder="Ex: CreateSchool2025"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                maxLength={50}
              />
              <TouchableOpacity
                style={styles.generateButton}
                onPress={() => setCreateCode(generateRandomCode())}
              >
                <Text style={styles.generateButtonText}>Générer</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description (optionnel)</Text>
            <TextInput
              style={styles.input}
              value={createDescription}
              onChangeText={setCreateDescription}
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
          <Text style={styles.sectionTitle}>Écoles inscrites ({schools.length})</Text>

          {schools.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Aucune école inscrite</Text>
            </View>
          ) : (
            schools.map((school) => (
              <View key={school.id} style={styles.codeCard}>
                <View style={styles.codeHeader}>
                  <View style={styles.codeInfo}>
                    <Text style={styles.schoolName}>{school.name}</Text>
                    <View style={styles.codeValueRow}>
                      <Text style={styles.codeValue}>{school.access_code}</Text>
                    </View>
                    <Text style={styles.codeDate}>
                      Inscrite le {new Date(school.created_at).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <School size={16} color="#F59E0B" />
                  </View>
                </View>

                <View style={styles.codeActions}>
                  <TouchableOpacity
                    style={styles.codeActionButton}
                    onPress={() => handleCopyCode(school.access_code)}
                  >
                    <Copy size={20} color="#F59E0B" />
                    <Text style={[styles.codeActionText, { color: '#F59E0B' }]}>Copier</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.codeActionButton, styles.editButton]}
                    onPress={() => handleEditCode(school)}
                  >
                    <Edit size={20} color="#4F46E5" />
                    <Text style={[styles.codeActionText, { color: '#4F46E5' }]}>Modifier</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Comment ça marche ?</Text>
          <Text style={styles.instructionsText}>
            1. Créez un nouveau code d'accès pour permettre à une école de s'inscrire
          </Text>
          <Text style={styles.instructionsText}>
            2. Partagez ce code avec l'école pour qu'elle puisse créer son compte
          </Text>
          <Text style={styles.instructionsText}>
            3. Une fois inscrite, l'école apparaîtra dans la liste ci-dessus
          </Text>
          <Text style={styles.instructionsText}>
            4. Vous pouvez modifier le code d'accès d'une école en cliquant sur "Modifier"
          </Text>
          <Text style={styles.instructionsText}>
            5. Le code par défaut est "CreateSchool2025"
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={editingSchool !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingSchool(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier le code d'accès</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setEditingSchool(null);
                  setNewCode('CreateSchool2025');
                }}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {editingSchool && (
              <>
                <Text style={styles.modalSchoolName}>{editingSchool.name}</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nouveau code d'accès</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      value={newCode}
                      onChangeText={setNewCode}
                      placeholder="Ex: CreateSchool2025"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="characters"
                      maxLength={50}
                    />
                    <TouchableOpacity
                      style={styles.generateButton}
                      onPress={() => setNewCode(generateRandomCode())}
                    >
                      <Text style={styles.generateButtonText}>Générer</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setEditingSchool(null);
                      setNewCode('CreateSchool2025');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalButton, styles.saveButton, isUpdating && styles.saveButtonDisabled]}
                    onPress={handleUpdateCode}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveButtonText}>Enregistrer</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
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
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  codeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  schoolName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  codeDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  statusBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
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
  editButton: {
    backgroundColor: '#EEF2FF',
    borderColor: '#EEF2FF',
  },
  codeActionText: {
    fontSize: 14,
    fontWeight: '600',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 500,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSchoolName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 20,
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
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButton: {
    backgroundColor: '#F59E0B',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
