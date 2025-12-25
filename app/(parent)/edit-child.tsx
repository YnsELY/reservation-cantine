import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Save, X, CircleCheck as CheckCircle, ChevronDown, Plus } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

const GRADE_OPTIONS = [
  { section: 'Maternelle', grades: ['Petite Section', 'Moyenne Section', 'Grande Section'] },
  { section: 'Élémentaire', grades: ['CP', 'CE1', 'CE2', 'CM1', 'CM2'] },
  { section: 'Collège', grades: ['6ème', '5ème', '4ème', '3ème'] },
  { section: 'Lycée', grades: ['2nde', '1ère', 'Terminale'] },
];

const KNOWN_ALLERGIES = [
  'Arachide',
  'Fruits à coque',
  'Gluten',
  'Lactose',
  'Œufs',
  'Poissons',
  'Crustacés',
  'Mollusques',
  'Soja',
  'Céleri',
  'Moutarde',
  'Sésame',
  'Sulfites',
];

const MONTHS = [
  { value: '1', label: 'Janvier' },
  { value: '2', label: 'Février' },
  { value: '3', label: 'Mars' },
  { value: '4', label: 'Avril' },
  { value: '5', label: 'Mai' },
  { value: '6', label: 'Juin' },
  { value: '7', label: 'Juillet' },
  { value: '8', label: 'Août' },
  { value: '9', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Décembre' },
];

const getDaysInMonth = (month: string, year: string): number => {
  if (!month) return 31;

  const monthNum = parseInt(month);
  const yearNum = parseInt(year);

  if (monthNum === 2) {
    if (year && !isNaN(yearNum)) {
      return (yearNum % 4 === 0 && yearNum % 100 !== 0) || (yearNum % 400 === 0) ? 29 : 28;
    }
    return 29;
  }

  const daysInMonth: { [key: number]: number } = {
    1: 31, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31
  };

  return daysInMonth[monthNum] || 31;
};

const generateYears = (): number[] => {
  const currentYear = new Date().getFullYear();
  const startYear = 2005;
  const years: number[] = [];
  for (let i = currentYear; i >= startYear; i--) {
    years.push(i);
  }
  return years;
};

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  grade: string | null;
  allergies: string[];
  school_id: string;
}

