import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { copyToClipboard as copyToClipboardUtil } from '@/lib/clipboard';
import { UserPlus, Copy, AlertCircle, X } from 'lucide-react-native';

export default function ParentsManagement() {
  const [currentAdmin, setCurrentAdmin] = useState<Parent | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const [newParent, setNewParent] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const admin = await authService.getCurrentParentFromAuth();
      if (!admin || !admin.is_admin) {
        router.replace('/auth');
        return;
      }

      setCurrentAdmin(admin);

      const { data: parentsData, error: parentsError } = await supabase
        .from('parents')
        .select('*')
        .eq('school_id', admin.school_id)
        .eq('is_admin', false)
        .order('created_at', { ascending: false });

      if (parentsError) throw parentsError;

      setParents(parentsData || []);
      setError('');
    } catch (err) {
      console.error('Error loading parents:', err);
      setError('Erreur lors du chargement des parents');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCreateParent = async () => {
    if (!newParent.first_name || !newParent.last_name) {
      Alert.alert('Erreur', 'Le prénom et le nom sont requis');
      return;
    }

    if (!currentAdmin?.school_id) {
      Alert.alert('Erreur', 'École non définie');
      return;
    }

    setCreating(true);

    try {
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_access_code');

      if (codeError) throw codeError;

      const accessCode = codeData;

      const { error: insertError } = await supabase
        .from('parents')
        .insert([{
          access_code: accessCode,
          first_name: newParent.first_name,
          last_name: newParent.last_name,
          email: newParent.email || null,
          phone: newParent.phone || null,
          is_admin: false,
          school_id: currentAdmin.school_id,
        }]);

      if (insertError) throw insertError;

      Alert.alert(
        'Succès',
        `Parent créé avec succès!\n\nCode d'accès: ${accessCode}\n\nPartagez ce code avec le parent.`,
        [{ text: 'OK', onPress: () => {
          setModalVisible(false);
          setNewParent({ first_name: '', last_name: '', email: '', phone: '' });
          loadData();
        }}]
      );
    } catch (err) {
      console.error('Error creating parent:', err);
      Alert.alert('Erreur', 'Erreur lors de la création du parent');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await copyToClipboardUtil(code);
      Alert.alert('Succès', 'Code copié dans le presse-papier');
    } catch (err) {
      console.error('Error copying code:', err);
      Alert.alert('Erreur', 'Impossible de copier le code');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Gestion Parents</Text>
          <Text style={styles.headerSubtitle}>{parents.length} parent(s)</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <UserPlus size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error ? (
          <View style={styles.errorContainer}>
            <AlertCircle size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {parents.length === 0 ? (
          <View style={styles.emptyState}>
            <UserPlus size={48} color="#9CA3AF" />
            <Text style={styles.emptyStateTitle}>Aucun parent</Text>
            <Text style={styles.emptyStateText}>
              Créez votre premier parent pour commencer
            </Text>
          </View>
        ) : (
          <View style={styles.parentsList}>
            {parents.map((parent) => (
              <View key={parent.id} style={styles.parentCard}>
                <View style={styles.parentInfo}>
                  <Text style={styles.parentName}>
                    {parent.first_name} {parent.last_name}
                  </Text>
                  {parent.email && (
                    <Text style={styles.parentDetail}>{parent.email}</Text>
                  )}
                  {parent.phone && (
                    <Text style={styles.parentDetail}>{parent.phone}</Text>
                  )}
                  <View style={styles.codeContainer}>
                    <Text style={styles.codeLabel}>Code:</Text>
                    <Text style={styles.codeValue}>{parent.access_code}</Text>
                    <TouchableOpacity
                      onPress={() => handleCopyCode(parent.access_code)}
                      style={styles.copyButton}
                    >
                      <Copy size={16} color="#4F46E5" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Créer un parent</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Prénom *</Text>
                <TextInput
                  style={styles.input}
                  value={newParent.first_name}
                  onChangeText={(text) => setNewParent({ ...newParent, first_name: text })}
                  placeholder="Prénom"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nom *</Text>
                <TextInput
                  style={styles.input}
                  value={newParent.last_name}
                  onChangeText={(text) => setNewParent({ ...newParent, last_name: text })}
                  placeholder="Nom"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={newParent.email}
                  onChangeText={(text) => setNewParent({ ...newParent, email: text })}
                  placeholder="email@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Téléphone</Text>
                <TextInput
                  style={styles.input}
                  value={newParent.phone}
                  onChangeText={(text) => setNewParent({ ...newParent, phone: text })}
                  placeholder="06 12 34 56 78"
                  keyboardType="phone-pad"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, creating && styles.createButtonDisabled]}
                onPress={handleCreateParent}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.createButtonText}>Créer</Text>
                )}
              </TouchableOpacity>
            </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  addButton: {
    backgroundColor: '#4F46E5',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
    marginTop: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  parentsList: {
    padding: 16,
  },
  parentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  parentInfo: {
    gap: 4,
  },
  parentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  parentDetail: {
    fontSize: 14,
    color: '#6B7280',
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#F3F4F6',
    padding: 8,
    borderRadius: 6,
    gap: 8,
  },
  codeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  codeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4F46E5',
    flex: 1,
  },
  copyButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  createButton: {
    flex: 1,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
