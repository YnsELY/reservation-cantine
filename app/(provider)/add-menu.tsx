import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, Provider } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Check, Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react-native';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

export default function AddMenuScreen() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectAllSchools, setSelectAllSchools] = useState(false);
  const [mealName, setMealName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>('#FFE4E1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const pastelColors = [
    { id: 1, color: '#FFE4E1', name: 'Rose' },
    { id: 2, color: '#E0F4FF', name: 'Bleu' },
    { id: 3, color: '#E8F5E9', name: 'Vert' },
    { id: 4, color: '#FFF9E6', name: 'Jaune' },
  ];
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentProvider = await authService.getCurrentProviderFromAuth();
      if (!currentProvider) {
        router.replace('/auth');
        return;
      }

      setProvider(currentProvider);

      const { data: schoolAccess } = await supabase
        .from('provider_school_access')
        .select('school_id, schools(name)')
        .eq('provider_id', currentProvider.id);

      const schoolsList = (schoolAccess || []).map(sa => ({
        school_id: (sa as any).school_id,
        school_name: (sa as any).schools?.name || 'École',
      }));

      setSchools(schoolsList);

      if (schoolsList.length > 0) {
        setSelectedSchools([schoolsList[0].school_id]);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSchool = (schoolId: string) => {
    setSelectedSchools(prev => {
      if (prev.includes(schoolId)) {
        const newSelection = prev.filter(id => id !== schoolId);
        if (newSelection.length === 0) {
          setSelectAllSchools(false);
        }
        return newSelection;
      } else {
        const newSelection = [...prev, schoolId];
        if (newSelection.length === schools.length) {
          setSelectAllSchools(true);
        }
        return newSelection;
      }
    });
  };

  const toggleAllSchools = () => {
    if (selectAllSchools) {
      setSelectedSchools([]);
      setSelectAllSchools(false);
    } else {
      setSelectedSchools(schools.map(s => s.school_id));
      setSelectAllSchools(true);
    }
  };

  const getMinDate = () => {
    return new Date();
  };

  const getMaxDate = () => {
    const today = new Date();
    const maxDate = new Date(today);
    maxDate.setMonth(maxDate.getMonth() + 1);
    return maxDate;
  };

  const generateCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const goToPreviousMonth = () => {
    const newMonth = new Date(calendarMonth);
    newMonth.setMonth(newMonth.getMonth() - 1);
    setCalendarMonth(newMonth);
  };

  const goToNextMonth = () => {
    const newMonth = new Date(calendarMonth);
    newMonth.setMonth(newMonth.getMonth() + 1);
    setCalendarMonth(newMonth);
  };

  const canGoPrevious = () => {
    const currentMonth = calendarMonth.getMonth();
    const currentYear = calendarMonth.getFullYear();
    const todayMonth = new Date().getMonth();
    const todayYear = new Date().getFullYear();

    if (currentYear > todayYear) return true;
    if (currentYear === todayYear && currentMonth > todayMonth) return true;
    return false;
  };

  const canGoNext = () => {
    const currentMonth = calendarMonth.getMonth();
    const currentYear = calendarMonth.getFullYear();
    const maxDate = getMaxDate();
    const maxMonth = maxDate.getMonth();
    const maxYear = maxDate.getFullYear();

    if (currentYear < maxYear) return true;
    if (currentYear === maxYear && currentMonth < maxMonth) return true;
    return false;
  };

  const isDateDisabled = (date: Date) => {
    const minDate = getMinDate();
    const maxDate = getMaxDate();
    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < minDate || checkDate > maxDate;
  };

  const isDateSelected = (date: Date) => {
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return selected.getTime() === checkDate.getTime();
  };

  const handleSave = async () => {
    if (!mealName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom de repas');
      return;
    }

    if (!price || isNaN(parseFloat(price))) {
      Alert.alert('Erreur', 'Veuillez entrer un prix valide');
      return;
    }

    if (selectedSchools.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins une école');
      return;
    }

    setSaving(true);
    try {
      const formatDateForDB = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const menuData = selectedSchools.map(schoolId => ({
        school_id: schoolId,
        meal_name: mealName.trim(),
        description: description.trim() || null,
        price: parseFloat(price),
        date: formatDateForDB(selectedDate),
        card_color: selectedColor,
        provider_id: provider?.id || null,
      }));

      const { error } = await supabase.from('menus').insert(menuData);

      if (error) throw error;

      Alert.alert('Succès', `Menu créé avec succès pour ${selectedSchools.length} école(s)`, [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (err) {
      console.error('Error saving menu:', err);
      Alert.alert('Erreur', 'Erreur lors de la création du menu');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.pageTitle}>Nouveau menu</Text>

        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Écoles *</Text>
            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={toggleAllSchools}
            >
              <View style={[
                styles.checkbox,
                selectAllSchools && styles.checkboxActive
              ]}>
                {selectAllSchools && <Check size={16} color="#FFFFFF" />}
              </View>
              <Text style={styles.selectAllText}>Toutes les écoles</Text>
            </TouchableOpacity>
            <View style={styles.schoolsList}>
              {schools.map(school => (
                <TouchableOpacity
                  key={school.school_id}
                  style={styles.schoolItem}
                  onPress={() => toggleSchool(school.school_id)}
                >
                  <View style={[
                    styles.checkbox,
                    selectedSchools.includes(school.school_id) && styles.checkboxActive
                  ]}>
                    {selectedSchools.includes(school.school_id) && (
                      <Check size={16} color="#FFFFFF" />
                    )}
                  </View>
                  <Text style={styles.schoolItemText}>{school.school_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Nom du repas *</Text>
            <TextInput
              style={styles.input}
              value={mealName}
              onChangeText={setMealName}
              placeholder="Ex: Menu du jour"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Décrivez le contenu du menu..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Prix (€) *</Text>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Couleur *</Text>
            <View style={styles.colorPickerContainer}>
              {pastelColors.map((colorOption) => (
                <TouchableOpacity
                  key={colorOption.id}
                  style={[
                    styles.colorOption,
                    { backgroundColor: colorOption.color },
                    selectedColor === colorOption.color && styles.colorOptionSelected,
                  ]}
                  onPress={() => setSelectedColor(colorOption.color)}
                >
                  {selectedColor === colorOption.color && (
                    <Check size={24} color="#111827" strokeWidth={3} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>Choisissez une couleur pour identifier facilement ce menu</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Date *</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowCalendar(true)}
            >
              <Calendar size={20} color="#111827" />
              <Text style={styles.dateButtonText}>
                {selectedDate.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>Sélectionnez une date (du {new Date().toLocaleDateString('fr-FR')} au {getMaxDate().toLocaleDateString('fr-FR')})</Text>
          </View>
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
            <Text style={styles.saveButtonText}>Créer le menu</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={showCalendar}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner une date</Text>
              <TouchableOpacity onPress={() => setShowCalendar(false)} style={styles.closeButton}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendar}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  onPress={goToPreviousMonth}
                  disabled={!canGoPrevious()}
                  style={[styles.monthNavButton, !canGoPrevious() && styles.monthNavButtonDisabled]}
                >
                  <ChevronLeft size={24} color={canGoPrevious() ? "#111827" : "#D1D5DB"} />
                </TouchableOpacity>
                <Text style={styles.calendarMonth}>
                  {calendarMonth.toLocaleDateString('fr-FR', {
                    month: 'long',
                    year: 'numeric'
                  })}
                </Text>
                <TouchableOpacity
                  onPress={goToNextMonth}
                  disabled={!canGoNext()}
                  style={[styles.monthNavButton, !canGoNext() && styles.monthNavButtonDisabled]}
                >
                  <ChevronRight size={24} color={canGoNext() ? "#111827" : "#D1D5DB"} />
                </TouchableOpacity>
              </View>
              <View style={styles.calendarWeekdays}>
                {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((day, i) => (
                  <Text key={i} style={styles.weekdayText}>{day}</Text>
                ))}
              </View>
              <View style={styles.calendarDays}>
                {generateCalendarDays().map((date, index) => {
                  if (!date) {
                    return <View key={`empty-${index}`} style={styles.calendarDay} />;
                  }
                  const disabled = isDateDisabled(date);
                  const selected = isDateSelected(date);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.calendarDay,
                        selected && styles.calendarDaySelected,
                        disabled && styles.calendarDayDisabled,
                      ]}
                      onPress={() => {
                        if (!disabled) {
                          setSelectedDate(date);
                          setShowCalendar(false);
                        }
                      }}
                      disabled={disabled}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          selected && styles.calendarDayTextSelected,
                          disabled && styles.calendarDayTextDisabled,
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
  },
  topBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    padding: 4,
    alignSelf: 'flex-start',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  form: {
    gap: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  colorPickerContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  colorOption: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderColor: '#111827',
    borderWidth: 3,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  selectAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  schoolsList: {
    gap: 8,
  },
  schoolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  schoolItemText: {
    fontSize: 15,
    color: '#111827',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#111827',
    flex: 1,
    textTransform: 'capitalize',
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
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
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
  calendar: {
    padding: 20,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  monthNavButton: {
    padding: 8,
    borderRadius: 8,
  },
  monthNavButtonDisabled: {
    opacity: 0.3,
  },
  calendarMonth: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'capitalize',
    textAlign: 'center',
    flex: 1,
  },
  calendarWeekdays: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  calendarDays: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
    marginVertical: 2,
  },
  calendarDaySelected: {
    backgroundColor: '#111827',
    borderRadius: 12,
  },
  calendarDayDisabled: {
    opacity: 0.25,
  },
  calendarDayText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calendarDayTextDisabled: {
    color: '#D1D5DB',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    padding: 16,
  },
  saveButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
