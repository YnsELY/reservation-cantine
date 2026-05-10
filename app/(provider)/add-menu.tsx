import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, ImageIcon, Plus, Trash2, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { authService } from '@/lib/auth';
import { Provider, supabase } from '@/lib/supabase';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

interface MenuSpecificSupplement {
  tempId: string;
  name: string;
  description: string;
  price: string;
}

export default function AddMenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [mealName, setMealName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [selectedColor, setSelectedColor] = useState('#FFE4E1');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [menuSpecificSupplements, setMenuSpecificSupplements] = useState<MenuSpecificSupplement[]>([]);
  const [newSupplementName, setNewSupplementName] = useState('');
  const [newSupplementDescription, setNewSupplementDescription] = useState('');
  const [newSupplementPrice, setNewSupplementPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isEditMode = !!params.editMenuId;
  const libraryMenuId = params.editMenuId as string | undefined;

  const pastelColors = [
    { id: 1, color: '#FFE4E1' },
    { id: 2, color: '#E0F4FF' },
    { id: 3, color: '#E8F5E9' },
    { id: 4, color: '#FFF9E6' },
  ];

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

      if (isEditMode && libraryMenuId) {
        setMealName(params.editMealName as string || '');
        setDescription(params.editDescription as string || '');
        setPrice(params.editPrice as string || '');
        setSelectedColor(params.editColor as string || '#FFE4E1');
        if (params.editImageUrl) {
          setExistingImageUrl(params.editImageUrl as string);
        }

        const { data: specificSupplements } = await supabase
          .from('provider_supplements')
          .select('name, description, price')
          .eq('provider_id', currentProvider.id)
          .eq('library_menu_id', libraryMenuId)
          .is('menu_id', null)
          .order('name');

        const uniqueSupplements = new Map<string, MenuSpecificSupplement>();
        (specificSupplements || []).forEach(supplement => {
          const key = `${supplement.name}-${supplement.price}-${supplement.description || ''}`;
          if (!uniqueSupplements.has(key)) {
            uniqueSupplements.set(key, {
              tempId: key,
              name: supplement.name,
              description: supplement.description || '',
              price: String(supplement.price),
            });
          }
        });

        setMenuSpecificSupplements(Array.from(uniqueSupplements.values()));
      }
    } catch (err) {
      console.error('Error loading menu library form:', err);
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Nous avons besoin de votre permission pour accéder à la galerie');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Nous avons besoin de votre permission pour accéder à la caméra');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64data = reader.result as string;
          resolve(base64data.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const formData = new FormData();
      formData.append('image', base64);

      const apiKey = process.env.EXPO_PUBLIC_IMGBB_API_KEY || '6adc05d703cb5647f72cd5d8c38a5051';
      const uploadResponse = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });

      const result = await uploadResponse.json();
      return result.success && result.data?.url ? result.data.url : null;
    } catch (err) {
      console.error('Error uploading image:', err);
      return null;
    }
  };

  const addMenuSpecificSupplement = () => {
    if (!newSupplementName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom pour le supplément');
      return;
    }

    if (!newSupplementPrice || isNaN(parseFloat(newSupplementPrice))) {
      Alert.alert('Erreur', 'Veuillez entrer un prix valide pour le supplément');
      return;
    }

    setMenuSpecificSupplements(prev => [
      ...prev,
      {
        tempId: Date.now().toString(),
        name: newSupplementName.trim(),
        description: newSupplementDescription.trim(),
        price: newSupplementPrice,
      },
    ]);
    setNewSupplementName('');
    setNewSupplementDescription('');
    setNewSupplementPrice('');
  };

  const removeMenuSpecificSupplement = (tempId: string) => {
    setMenuSpecificSupplements(prev => prev.filter(supplement => supplement.tempId !== tempId));
  };

  const saveSpecificSupplements = async (targetLibraryMenuId: string) => {
    if (!provider) return;

    await supabase
      .from('provider_supplements')
      .delete()
      .eq('provider_id', provider.id)
      .eq('library_menu_id', targetLibraryMenuId)
      .is('menu_id', null);

    if (menuSpecificSupplements.length === 0 || schools.length === 0) return;

    const rows = schools.flatMap(school =>
      menuSpecificSupplements.map(supplement => ({
        provider_id: provider.id,
        school_id: school.school_id,
        library_menu_id: targetLibraryMenuId,
        menu_id: null,
        name: supplement.name,
        description: supplement.description || null,
        price: parseFloat(supplement.price),
        available: true,
      }))
    );

    const { error } = await supabase.from('provider_supplements').insert(rows);
    if (error) throw error;
  };

  const handleSave = async () => {
    if (saving) return;

    if (!provider) {
      Alert.alert('Erreur', 'Prestataire introuvable');
      return;
    }

    if (!mealName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom de repas');
      return;
    }

    if (!price || isNaN(parseFloat(price))) {
      Alert.alert('Erreur', 'Veuillez entrer un prix valide');
      return;
    }

    if (schools.length === 0) {
      Alert.alert('Erreur', 'Aucune école associée à ce prestataire');
      return;
    }

    setSaving(true);
    let imageWarning = false;
    try {
      let imageUrl = existingImageUrl;

      if (imageUri) {
        const uploaded = await uploadImage(imageUri);
        if (uploaded) {
          imageUrl = uploaded;
        } else {
          imageWarning = true;
        }
      }

      const payload = {
        provider_id: provider.id,
        meal_name: mealName.trim(),
        description: description.trim() || null,
        price: parseFloat(price),
        card_color: selectedColor,
        image_url: imageUrl,
        available: true,
        updated_at: new Date().toISOString(),
      };

      let targetLibraryMenuId = libraryMenuId;

      if (isEditMode && libraryMenuId) {
        const { error } = await supabase
          .from('provider_menu_templates')
          .update(payload)
          .eq('id', libraryMenuId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('provider_menu_templates')
          .insert(payload)
          .select('id')
          .single();

        if (error) {
          console.error('Insert provider_menu_templates failed:', error);
          throw error;
        }
        if (!data?.id) throw new Error('Aucun identifiant retourné après création du menu');
        targetLibraryMenuId = data.id;
      }

      if (!targetLibraryMenuId) throw new Error('Menu bibliothèque introuvable');

      try {
        await saveSpecificSupplements(targetLibraryMenuId);
      } catch (suppErr: any) {
        console.error('Error saving menu specific supplements:', suppErr);
        Alert.alert('Avertissement', 'Le menu a été enregistré, mais les suppléments spécifiques n\'ont pas pu être sauvegardés.');
      }

      const successMessage = imageWarning
        ? (isEditMode ? 'Menu modifié (image non téléchargée)' : 'Menu ajouté à la bibliothèque (image non téléchargée)')
        : (isEditMode ? 'Menu modifié avec succès' : 'Menu ajouté à la bibliothèque');

      Alert.alert('Succès', successMessage, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error('Error saving library menu:', err);
      const message = err?.message || err?.details || err?.hint || 'Erreur lors de l\'enregistrement';
      Alert.alert('Erreur', message);
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditMode ? 'Modifier le menu' : 'Nouveau menu'}</Text>
        <TouchableOpacity
          style={[styles.headerSaveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.headerSaveButtonText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Nom du repas *</Text>
            <TextInput
              style={styles.input}
              value={mealName}
              onChangeText={setMealName}
              placeholder="Ex: Poulet rôti & légumes"
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
            <Text style={styles.label}>Prix (DH) *</Text>
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
            <Text style={styles.label}>Photo du menu</Text>
            {imageUri || existingImageUrl ? (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: imageUri || existingImageUrl! }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => { setImageUri(null); setExistingImageUrl(null); }}
                >
                  <X size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.imagePickerButtons}>
                <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                  <ImageIcon size={24} color="#111827" />
                  <Text style={styles.imagePickerButtonText}>Galerie</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.imagePickerButton} onPress={takePhoto}>
                  <Camera size={24} color="#111827" />
                  <Text style={styles.imagePickerButtonText}>Photo</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.hint}>Format recommandé : 150x150 pixels</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Couleur *</Text>
            <View style={styles.colorPickerContainer}>
              {pastelColors.map(colorOption => (
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
          </View>

          <View style={styles.formGroup}>
            <View style={styles.supplementsHeader}>
              <Plus size={20} color="#111827" />
              <Text style={styles.label}>Suppléments spécifiques à ce menu</Text>
            </View>
            <Text style={styles.hint}>Ajoutez des suppléments uniquement disponibles pour ce menu</Text>

            {menuSpecificSupplements.length > 0 && (
              <View style={styles.specificSupplementsList}>
                {menuSpecificSupplements.map(supplement => (
                  <View key={supplement.tempId} style={styles.specificSupplementItem}>
                    <View style={styles.specificSupplementInfo}>
                      <Text style={styles.supplementName}>{supplement.name}</Text>
                      {!!supplement.description && (
                        <Text style={styles.supplementDescription}>{supplement.description}</Text>
                      )}
                      <Text style={styles.supplementPrice}>+{parseFloat(supplement.price).toFixed(2)} DH</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeMenuSpecificSupplement(supplement.tempId)}
                      style={styles.deleteSupplementButton}
                    >
                      <Trash2 size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.addSupplementForm}>
              <TextInput
                style={styles.input}
                value={newSupplementName}
                onChangeText={setNewSupplementName}
                placeholder="Nom du supplément *"
                placeholderTextColor="#9CA3AF"
              />
              <TextInput
                style={[styles.input, styles.specificTextArea]}
                value={newSupplementDescription}
                onChangeText={setNewSupplementDescription}
                placeholder="Description (optionnelle)"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
              <TextInput
                style={styles.input}
                value={newSupplementPrice}
                onChangeText={setNewSupplementPrice}
                placeholder="Prix (DH) *"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
              />
              <TouchableOpacity style={styles.addSupplementButton} onPress={addMenuSpecificSupplement}>
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addSupplementButtonText}>Ajouter ce supplément</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  },
  header: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 22,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerSaveButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 22,
    height: 52,
    minWidth: 132,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 44,
  },
  form: {
    gap: 30,
  },
  formGroup: {
    gap: 12,
  },
  label: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingHorizontal: 22,
    minHeight: 70,
    fontSize: 18,
    color: '#111827',
  },
  textArea: {
    minHeight: 148,
    paddingTop: 22,
  },
  specificTextArea: {
    minHeight: 70,
    paddingTop: 20,
  },
  hint: {
    fontSize: 16,
    color: '#9CA3AF',
    lineHeight: 22,
  },
  imagePreviewContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  imagePreview: {
    width: 150,
    height: 150,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#EF4444',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePickerButtons: {
    flexDirection: 'row',
    gap: 18,
  },
  imagePickerButton: {
    flex: 1,
    height: 78,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  imagePickerButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  colorPickerContainer: {
    flexDirection: 'row',
    gap: 18,
  },
  colorOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderColor: '#111827',
  },
  supplementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addSupplementForm: {
    gap: 12,
    marginTop: 2,
    padding: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
  },
  addSupplementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  addSupplementButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  specificSupplementsList: {
    gap: 8,
    marginTop: 12,
  },
  specificSupplementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  specificSupplementInfo: {
    flex: 1,
  },
  supplementName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  supplementDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  supplementPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F59E0B',
  },
  deleteSupplementButton: {
    padding: 8,
  },
});
