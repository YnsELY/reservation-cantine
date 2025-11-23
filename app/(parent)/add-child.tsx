import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Parent, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Plus, X, CheckCircle } from 'lucide-react-native';

export default function AddChildScreen() {
  const [parent, setParent] = useState<Parent | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [grade, setGrade] = useState('');
  const [allergyFields, setAllergyFields] = useState<string[]>(['']);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [showAddSchoolModal, setShowAddSchoolModal] = useState(false);
  const [schoolIdentifier, setSchoolIdentifier] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addingSchool, setAddingSchool] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent) {
        router.replace('/auth');
        return;
      }
      setParent(currentParent);

      const { data: affiliationsData } = await supabase
        .from('parent_school_affiliations')
        .select('school_id, schools(*)')
        .eq('parent_id', currentParent.id)
        .eq('status', 'active');

      const affiliatedSchools = affiliationsData?.map((aff: any) => aff.schools).filter(Boolean) || [];
      setSchools(affiliatedSchools);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const addAllergyField = () => {
    setAllergyFields([...allergyFields, '']);
  };

  const removeAllergyField = (index: number) => {
    setAllergyFields(allergyFields.filter((_, i) => i !== index));
  };

  const updateAllergyField = (index: number, value: string) => {
    const updated = [...allergyFields];
    updated[index] = value;
    setAllergyFields(updated);
  };

  const handleAddSchool = async () => {
    if (!schoolIdentifier.trim() || !parent) {
      Alert.alert('Erreur', 'Veuillez entrer un code d\'accès');
      return;
    }

    setAddingSchool(true);
    try {
      const accessCodeUpper = schoolIdentifier.trim().toUpperCase();

      const { data: schoolData } = await supabase
        .from('schools')
        .select('*')
        .eq('access_code', accessCodeUpper)
        .maybeSingle();

      if (!schoolData) {
        Alert.alert('Erreur', 'École non trouvée avec ce code d\'accès');
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

      setSchools([...schools, schoolData]);
      setSelectedSchool(schoolData);
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

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Erreur', 'Veuillez renseigner le prénom et le nom');
      return;
    }

    if (!selectedSchool) {
      Alert.alert('Erreur', 'Veuillez sélectionner une école');
      return;
    }

    if (!parent) {
      Alert.alert('Erreur', 'Parent non trouvé');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('children').insert({
        parent_id: parent.id,
        school_id: selectedSchool.id,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        grade: grade.trim() || null,
        allergies: allergyFields.filter(a => a.trim() !== ''),
        dietary_restrictions: [],
      });

      if (error) throw error;

      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
        router.back();
      }, 2000);
    } catch (err) {
      console.error('Error adding child:', err);
      Alert.alert('Erreur', 'Erreur lors de l\'ajout de l\'enfant');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ajouter un enfant</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.label}>Prénom *</Text>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Prénom de l'enfant"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Nom *</Text>
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Nom de l'enfant"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Classe</Text>
          <TextInput
            style={styles.input}
            value={grade}
            onChangeText={setGrade}
            placeholder="Ex: CM2"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Allergies</Text>
          {allergyFields.map((allergy, index) => (
            <View key={index} style={styles.allergyFieldContainer}>
              <TextInput
                style={styles.allergyInput}
                value={allergy}
                onChangeText={(value) => updateAllergyField(index, value)}
                placeholder="Nom de l'allergie"
                placeholderTextColor="#9CA3AF"
              />
              {allergyFields.length > 1 && (
                <TouchableOpacity
                  onPress={() => removeAllergyField(index)}
                  style={styles.removeButton}
                >
                  <X size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity
            style={styles.addAllergyButton}
            onPress={addAllergyField}
          >
            <Plus size={16} color="#111827" />
            <Text style={styles.addAllergyButtonText}>Ajouter une allergie</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>École *</Text>
          {schools.length === 0 ? (
            <View style={styles.noSchoolsContainer}>
              <Text style={styles.noSchoolsText}>
                Veuillez affilier une école pour pouvoir ajouter un enfant
              </Text>
              <TouchableOpacity
                style={styles.addSchoolButtonPrimary}
                onPress={() => setShowAddSchoolModal(true)}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addSchoolButtonPrimaryText}>Affilier une école</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.schoolListContainer}>
                {schools.map((school) => (
                  <TouchableOpacity
                    key={school.id}
                    style={[
                      styles.schoolOption,
                      selectedSchool?.id === school.id && styles.schoolOptionSelected,
                    ]}
                    onPress={() => setSelectedSchool(school)}
                  >
                    <View style={[
                      styles.radioCircle,
                      selectedSchool?.id === school.id && styles.radioCircleSelected,
                    ]}>
                      {selectedSchool?.id === school.id && (
                        <View style={styles.radioDot} />
                      )}
                    </View>
                    <View style={styles.schoolInfo}>
                      <Text style={styles.schoolOptionName}>{school.name}</Text>
                      {school.address && (
                        <Text style={styles.schoolOptionAddress}>{school.address}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.addSchoolButton}
                onPress={() => setShowAddSchoolModal(true)}
              >
                <Plus size={16} color="#111827" />
                <Text style={styles.addSchoolButtonText}>Ajouter une école</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.submitButtonContent}>
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.submitButtonText}>Ajouter l'enfant</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

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
              Entrez le code d'accès de l'école fourni par l'établissement
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

      {showSuccessMessage && (
        <View style={styles.successOverlay}>
          <View style={styles.successMessage}>
            <CheckCircle size={48} color="#10B981" />
            <Text style={styles.successText}>Enfant ajouté avec succès!</Text>
          </View>
        </View>
      )}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    gap: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
  },
  allergyFieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  allergyInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
  },
  removeButton: {
    padding: 8,
  },
  addAllergyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  addAllergyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  addSchoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    marginTop: 12,
  },
  addSchoolButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  schoolListContainer: {
    gap: 12,
  },
  schoolOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  schoolOptionSelected: {
    borderColor: '#111827',
    backgroundColor: '#F9FAFB',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#111827',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#111827',
  },
  schoolInfo: {
    flex: 1,
  },
  schoolOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  schoolOptionAddress: {
    fontSize: 14,
    color: '#6B7280',
  },
  noSchoolsContainer: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noSchoolsText: {
    fontSize: 15,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  addSchoolButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addSchoolButtonPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
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
  },
  modalInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
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
  submitButton: {
    backgroundColor: '#111827',
    borderRadius: 0,
    paddingVertical: 20,
    alignItems: 'center',
    width: '100%',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successMessage: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  successText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
});