export default function EditChildScreen() {
  const { childId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [grade, setGrade] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [showAllergyModal, setShowAllergyModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [customAllergy, setCustomAllergy] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  useEffect(() => {
    if (childId) {
      loadChildData();
    }
  }, [childId]);

  useEffect(() => {
    if (birthDay && birthMonth) {
      const maxDays = getDaysInMonth(birthMonth, birthYear);
      const currentDay = parseInt(birthDay);
      if (currentDay > maxDays) {
        setBirthDay(maxDays.toString());
      }
    }
  }, [birthMonth, birthYear]);

  const loadChildData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        Alert.alert('Erreur', 'Enfant non trouvé');
        router.back();
        return;
      }

      setFirstName(data.first_name);
      setLastName(data.last_name);
      setGrade(data.grade || '');

      if (data.date_of_birth) {
        const date = new Date(data.date_of_birth);
        setBirthDay(date.getDate().toString());
        setBirthMonth((date.getMonth() + 1).toString());
        setBirthYear(date.getFullYear().toString());
      }

      setAllergies(Array.isArray(data.allergies) ? data.allergies : []);
    } catch (error: any) {
      console.error('Error loading child:', error);
      Alert.alert('Erreur', 'Impossible de charger les données de l\'enfant');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAllergy = (allergy: string) => {
    if (allergies.includes(allergy)) {
      setAllergies(allergies.filter(a => a !== allergy));
    } else {
      if (allergies.length < 2) {
        setAllergies([...allergies, allergy]);
      }
    }
  };

  const handleAddCustomAllergy = () => {
    if (customAllergy.trim() && allergies.length < 2 && !allergies.includes(customAllergy.trim())) {
      setAllergies([...allergies, customAllergy.trim()]);
      setCustomAllergy('');
      setShowAllergyModal(false);
    }
  };

  const removeAllergy = (allergy: string) => {
    setAllergies(allergies.filter(a => a !== allergy));
  };

  const calculateAge = (): number | null => {
    if (!birthDay || !birthMonth || !birthYear) return null;

    const day = parseInt(birthDay);
    const month = parseInt(birthMonth);
    const year = parseInt(birthYear);

    if (isNaN(day) || isNaN(month) || isNaN(year) ||
        day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) {
      return null;
    }

    const today = new Date();
    const birthDate = new Date(year, month - 1, day);

    if (birthDate > today) return null;

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  };

  const getExpectedAgeForGrade = (gradeLevel: string): { min: number; max: number } | null => {
    const ageRanges: { [key: string]: { min: number; max: number } } = {
      'Petite Section': { min: 1, max: 5 },
      'Moyenne Section': { min: 2, max: 6 },
      'Grande Section': { min: 3, max: 7 },
      'CP': { min: 4, max: 8 },
      'CE1': { min: 5, max: 9 },
      'CE2': { min: 6, max: 10 },
      'CM1': { min: 7, max: 11 },
      'CM2': { min: 8, max: 12 },
      '6ème': { min: 9, max: 13 },
      '5ème': { min: 10, max: 14 },
      '4ème': { min: 11, max: 15 },
      '3ème': { min: 12, max: 16 },
      '2nde': { min: 13, max: 17 },
      '1ère': { min: 14, max: 18 },
      'Terminale': { min: 15, max: 19 },
    };

    return ageRanges[gradeLevel] || null;
  };

  const isAgeCompatibleWithGrade = (): boolean => {
    if (!grade || !birthDay || !birthMonth || !birthYear) return true;

    const age = calculateAge();
    if (age === null) return true;

    const expectedAge = getExpectedAgeForGrade(grade);
    if (!expectedAge) return true;

    return age >= expectedAge.min && age <= expectedAge.max;
  };

  const formatDateForDB = (): string | null => {
    if (!birthDay || !birthMonth || !birthYear) return null;

    const day = parseInt(birthDay);
    const month = parseInt(birthMonth);
    const year = parseInt(birthYear);

    if (isNaN(day) || isNaN(month) || isNaN(year) ||
        day < 1 || day > 31 || month < 1 || month > 12 || year < 1900 || year > new Date().getFullYear()) {
      return null;
    }

    const paddedDay = day.toString().padStart(2, '0');
    const paddedMonth = month.toString().padStart(2, '0');

    return `${year}-${paddedMonth}-${paddedDay}`;
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Erreur', 'Veuillez renseigner le prénom et le nom');
      return;
    }

    if (!isAgeCompatibleWithGrade()) {
      Alert.alert('Erreur', 'La date de naissance ne correspond pas à la classe sélectionnée');
      return;
    }

    setSaving(true);
    try {
      const dateOfBirth = formatDateForDB();

      const { error } = await supabase
        .from('children')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          grade: grade.trim() || null,
          date_of_birth: dateOfBirth,
          allergies: allergies,
        })
        .eq('id', childId);

      if (error) throw error;

      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
        router.back();
      }, 2000);
    } catch (err) {
      console.error('Error updating child:', err);
      Alert.alert('Erreur', 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
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
        <Text style={styles.headerTitle}>Modifier le profil</Text>
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
          <Text style={styles.label}>Date de naissance</Text>
          <View style={styles.dateInputRow}>
            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => setShowDayModal(true)}
            >
              <Text style={[styles.dateSelectorText, !birthDay && styles.dateSelectorPlaceholder]}>
                {birthDay || 'Jour'}
              </Text>
              <ChevronDown size={16} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => setShowMonthModal(true)}
            >
              <Text style={[styles.dateSelectorText, !birthMonth && styles.dateSelectorPlaceholder]}>
                {birthMonth ? MONTHS.find(m => m.value === birthMonth)?.label : 'Mois'}
              </Text>
              <ChevronDown size={16} color="#6B7280" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dateSelector}
              onPress={() => setShowYearModal(true)}
            >
              <Text style={[styles.dateSelectorText, !birthYear && styles.dateSelectorPlaceholder]}>
                {birthYear || 'Année'}
              </Text>
              <ChevronDown size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>
          {calculateAge() !== null && (
            <View style={styles.ageDisplay}>
              <Text style={styles.ageText}>Âge: {calculateAge()} ans</Text>
            </View>
          )}
          {!isAgeCompatibleWithGrade() && (
            <View style={styles.errorDisplay}>
              <Text style={styles.errorText}>Veuillez vérifier les informations</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Classe</Text>
          <TouchableOpacity
            style={styles.gradeSelector}
            onPress={() => setShowGradeModal(true)}
          >
            <Text style={[styles.gradeSelectorText, !grade && styles.gradeSelectorPlaceholder]}>
              {grade || 'Sélectionner une classe'}
            </Text>
            <ChevronDown size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Allergies (Maximum 2)</Text>
          {allergies.length > 0 && (
            <View style={styles.selectedAllergiesContainer}>
              {allergies.map((allergy, index) => (
                <View key={index} style={styles.allergyTag}>
                  <Text style={styles.allergyTagText}>{allergy}</Text>
                  <TouchableOpacity onPress={() => removeAllergy(allergy)}>
                    <X size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {allergies.length < 2 && (
            <TouchableOpacity
              style={styles.addAllergyButton}
              onPress={() => setShowAllergyModal(true)}
            >
              <Plus size={16} color="#111827" />
              <Text style={styles.addAllergyButtonText}>
                {allergies.length === 0 ? 'Ajouter une allergie' : 'Ajouter une autre allergie'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.saveButtonContent}>
              <Save size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showGradeModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowGradeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.gradeModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner une classe</Text>
              <TouchableOpacity onPress={() => setShowGradeModal(false)}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.gradeList} showsVerticalScrollIndicator={false}>
              {GRADE_OPTIONS.map((section, sectionIndex) => (
                <View key={sectionIndex} style={styles.gradeSection}>
                  <Text style={styles.gradeSectionTitle}>{section.section}</Text>
                  {section.grades.map((gradeOption, gradeIndex) => (
                    <TouchableOpacity
                      key={gradeIndex}
                      style={[
                        styles.gradeOption,
                        grade === gradeOption && styles.gradeOptionSelected,
                      ]}
                      onPress={() => {
                        setGrade(gradeOption);
                        setShowGradeModal(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.gradeOptionText,
                          grade === gradeOption && styles.gradeOptionTextSelected,
                        ]}
                      >
                        {gradeOption}
                      </Text>
                      {grade === gradeOption && (
                        <CheckCircle size={20} color="#111827" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAllergyModal}
        transparent
        animationType="none"
        onRequestClose={() => {
          setShowAllergyModal(false);
          setCustomAllergy('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.allergyModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner une allergie</Text>
              <TouchableOpacity onPress={() => {
                setShowAllergyModal(false);
                setCustomAllergy('');
              }}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.allergyList} showsVerticalScrollIndicator={false}>
              <Text style={styles.allergyListSubtitle}>Allergies courantes</Text>
              {KNOWN_ALLERGIES.map((allergy, index) => {
                const isSelected = allergies.includes(allergy);
                const isDisabled = !isSelected && allergies.length >= 2;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.allergyOption,
                      isSelected && styles.allergyOptionSelected,
                      isDisabled && styles.allergyOptionDisabled,
                    ]}
                    onPress={() => !isDisabled && handleSelectAllergy(allergy)}
                    disabled={isDisabled}
                  >
                    <Text
                      style={[
                        styles.allergyOptionText,
                        isSelected && styles.allergyOptionTextSelected,
                        isDisabled && styles.allergyOptionTextDisabled,
                      ]}
                    >
                      {allergy}
                    </Text>
                    {isSelected && (
                      <CheckCircle size={20} color="#111827" />
                    )}
                  </TouchableOpacity>
                );
              })}

              {allergies.filter(a => !KNOWN_ALLERGIES.includes(a)).length > 0 && (
                <View style={styles.customAllergySection}>
                  <Text style={styles.allergyListSubtitle}>Autres allergies</Text>
                  {allergies.filter(a => !KNOWN_ALLERGIES.includes(a)).map((allergy, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[styles.allergyOption, styles.allergyOptionSelected]}
                      onPress={() => handleSelectAllergy(allergy)}
                    >
                      <Text style={[styles.allergyOptionText, styles.allergyOptionTextSelected]}>
                        {allergy}
                      </Text>
                      <CheckCircle size={20} color="#111827" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.customAllergySection}>
                <Text style={styles.allergyListSubtitle}>Ajouter une allergie personnalisée</Text>
                <View style={styles.customAllergyInputContainer}>
                  <TextInput
                    style={styles.customAllergyInput}
                    value={customAllergy}
                    onChangeText={setCustomAllergy}
                    placeholder="Entrer une allergie personnalisée"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TouchableOpacity
                    style={[
                      styles.customAllergyAddButton,
                      (!customAllergy.trim() || allergies.length >= 2) && styles.customAllergyAddButtonDisabled
                    ]}
                    onPress={handleAddCustomAllergy}
                    disabled={!customAllergy.trim() || allergies.length >= 2}
                  >
                    <Plus size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowAllergyModal(false);
                setCustomAllergy('');
              }}
            >
              <Text style={styles.modalCloseButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDayModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowDayModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dateModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner un jour</Text>
              <TouchableOpacity onPress={() => setShowDayModal(false)}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.dateList} showsVerticalScrollIndicator={false}>
              {Array.from({ length: getDaysInMonth(birthMonth, birthYear) }, (_, i) => (i + 1).toString()).map((day) => (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dateOption,
                    birthDay === day && styles.dateOptionSelected,
                  ]}
                  onPress={() => {
                    setBirthDay(day);
                    setShowDayModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dateOptionText,
                      birthDay === day && styles.dateOptionTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                  {birthDay === day && (
                    <CheckCircle size={20} color="#111827" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showMonthModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowMonthModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dateModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner un mois</Text>
              <TouchableOpacity onPress={() => setShowMonthModal(false)}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.dateList} showsVerticalScrollIndicator={false}>
              {MONTHS.map((month) => (
                <TouchableOpacity
                  key={month.value}
                  style={[
                    styles.dateOption,
                    birthMonth === month.value && styles.dateOptionSelected,
                  ]}
                  onPress={() => {
                    setBirthMonth(month.value);
                    setShowMonthModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dateOptionText,
                      birthMonth === month.value && styles.dateOptionTextSelected,
                    ]}
                  >
                    {month.label}
                  </Text>
                  {birthMonth === month.value && (
                    <CheckCircle size={20} color="#111827" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showYearModal}
        transparent
        animationType="none"
        onRequestClose={() => setShowYearModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dateModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner une année</Text>
              <TouchableOpacity onPress={() => setShowYearModal(false)}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.dateList} showsVerticalScrollIndicator={false}>
              {generateYears().map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.dateOption,
                    birthYear === year.toString() && styles.dateOptionSelected,
                  ]}
                  onPress={() => {
                    setBirthYear(year.toString());
                    setShowYearModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dateOptionText,
                      birthYear === year.toString() && styles.dateOptionTextSelected,
                    ]}
                  >
                    {year}
                  </Text>
                  {birthYear === year.toString() && (
                    <CheckCircle size={20} color="#111827" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {showSuccessMessage && (
        <View style={styles.successOverlay}>
          <View style={styles.successMessage}>
            <CheckCircle size={48} color="#10B981" />
            <Text style={styles.successText}>Profil mis à jour avec succès!</Text>
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
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateSelector: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateSelectorText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  dateSelectorPlaceholder: {
    color: '#9CA3AF',
    fontWeight: '400',
  },
  ageDisplay: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    alignItems: 'center',
  },
  ageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  errorDisplay: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  gradeSelector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gradeSelectorText: {
    fontSize: 16,
    color: '#111827',
  },
  gradeSelectorPlaceholder: {
    color: '#9CA3AF',
  },
  selectedAllergiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  allergyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  allergyTagText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
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
  },
  addAllergyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  allergyModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  allergyList: {
    marginTop: 16,
  },
  allergyListSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 12,
    marginTop: 8,
  },
  allergyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  allergyOptionSelected: {
    backgroundColor: '#E5E7EB',
    borderColor: '#111827',
  },
  allergyOptionDisabled: {
    opacity: 0.4,
  },
  allergyOptionText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  allergyOptionTextSelected: {
    color: '#111827',
    fontWeight: '600',
  },
  allergyOptionTextDisabled: {
    color: '#9CA3AF',
  },
  customAllergySection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  customAllergyInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  customAllergyInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111827',
  },
  customAllergyAddButton: {
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customAllergyAddButtonDisabled: {
    opacity: 0.4,
  },
  modalCloseButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  gradeList: {
    marginTop: 16,
  },
  gradeSection: {
    marginBottom: 20,
  },
  gradeSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#E5E7EB',
  },
  gradeOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  gradeOptionSelected: {
    backgroundColor: '#E5E7EB',
    borderColor: '#111827',
  },
  gradeOptionText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  gradeOptionTextSelected: {
    color: '#111827',
    fontWeight: '600',
  },
  dateModalContent: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    maxHeight: '60%',
  },
  dateList: {
    marginTop: 16,
  },
  dateOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dateOptionSelected: {
    backgroundColor: '#E5E7EB',
    borderColor: '#111827',
  },
  dateOptionText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  dateOptionTextSelected: {
    color: '#111827',
    fontWeight: '600',
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
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  saveButton: {
    backgroundColor: '#111827',
    borderRadius: 0,
    paddingVertical: 20,
    alignItems: 'center',
    width: '100%',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButtonText: {
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
