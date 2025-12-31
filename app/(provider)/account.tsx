import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase, Provider, School } from '@/lib/supabase';
import { ArrowLeft, Building2, Mail, Phone, MapPin, Users, Key, LogOut, Plus, X, School as SchoolIcon } from 'lucide-react-native';

export default function AccountScreen() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [schoolCount, setSchoolCount] = useState(0);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSchoolModal, setShowAddSchoolModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [schoolIdentifier, setSchoolIdentifier] = useState('');
  const [addingSchool, setAddingSchool] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/auth');
        return;
      }

      setUserEmail(session.user.email || '');

      const { data: providerData } = await supabase
        .from('providers')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!providerData) {
        router.replace('/auth');
        return;
      }

      setProvider(providerData);
      setEditPhone(providerData.contact_phone || '');
      setEditAddress(providerData.address || '');

      const { data: accessData } = await supabase
        .from('provider_school_access')
        .select('school_id, schools(*)')
        .eq('provider_id', providerData.id);

      const affiliatedSchools = accessData?.map((acc: any) => acc.schools).filter(Boolean) || [];
      setSchools(affiliatedSchools);
      setSchoolCount(affiliatedSchools.length);
    } catch (err) {
      console.error('Error loading provider:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!provider) return;

    setSavingInfo(true);
    try {
      const { error } = await supabase
        .from('providers')
        .update({
          contact_phone: editPhone.trim() || null,
          address: editAddress.trim() || null,
        })
        .eq('id', provider.id);

      if (error) throw error;

      await loadData();
      setShowEditModal(false);
      Alert.alert('Succès', 'Informations mises à jour');
    } catch (err) {
      console.error('Error saving info:', err);
      Alert.alert('Erreur', 'Erreur lors de la mise à jour');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleAddSchool = async () => {
    if (!schoolIdentifier.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un identifiant d\'école');
      return;
    }

    setAddingSchool(true);
    try {
      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('access_code', schoolIdentifier.trim().toUpperCase())
        .maybeSingle();

      if (!schoolData) {
        Alert.alert('Erreur', 'École non trouvée avec cet identifiant');
        return;
      }

      if (!provider) {
        Alert.alert('Erreur', 'Compte prestataire non trouvé');
        return;
      }

      const { data: existingAccess } = await supabase
        .from('provider_school_access')
        .select('id')
        .eq('provider_id', provider.id)
        .eq('school_id', schoolData.id)
        .maybeSingle();

      if (existingAccess) {
        Alert.alert('Information', 'Vous avez déjà accès à cette école');
        setSchoolIdentifier('');
        setShowAddSchoolModal(false);
        return;
      }

      const { error: accessError } = await supabase
        .from('provider_school_access')
        .insert({
          provider_id: provider.id,
          school_id: schoolData.id,
        });

      if (accessError) throw accessError;

      await loadData();
      setSchoolIdentifier('');
      setShowAddSchoolModal(false);
      Alert.alert('Succès', `École "${schoolData.name}" ajoutée avec succès`);
    } catch (err) {
      console.error('Error adding school:', err);
      Alert.alert('Erreur', 'Erreur lors de l\'ajout de l\'école');
    } finally {
      setAddingSchool(false);
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.avatarContainer}>
          <Building2 size={32} color="#4F46E5" />
        </View>
        <Text style={styles.profileName}>{provider?.company_name}</Text>
        <Text style={styles.profileEmail}>Prestataire</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 120, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Informations</Text>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setShowEditModal(true)}
            >
              <Text style={styles.editButtonText}>Modifier</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{userEmail || 'Non renseigné'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Téléphone</Text>
              <Text style={styles.infoValue}>{provider?.contact_phone || 'Non renseigné'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Adresse</Text>
              <Text style={styles.infoValue}>{provider?.address || 'Non renseignée'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <SchoolIcon size={20} color="#111827" />
              <Text style={styles.sectionTitle}>Écoles partenaires</Text>
            </View>
            <TouchableOpacity
              style={styles.addSchoolButton}
              onPress={() => setShowAddSchoolModal(true)}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.addSchoolButtonText}>Ajouter une école</Text>
            </TouchableOpacity>
          </View>
          {schools.length === 0 ? (
            <View style={styles.emptySchools}>
              <Text style={styles.emptySchoolsText}>Aucune école partenaire</Text>
            </View>
          ) : (
            schools.map((school) => (
              <View key={school.id} style={styles.schoolCard}>
                <Text style={styles.schoolName}>{school.name}</Text>
                {school.address && (
                  <Text style={styles.schoolDetail}>{school.address}</Text>
                )}
                {school.contact_email && (
                  <Text style={styles.schoolDetail}>{school.contact_email}</Text>
                )}
                {school.contact_phone && (
                  <Text style={styles.schoolDetail}>{school.contact_phone}</Text>
                )}
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Documents légaux</Text>
          </View>
          <TouchableOpacity style={styles.legalButton} onPress={() => router.push('/legal/cgv')}>
            <Text style={styles.legalButtonText}>Conditions générales de vente</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.legalButton} onPress={() => router.push('/legal/privacy')}>
            <Text style={styles.legalButtonText}>Politique de confidentialité</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showAddSchoolModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddSchoolModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addSchoolModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter une école</Text>
              <TouchableOpacity onPress={() => setShowAddSchoolModal(false)}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDescription}>
              Entrez le code d'accès de l'école fourni par l'administration (ex: SCH-DEMO1)
            </Text>
            <TextInput
              style={styles.modalInput}
              value={schoolIdentifier}
              onChangeText={setSchoolIdentifier}
              placeholder="Code d'accès de l'école"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.modalButton, addingSchool && styles.modalButtonDisabled]}
              onPress={handleAddSchool}
              disabled={addingSchool}
            >
              {addingSchool ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalButtonText}>Ajouter</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addSchoolModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modifier les informations</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>Téléphone</Text>
            <TextInput
              style={styles.modalInput}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="Numéro de téléphone"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />
            <Text style={styles.modalLabel}>Adresse</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              value={editAddress}
              onChangeText={setEditAddress}
              placeholder="Adresse complète"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity
              style={[styles.modalButton, savingInfo && styles.modalButtonDisabled]}
              onPress={handleSaveInfo}
              disabled={savingInfo}
            >
              {savingInfo ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalButtonText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace('/auth');
          }}
        >
          <View style={styles.logoutButtonContent}>
            <LogOut size={20} color="#FFFFFF" />
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </View>
        </TouchableOpacity>
      </View>
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
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    position: 'absolute',
    top: 24,
    left: 16,
    padding: 8,
    zIndex: 10,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#6B7280',
  },
  statsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statContent: {
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  editButton: {
    backgroundColor: '#111827',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  logoutButton: {
    backgroundColor: '#EF4444',
    borderRadius: 0,
    paddingVertical: 20,
    alignItems: 'center',
    width: '100%',
  },
  logoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addSchoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  addSchoolButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  schoolCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  schoolName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  schoolDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  legalButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  legalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  emptySchools: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptySchoolsText: {
    fontSize: 14,
    color: '#6B7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addSchoolModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#F9FAFB',
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    marginTop: 8,
  },
  modalTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
