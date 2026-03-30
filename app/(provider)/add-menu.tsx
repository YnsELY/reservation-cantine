import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, Provider } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Check, Calendar, X, ChevronLeft, ChevronRight, Camera, ImageIcon, Package, Plus, Trash2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

interface Supplement {
  id: string;
  name: string;
  description: string | null;
  price: number;
  school_id: string;
}

interface MenuSpecificSupplement {
  tempId: string;
  name: string;
  description: string;
  price: string;
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
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [availableSupplements, setAvailableSupplements] = useState<Supplement[]>([]);
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);
  const [menuSpecificSupplements, setMenuSpecificSupplements] = useState<MenuSpecificSupplement[]>([]);
  const [newSupplementName, setNewSupplementName] = useState('');
  const [newSupplementDescription, setNewSupplementDescription] = useState('');
  const [newSupplementPrice, setNewSupplementPrice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const isEditMode = !!params.editMenuId;
  const editMenuIds: string[] = params.editMenuIds ? JSON.parse(params.editMenuIds as string) : [];
  const editSchoolIds: string[] = params.editSchoolIds ? JSON.parse(params.editSchoolIds as string) : [];

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

  useEffect(() => {
    if (selectedSchools.length > 0) {
      loadSupplements();
    } else {
      setAvailableSupplements([]);
    }
  }, [selectedSchools]);

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

      if (isEditMode) {
        setMealName(params.editMealName as string || '');
        setDescription(params.editDescription as string || '');
        setPrice(params.editPrice as string || '');
        setSelectedColor(params.editColor as string || '#FFE4E1');
        if (params.editImageUrl) {
          setExistingImageUrl(params.editImageUrl as string);
        }
        if (params.editDate) {
          const editDate = new Date(params.editDate as string + 'T00:00:00');
          setSelectedDate(editDate);
          setCalendarMonth(editDate);
        }
        setSelectedSchools(editSchoolIds);
        setSelectAllSchools(editSchoolIds.length === schoolsList.length);
        const editSupps = params.editSupplements ? JSON.parse(params.editSupplements as string) : [];
        setSelectedSupplements(editSupps);
      } else if (schoolsList.length > 0) {
        setSelectedSchools([schoolsList[0].school_id]);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSupplements = async () => {
    try {
      if (!provider) return;

      const { data } = await supabase
        .from('provider_supplements')
        .select('id, name, description, price, school_id')
        .eq('provider_id', provider.id)
        .in('school_id', selectedSchools)
        .eq('available', true)
        .is('menu_id', null)
        .order('name');

      const uniqueSupplements = new Map<string, Supplement>();
      (data || []).forEach((supplement) => {
        const key = `${supplement.name}-${supplement.price}`;
        if (!uniqueSupplements.has(key)) {
          uniqueSupplements.set(key, supplement);
        }
      });

      const supplementsList = Array.from(uniqueSupplements.values());
      setAvailableSupplements(supplementsList);

      setSelectedSupplements(supplementsList.map(s => s.id));
    } catch (err) {
      console.error('Error loading supplements:', err);
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

  const toggleSupplement = (supplementId: string) => {
    setSelectedSupplements(prev => {
      if (prev.includes(supplementId)) {
        return prev.filter(id => id !== supplementId);
      } else {
        return [...prev, supplementId];
      }
    });
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

    const newSupplement: MenuSpecificSupplement = {
      tempId: Date.now().toString(),
      name: newSupplementName.trim(),
      description: newSupplementDescription.trim(),
      price: newSupplementPrice,
    };

    setMenuSpecificSupplements(prev => [...prev, newSupplement]);
    setNewSupplementName('');
    setNewSupplementDescription('');
    setNewSupplementPrice('');
  };

  const removeMenuSpecificSupplement = (tempId: string) => {
    setMenuSpecificSupplements(prev => prev.filter(s => s.tempId !== tempId));
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
      console.log('Starting image upload to ImgBB...');

      const response = await fetch(uri);
      const blob = await response.blob();

      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const base64String = base64data.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const formData = new FormData();
      formData.append('image', base64);

      const apiKey = process.env.EXPO_PUBLIC_IMGBB_API_KEY || '6adc05d703cb5647f72cd5d8c38a5051';
      console.log('API Key available:', !!apiKey);

      const uploadResponse = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });

      const result = await uploadResponse.json();
      console.log('ImgBB response:', result);

      if (result.success && result.data && result.data.url) {
        console.log('Image uploaded successfully:', result.data.url);
        return result.data.url;
      } else {
        console.error('Upload failed:', result);
        console.error('Error details:', result.error);
        throw new Error(result.error?.message || 'Upload failed');
      }
    } catch (err) {
      console.error('Error uploading image to ImgBB:', err);
      return null;
    }
  };

  const handleSave = async () => {
    console.log('=== handleSave called ===');
    console.log('Meal name:', mealName);
    console.log('Price:', price);
    console.log('Selected schools:', selectedSchools);
    console.log('Image URI:', imageUri);
    console.log('Provider:', provider);

    if (saving) {
      console.log('Already saving, ignoring duplicate call');
      return;
    }

    if (!mealName.trim()) {
      console.log('Validation failed: No meal name');
      Alert.alert('Erreur', 'Veuillez entrer un nom de repas');
      return;
    }

    if (!price || isNaN(parseFloat(price))) {
      console.log('Validation failed: Invalid price');
      Alert.alert('Erreur', 'Veuillez entrer un prix valide');
      return;
    }

    if (selectedSchools.length === 0) {
      console.log('Validation failed: No schools selected');
      Alert.alert('Erreur', 'Veuillez sélectionner au moins une école');
      return;
    }

    console.log('All validations passed, starting save process...');
    setSaving(true);
    try {
      let imageUrl: string | null = null;

      if (imageUri) {
        setUploadingImage(true);
        imageUrl = await uploadImage(imageUri);
        setUploadingImage(false);

        if (!imageUrl) {
          Alert.alert('Avertissement', 'L\'image n\'a pas pu être téléchargée. Le menu sera créé sans image.');
        }
      }

      const formatDateForDB = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      if (isEditMode) {
        // Mode édition : mettre à jour les menus existants
        const updateData = {
          meal_name: mealName.trim(),
          description: description.trim() || null,
          price: parseFloat(price),
          date: formatDateForDB(selectedDate),
          card_color: selectedColor,
          image_url: imageUrl || existingImageUrl,
          supplements: selectedSupplements,
        };

        for (const menuId of editMenuIds) {
          const { error } = await supabase
            .from('menus')
            .update(updateData)
            .eq('id', menuId);

          if (error) {
            console.error('Database update error:', error);
            throw error;
          }
        }

        // Mettre à jour les suppléments spécifiques
        if (menuSpecificSupplements.length > 0) {
          // Supprimer les anciens suppléments spécifiques
          await supabase
            .from('provider_supplements')
            .delete()
            .in('menu_id', editMenuIds)
            .eq('provider_id', provider?.id || '');

          // Insérer les nouveaux
          const specificSupplementsData = editMenuIds.flatMap(menuId => {
            const menu = menus.find((m: any) => m.id === menuId) || { school_id: editSchoolIds[0] };
            return menuSpecificSupplements.map(supplement => ({
              provider_id: provider?.id || null,
              school_id: (menu as any).school_id || editSchoolIds[0],
              menu_id: menuId,
              name: supplement.name,
              description: supplement.description || null,
              price: parseFloat(supplement.price),
              available: true,
            }));
          });

          await supabase.from('provider_supplements').insert(specificSupplementsData);
        }

        Alert.alert('Succès', 'Menu modifié avec succès', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        // Mode création
        const menuData = selectedSchools.map(schoolId => ({
          school_id: schoolId,
          meal_name: mealName.trim(),
          description: description.trim() || null,
          price: parseFloat(price),
          date: formatDateForDB(selectedDate),
          card_color: selectedColor,
          provider_id: provider?.id || null,
          image_url: imageUrl,
          supplements: selectedSupplements,
        }));

        console.log('Inserting menu data:', menuData);
        const { data: insertedMenus, error } = await supabase.from('menus').insert(menuData).select();

        if (error) {
          console.error('Database insert error:', error);
          throw error;
        }

        console.log('Menu inserted successfully:', insertedMenus);

        if (menuSpecificSupplements.length > 0 && insertedMenus && insertedMenus.length > 0) {
          const specificSupplementsData = insertedMenus.flatMap(menu =>
            menuSpecificSupplements.map(supplement => ({
              provider_id: provider?.id || null,
              school_id: menu.school_id,
              menu_id: menu.id,
              name: supplement.name,
              description: supplement.description || null,
              price: parseFloat(supplement.price),
              available: true,
            }))
          );

          const { error: supplementsError } = await supabase
            .from('provider_supplements')
            .insert(specificSupplementsData);

          if (supplementsError) {
            console.error('Error inserting menu-specific supplements:', supplementsError);
            Alert.alert(
              'Avertissement',
              'Le menu a été créé mais certains suppléments spécifiques n\'ont pas pu être ajoutés.'
            );
          }
        }

        Alert.alert('Succès', `Menu créé avec succès pour ${selectedSchools.length} école(s)`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (err) {
      console.error('Error saving menu:', err);
      Alert.alert('Erreur', 'Erreur lors de la création du menu');
    } finally {
      setSaving(false);
      setUploadingImage(false);
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
        <Text style={styles.pageTitle}>{isEditMode ? 'Modifier le menu' : 'Nouveau menu'}</Text>

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

          <View style={styles.formGroup}>
            <View style={styles.supplementsHeader}>
              <Package size={20} color="#111827" />
              <Text style={styles.label}>Suppléments génériques</Text>
            </View>
            {availableSupplements.length === 0 ? (
              <View style={styles.noSupplementsBox}>
                <Text style={styles.noSupplementsText}>
                  Aucun supplément disponible pour les écoles sélectionnées
                </Text>
              </View>
            ) : (
              <View style={styles.supplementsList}>
                {availableSupplements.map((supplement) => (
                  <TouchableOpacity
                    key={supplement.id}
                    style={[
                      styles.supplementItem,
                      selectedSupplements.includes(supplement.id) && styles.supplementItemSelected
                    ]}
                    onPress={() => toggleSupplement(supplement.id)}
                  >
                    <View style={[
                      styles.checkbox,
                      selectedSupplements.includes(supplement.id) && styles.checkboxActive
                    ]}>
                      {selectedSupplements.includes(supplement.id) && (
                        <Check size={16} color="#FFFFFF" />
                      )}
                    </View>
                    <View style={styles.supplementInfo}>
                      <Text style={styles.supplementName}>{supplement.name}</Text>
                      {supplement.description && (
                        <Text style={styles.supplementDescription}>{supplement.description}</Text>
                      )}
                      <Text style={styles.supplementPrice}>+{supplement.price.toFixed(2)} DH</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.hint}>Tous les suppléments sont sélectionnés par défaut. Décochez ceux que vous ne souhaitez pas associer à ce menu.</Text>
          </View>

          <View style={styles.formGroup}>
            <View style={styles.supplementsHeader}>
              <Plus size={20} color="#111827" />
              <Text style={styles.label}>Suppléments spécifiques à ce menu</Text>
            </View>
            <Text style={styles.hint}>Ajoutez des suppléments uniquement disponibles pour ce menu</Text>

            {menuSpecificSupplements.length > 0 && (
              <View style={styles.specificSupplementsList}>
                {menuSpecificSupplements.map((supplement) => (
                  <View key={supplement.tempId} style={styles.specificSupplementItem}>
                    <View style={styles.specificSupplementInfo}>
                      <Text style={styles.supplementName}>{supplement.name}</Text>
                      {supplement.description && (
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
                style={[styles.input, styles.textArea]}
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
              <TouchableOpacity
                style={styles.addSupplementButton}
                onPress={addMenuSpecificSupplement}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addSupplementButtonText}>Ajouter ce supplément</Text>
              </TouchableOpacity>
            </View>
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
            <Text style={styles.saveButtonText}>{isEditMode ? 'Enregistrer les modifications' : 'Créer le menu'}</Text>
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
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonActive: {
    borderColor: '#111827',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#111827',
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
  hint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  imagePickerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  imagePickerButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
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
  supplementsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  supplementsList: {
    gap: 8,
    marginTop: 8,
  },
  supplementItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  supplementItemSelected: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  supplementInfo: {
    flex: 1,
  },
  supplementName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  supplementDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  supplementPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
  },
  noSupplementsBox: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  noSupplementsText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  addSupplementForm: {
    gap: 12,
    marginTop: 12,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  addSupplementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addSupplementButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  specificSupplementsList: {
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
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
  deleteSupplementButton: {
    padding: 8,
  },
});
