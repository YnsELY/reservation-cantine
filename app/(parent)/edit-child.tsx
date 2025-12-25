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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Save, Calendar } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  class_name: string;
  allergies: string;
  school_id: string;
}

export default function EditChildScreen() {
  const { childId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [className, setClassName] = useState('');
  const [allergies, setAllergies] = useState('');

  useEffect(() => {
    if (childId) {
      loadChildData();
    }
  }, [childId]);

  const loadChildData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .single();

      if (error) throw error;

      setFirstName(data.first_name);
      setLastName(data.last_name);
      setBirthDate(data.birth_date ? new Date(data.birth_date).toISOString().split('T')[0] : '');
      setClassName(data.class_name || '');
      setAllergies(data.allergies || '');
    } catch (error: any) {
      console.error('Error loading child:', error);
      Alert.alert('Erreur', 'Impossible de charger les données de l\'enfant');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Erreur', 'Le prénom et le nom sont obligatoires');
      return;
    }

    if (birthDate && !isValidDate(birthDate)) {
      Alert.alert('Erreur', 'Format de date invalide (AAAA-MM-JJ)');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('children')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          birth_date: birthDate || null,
          class_name: className.trim() || null,
          allergies: allergies.trim() || null,
        })
        .eq('id', childId);

      if (error) throw error;

      Alert.alert('Succès', 'Profil mis à jour avec succès', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error('Error updating child:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le profil');
    } finally {
      setSaving(false);
    }
  };

  const isValidDate = (dateString: string) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Modifier le profil</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Prénom *</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Prénom de l'enfant"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom *</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Nom de l'enfant"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date de naissance</Text>
            <View style={styles.dateInputContainer}>
              <Calendar size={20} color="#6B7280" style={styles.dateIcon} />
              <TextInput
                style={styles.dateInput}
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <Text style={styles.helperText}>Format: AAAA-MM-JJ (ex: 2015-03-15)</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Classe</Text>
            <TextInput
              style={styles.input}
              value={className}
              onChangeText={setClassName}
              placeholder="ex: CP, CE1, CM2..."
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Allergies</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={allergies}
              onChangeText={setAllergies}
              placeholder="Mentionnez toutes les allergies alimentaires"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Save size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Enregistrer</Text>
              </>
            )}
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 14,
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  dateIcon: {
    marginRight: 8,
  },
  dateInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
