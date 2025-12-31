import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase, Parent, Child, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { User, LogOut, Users, Plus, ArrowLeft, X, School as SchoolIcon, Trash2 } from 'lucide-react-native';

export default function ProfileScreen() {
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSchoolModal, setShowAddSchoolModal] = useState(false);
  const [schoolIdentifier, setSchoolIdentifier] = useState('');
  const [addingSchool, setAddingSchool] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const calculateAge = (dateOfBirth: string | null): number | null => {
    if (!dateOfBirth) return null;

    const birthDate = new Date(dateOfBirth);
    const today = new Date();

    if (birthDate > today) return null;

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/auth');
        return;
      }

      const { data: parentData } = await supabase
        .from('parents')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!parentData) {
        router.replace('/auth');
        return;
      }

      setParent(parentData);

      const { data: childrenData } = await supabase
        .from('children')
        .select('*')
        .eq('parent_id', parentData.id)
        .order('first_name');

      setChildren(childrenData || []);

      const { data: affiliationsData } = await supabase
        .from('parent_school_affiliations')
        .select('school_id, schools(*)')
        .eq('parent_id', parentData.id)
        .eq('status', 'active');

      const affiliatedSchools = affiliationsData?.map((aff: any) => aff.schools).filter(Boolean) || [];
      setSchools(affiliatedSchools);
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      setLoading(false);
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

      if (!parent) {
        Alert.alert('Erreur', 'Compte parent non trouvé');
        return;
      }

      const { data: existingAffiliation } = await supabase
        .from('parent_school_affiliations')
        .select('id')
        .eq('parent_id', parent.id)
        .eq('school_id', schoolData.id)
        .maybeSingle();

      if (existingAffiliation) {
        Alert.alert('Information', 'Vous êtes déjà affilié à cette école');
        setSchoolIdentifier('');
        setShowAddSchoolModal(false);
        return;
      }

      const { error: affiliationError } = await supabase
        .from('parent_school_affiliations')
        .insert({
          parent_id: parent.id,
          school_id: schoolData.id,
          status: 'active',
        });

      if (affiliationError) throw affiliationError;

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

  const handleDeleteChild = async (childId: string) => {
    Alert.alert(
      'Confirmer la suppression',
      'Êtes-vous sûr de vouloir supprimer cet enfant ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('children')
                .delete()
                .eq('id', childId);

              if (error) throw error;

              await loadData();
              Alert.alert('Succès', 'Enfant supprimé avec succès');
            } catch (err) {
              console.error('Error deleting child:', err);
              Alert.alert('Erreur', 'Erreur lors de la suppression de l\'enfant');
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      if (router.canGoBack()) {
        router.dismissAll();
      }
      router.replace('/auth');
    } catch (error) {
      console.error('Logout error:', error);
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
          <User size={32} color="#4F46E5" />
        </View>
        <Text style={styles.profileName}>
          {parent?.first_name} {parent?.last_name}
        </Text>
        {parent?.email && (
          <Text style={styles.profileEmail}>{parent.email}</Text>
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 120, paddingTop: 16 }} showsVerticalScrollIndicator={false}>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Informations</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{parent?.email || 'Non renseigné'}</Text>
            </View>
            {parent?.phone && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Téléphone</Text>
                <Text style={styles.infoValue}>{parent.phone}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <Users size={20} color="#111827" />
              <Text style={styles.sectionTitle}>Mes enfants</Text>
            </View>
            <TouchableOpacity
              style={styles.addChildButton}
              onPress={() => router.push('/(parent)/add-child')}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.addChildButtonText}>Ajouter un enfant</Text>
            </TouchableOpacity>
          </View>
          {children.length === 0 ? (
            <View style={styles.emptyChildren}>
              <Text style={styles.emptyChildrenText}>Aucun enfant enregistré</Text>
            </View>
          ) : (
            children.map((child) => (
              <View key={child.id} style={styles.childCard}>
                <View style={styles.childCardHeader}>
                  <View style={styles.childCardInfo}>
                    <Text style={styles.childName}>
                      {child.first_name} {child.last_name}
                    </Text>
                    {child.grade && (
                      <Text style={styles.childDetail}>Classe: {child.grade}</Text>
                    )}
                    {calculateAge(child.date_of_birth) !== null && (
                      <Text style={styles.childDetail}>Âge: {calculateAge(child.date_of_birth)} ans</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.deleteChildButton}
                    onPress={() => handleDeleteChild(child.id)}
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
                {child.allergies.length > 0 && (
                  <View style={styles.allergyContainer}>
                    <Text style={styles.allergyLabel}>Allergies:</Text>
                    <Text style={styles.allergyText}>{child.allergies.join(', ')}</Text>
                  </View>
                )}
                {child.dietary_restrictions.length > 0 && (
                  <View style={styles.dietContainer}>
                    <Text style={styles.dietLabel}>Régime:</Text>
                    <Text style={styles.dietText}>{child.dietary_restrictions.join(', ')}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderLeft}>
              <SchoolIcon size={20} color="#111827" />
              <Text style={styles.sectionTitle}>Écoles affiliées</Text>
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
              <Text style={styles.emptySchoolsText}>Aucune école affiliée</Text>
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

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
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
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addChildButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  addChildButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
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
  childCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  childCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  childCardInfo: {
    flex: 1,
  },
  deleteChildButton: {
    padding: 8,
    marginTop: -8,
    marginRight: -8,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  childDetail: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  allergyContainer: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  allergyLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 2,
  },
  allergyText: {
    fontSize: 12,
    color: '#92400E',
  },
  dietContainer: {
    backgroundColor: '#DBEAFE',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  dietLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 2,
  },
  dietText: {
    fontSize: 12,
    color: '#1E40AF',
  },
  emptyChildren: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyChildrenText: {
    fontSize: 14,
    color: '#6B7280',
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
});
