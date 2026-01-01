import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Provider } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Check, Package } from 'lucide-react-native';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

export default function AddSupplementScreen() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectAllSchools, setSelectAllSchools] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

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

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom pour le supplément');
      return;
    }

    if (!price.trim() || isNaN(Number(price)) || Number(price) < 0) {
      Alert.alert('Erreur', 'Veuillez entrer un prix valide');
      return;
    }

    if (selectedSchools.length === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner au moins une école');
      return;
    }

    setSaving(true);

    try {
      const supplementsToInsert = selectedSchools.map(schoolId => ({
        provider_id: provider!.id,
        school_id: schoolId,
        name: name.trim(),
        description: description.trim() || null,
        price: Number(price),
        available: true,
      }));

      const { error } = await supabase
        .from('provider_supplements')
        .insert(supplementsToInsert);

      if (error) throw error;

      Alert.alert(
        'Succès',
        'Supplément ajouté avec succès',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err: any) {
      console.error('Error saving supplement:', err);
      Alert.alert('Erreur', err.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ajouter un supplément</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.label}>Nom du supplément *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Dessert, Boisson, Fromage..."
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={setName}
            editable={!saving}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Description du supplément (optionnel)"
            placeholderTextColor="#9CA3AF"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            editable={!saving}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Prix (DH) *</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor="#9CA3AF"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            editable={!saving}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>Écoles *</Text>
            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={toggleAllSchools}
              disabled={saving}
            >
              <Text style={styles.selectAllText}>
                {selectAllSchools ? 'Tout désélectionner' : 'Tout sélectionner'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.schoolsList}>
            {schools.map(school => (
              <TouchableOpacity
                key={school.school_id}
                style={[
                  styles.schoolItem,
                  selectedSchools.includes(school.school_id) && styles.schoolItemSelected
                ]}
                onPress={() => toggleSchool(school.school_id)}
                disabled={saving}
              >
                <View style={[
                  styles.checkbox,
                  selectedSchools.includes(school.school_id) && styles.checkboxChecked
                ]}>
                  {selectedSchools.includes(school.school_id) && (
                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  )}
                </View>
                <Text style={[
                  styles.schoolItemText,
                  selectedSchools.includes(school.school_id) && styles.schoolItemTextSelected
                ]}>
                  {school.school_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.infoBox}>
          <Package size={20} color="#6B7280" />
          <Text style={styles.infoText}>
            Le supplément sera disponible pour toutes les écoles sélectionnées
          </Text>
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
            <>
              <Check size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Enregistrer</Text>
            </>
          )}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  selectAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4F46E5',
  },
  schoolsList: {
    gap: 8,
  },
  schoolItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  schoolItemSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  schoolItemText: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  schoolItemTextSelected: {
    fontWeight: '600',
    color: '#4F46E5',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
