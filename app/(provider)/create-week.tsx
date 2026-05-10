import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Package, Plus, X } from 'lucide-react-native';
import { authService } from '@/lib/auth';
import { Provider, ProviderMenuLibrary, supabase } from '@/lib/supabase';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

interface RawSupplement {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  price: number;
  library_menu_id: string | null;
}

interface SupplementOption {
  key: string;
  name: string;
  price: number;
  library_menu_id: string | null;
  idsBySchool: Record<string, string>;
}

interface DayConfig {
  date: string;
  menuIds: string[];
  supplementKeys: string[];
}

const formatDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (dateString: string) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
};

const getWeekStart = (dateString: string) => {
  const date = parseLocalDate(dateString);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return formatDate(addDays(date, diff));
};

const formatDayTitle = (dateString: string) => {
  const date = parseLocalDate(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).replace(/^\p{L}/u, char => char.toUpperCase());
};

const getSupplementKey = (supplement: Pick<RawSupplement, 'name' | 'price' | 'description' | 'library_menu_id'>) =>
  `${supplement.library_menu_id || 'global'}|${supplement.name}|${supplement.price}|${supplement.description || ''}`;

const buildSupplementOptions = (supplements: RawSupplement[]) => {
  const groups: Record<string, SupplementOption> = {};

  supplements.forEach(supplement => {
    const key = getSupplementKey(supplement);
    if (!groups[key]) {
      groups[key] = {
        key,
        name: supplement.name,
        price: supplement.price,
        library_menu_id: supplement.library_menu_id,
        idsBySchool: {},
      };
    }
    groups[key].idsBySchool[supplement.school_id] = supplement.id;
  });

  return Object.values(groups);
};

export default function CreateWeekScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editDate?: string }>();
  const [provider, setProvider] = useState<Provider | null>(null);
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [libraryMenus, setLibraryMenus] = useState<ProviderMenuLibrary[]>([]);
  const [rawSupplements, setRawSupplements] = useState<RawSupplement[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>(params.editDate ? [params.editDate] : []);
  const [dayConfigs, setDayConfigs] = useState<Record<string, DayConfig>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => params.editDate ? parseLocalDate(params.editDate) : new Date());
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const supplementOptions = useMemo(() => buildSupplementOptions(rawSupplements), [rawSupplements]);

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
      setSelectedSchools(schoolsList.map(school => school.school_id));

      const [{ data: menusData }, { data: supplementsData }] = await Promise.all([
        supabase
          .from('provider_menu_library')
          .select('*')
          .eq('provider_id', currentProvider.id)
          .eq('available', true)
          .order('meal_name'),
        supabase
          .from('provider_supplements')
          .select('id, school_id, name, description, price, library_menu_id')
          .eq('provider_id', currentProvider.id)
          .eq('available', true)
          .is('menu_id', null)
          .order('name'),
      ]);

      setLibraryMenus((menusData || []) as ProviderMenuLibrary[]);
      setRawSupplements((supplementsData || []) as RawSupplement[]);

      if (params.editDate) {
        await loadExistingDate(currentProvider, params.editDate, schoolsList, (supplementsData || []) as RawSupplement[]);
      }
    } catch (err) {
      console.error('Error loading week creator:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadExistingDate = async (
    currentProvider: Provider,
    editDate: string,
    schoolsList: SchoolAccess[],
    supplements: RawSupplement[]
  ) => {
    const { data: menusData } = await supabase
      .from('menus')
      .select('school_id, library_menu_id')
      .eq('provider_id', currentProvider.id)
      .eq('date', editDate)
      .not('library_menu_id', 'is', null);

    const schoolIds = Array.from(new Set((menusData || []).map(menu => menu.school_id)));
    if (schoolIds.length > 0) {
      setSelectedSchools(schoolIds);
    } else {
      setSelectedSchools(schoolsList.map(school => school.school_id));
    }

    const menuIds = Array.from(new Set((menusData || []).map(menu => menu.library_menu_id).filter(Boolean))) as string[];

    const { data: dayPlans } = await supabase
      .from('provider_week_plan_days')
      .select('enabled_supplement_ids')
      .eq('provider_id', currentProvider.id)
      .eq('date', editDate);

    const selectedSupplementIds = new Set<string>();
    (dayPlans || []).forEach(day => {
      (day.enabled_supplement_ids || []).forEach((id: string) => selectedSupplementIds.add(id));
    });

    const supplementKeys = supplements
      .filter(supplement => selectedSupplementIds.has(supplement.id))
      .map(supplement => getSupplementKey(supplement));

    setDayConfigs({
      [editDate]: {
        date: editDate,
        menuIds,
        supplementKeys: Array.from(new Set(supplementKeys)),
      },
    });
  };

  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const toggleSchool = (schoolId: string) => {
    setSelectedSchools(prev =>
      prev.includes(schoolId)
        ? prev.filter(id => id !== schoolId)
        : [...prev, schoolId]
    );
  };

  const toggleDate = (date: Date) => {
    const dateString = formatDate(date);

    setSelectedDates(prev => {
      if (prev.includes(dateString)) {
        const next = prev.filter(d => d !== dateString);
        setDayConfigs(current => {
          const copy = { ...current };
          delete copy[dateString];
          return copy;
        });
        return next;
      }

      setDayConfigs(current => ({
        ...current,
        [dateString]: current[dateString] || { date: dateString, menuIds: [], supplementKeys: [] },
      }));
      return [...prev, dateString].sort();
    });
  };

  const removeDate = (dateString: string) => {
    setSelectedDates(prev => prev.filter(date => date !== dateString));
    setDayConfigs(prev => {
      const copy = { ...prev };
      delete copy[dateString];
      return copy;
    });
  };

  const toggleMenuForDate = (dateString: string, menuId: string) => {
    setDayConfigs(prev => {
      const current = prev[dateString] || { date: dateString, menuIds: [], supplementKeys: [] };
      const menuIds = current.menuIds.includes(menuId)
        ? current.menuIds.filter(id => id !== menuId)
        : [...current.menuIds, menuId];

      const availableKeys = new Set(
        supplementOptions
          .filter(option => !option.library_menu_id || menuIds.includes(option.library_menu_id))
          .map(option => option.key)
      );

      return {
        ...prev,
        [dateString]: {
          ...current,
          menuIds,
          supplementKeys: current.supplementKeys.filter(key => availableKeys.has(key)),
        },
      };
    });
  };

  const toggleSupplementForDate = (dateString: string, key: string) => {
    setDayConfigs(prev => {
      const current = prev[dateString] || { date: dateString, menuIds: [], supplementKeys: [] };
      return {
        ...prev,
        [dateString]: {
          ...current,
          supplementKeys: current.supplementKeys.includes(key)
            ? current.supplementKeys.filter(item => item !== key)
            : [...current.supplementKeys, key],
        },
      };
    });
  };

  const getSupplementsForDate = (dateString: string) => {
    const config = dayConfigs[dateString] || { menuIds: [] };
    return supplementOptions.filter(option => !option.library_menu_id || config.menuIds.includes(option.library_menu_id));
  };

  const publishMenusForSchoolDay = async (schoolId: string, config: DayConfig, weekStartDate: string) => {
    if (!provider) return;

    const { data: existingMenus } = await supabase
      .from('menus')
      .select('id')
      .eq('provider_id', provider.id)
      .eq('school_id', schoolId)
      .eq('date', config.date)
      .not('library_menu_id', 'is', null);

    const existingMenuIds = (existingMenus || []).map(menu => menu.id);

    if (existingMenuIds.length > 0) {
      const { data: reservations } = await supabase
        .from('reservations')
        .select('menu_id')
        .in('menu_id', existingMenuIds)
        .neq('payment_status', 'cancelled');

      const reservedMenuIds = new Set((reservations || []).map(reservation => reservation.menu_id));
      const deletableMenuIds = existingMenuIds.filter(id => !reservedMenuIds.has(id));
      const reservedExistingMenuIds = existingMenuIds.filter(id => reservedMenuIds.has(id));

      if (deletableMenuIds.length > 0) {
        await supabase
          .from('provider_supplements')
          .delete()
          .eq('provider_id', provider.id)
          .in('menu_id', deletableMenuIds)
          .not('source_library_supplement_id', 'is', null);

        await supabase.from('menus').delete().in('id', deletableMenuIds);
      }

      if (reservedExistingMenuIds.length > 0) {
        await supabase.from('menus').update({ available: false }).in('id', reservedExistingMenuIds);
      }
    }

    for (const libraryMenuId of config.menuIds) {
      const menu = libraryMenus.find(item => item.id === libraryMenuId);
      if (!menu) continue;

      const { data: insertedMenu, error } = await supabase
        .from('menus')
        .insert({
          school_id: schoolId,
          provider_id: provider.id,
          library_menu_id: menu.id,
          week_start_date: weekStartDate,
          date: config.date,
          meal_name: menu.meal_name,
          description: menu.description,
          price: menu.price,
          image_url: menu.image_url,
          card_color: menu.card_color,
          available: true,
          supplements: [],
        })
        .select('id')
        .single();

      if (error) throw error;

      const supplementIds: string[] = [];
      const selectedOptions = supplementOptions.filter(option => config.supplementKeys.includes(option.key));

      for (const option of selectedOptions) {
        if (!option.library_menu_id) {
          const globalId = option.idsBySchool[schoolId];
          if (globalId) supplementIds.push(globalId);
          continue;
        }

        if (option.library_menu_id !== libraryMenuId) continue;

        const sourceSupplement = rawSupplements.find(supplement =>
          supplement.id === option.idsBySchool[schoolId] &&
          supplement.library_menu_id === libraryMenuId
        );

        if (!sourceSupplement) continue;

        const { data: copiedSupplement, error: supplementError } = await supabase
          .from('provider_supplements')
          .insert({
            provider_id: provider.id,
            school_id: schoolId,
            menu_id: insertedMenu.id,
            library_menu_id: libraryMenuId,
            source_library_supplement_id: sourceSupplement.id,
            name: sourceSupplement.name,
            description: sourceSupplement.description,
            price: sourceSupplement.price,
            available: true,
          })
          .select('id')
          .single();

        if (supplementError) throw supplementError;
        supplementIds.push(copiedSupplement.id);
      }

      if (supplementIds.length > 0) {
        await supabase.from('menus').update({ supplements: supplementIds }).eq('id', insertedMenu.id);
      }
    }
  };

  const handleSave = async () => {
    if (!provider || saving) return;

    if (selectedSchools.length === 0) {
      showAlert('Erreur', 'Veuillez sélectionner au moins une école');
      return;
    }

    if (selectedDates.length === 0) {
      showAlert('Erreur', 'Veuillez sélectionner au moins un jour');
      return;
    }

    const emptyDay = selectedDates.find(date => (dayConfigs[date]?.menuIds || []).length === 0);
    if (emptyDay) {
      showAlert('Erreur', `Ajoutez au moins un menu pour ${formatDayTitle(emptyDay)}`);
      return;
    }

    setSaving(true);
    try {
      const weekStartDates = Array.from(new Set(selectedDates.map(getWeekStart)));
      const weekPlanIds: Record<string, string> = {};

      for (const weekStartDate of weekStartDates) {
        const { data, error } = await supabase
          .from('provider_week_plans')
          .upsert({ provider_id: provider.id, week_start_date: weekStartDate, updated_at: new Date().toISOString() }, {
            onConflict: 'provider_id,week_start_date',
          })
          .select('id')
          .single();

        if (error) throw error;
        weekPlanIds[weekStartDate] = data.id;
      }

      await supabase
        .from('provider_week_plan_days')
        .delete()
        .eq('provider_id', provider.id)
        .in('school_id', selectedSchools)
        .in('date', selectedDates);

      const planRows = selectedSchools.flatMap(schoolId =>
        selectedDates.map(date => {
          const config = dayConfigs[date];
          const representativeSupplementIds = config.supplementKeys
            .map(key => supplementOptions.find(option => option.key === key))
            .filter(Boolean)
            .map(option => {
              const selectedOption = option as SupplementOption;
              return selectedOption.idsBySchool[schoolId] || Object.values(selectedOption.idsBySchool)[0];
            })
            .filter(Boolean);

          return {
            week_plan_id: weekPlanIds[getWeekStart(date)],
            provider_id: provider.id,
            school_id: schoolId,
            date,
            library_menu_ids: config.menuIds,
            enabled_supplement_ids: representativeSupplementIds,
            updated_at: new Date().toISOString(),
          };
        })
      );

      if (planRows.length > 0) {
        const { error } = await supabase.from('provider_week_plan_days').insert(planRows);
        if (error) throw error;
      }

      for (const schoolId of selectedSchools) {
        for (const date of selectedDates) {
          await publishMenusForSchoolDay(schoolId, dayConfigs[date], getWeekStart(date));
        }
      }

      showAlert('Succès', 'Semaine enregistrée et publiée côté parents', [
        { text: 'OK', onPress: () => router.replace('/(provider)/week' as any) },
      ]);
    } catch (err: any) {
      console.error('Error saving week:', err);
      showAlert('Erreur', err.message || 'Erreur lors de l\'enregistrement de la semaine');
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

  const pickerConfig = pickerDate ? dayConfigs[pickerDate] : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack('/(provider)')} style={styles.backButton}>
          <ArrowLeft size={28} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{params.editDate ? formatDayTitle(params.editDate) : 'Créer ma semaine'}</Text>
        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Enregistrer</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.sectionTitle}>Écoles concernées</Text>
        <View style={styles.chipsRow}>
          {schools.map(school => {
            const selected = selectedSchools.includes(school.school_id);
            return (
              <TouchableOpacity
                key={school.school_id}
                style={[styles.schoolChip, selected && styles.schoolChipSelected]}
                onPress={() => toggleSchool(school.school_id)}
              >
                <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                  {selected && <Check size={16} color="#FFFFFF" />}
                </View>
                <Text style={[styles.schoolChipText, selected && styles.schoolChipTextSelected]}>{school.school_name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!params.editDate && (
          <>
            <Text style={styles.sectionTitle}>Sélectionnez les jours</Text>
            <View style={styles.calendarCard}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity style={styles.monthButton} onPress={() => setCalendarMonth(addDays(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1), -1))}>
                  <ChevronLeft size={28} color="#F3F4F6" />
                </TouchableOpacity>
                <Text style={styles.calendarMonth}>{calendarMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</Text>
                <TouchableOpacity style={styles.monthButton} onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                  <ChevronRight size={28} color="#111827" />
                </TouchableOpacity>
              </View>

              <View style={styles.weekDaysRow}>
                {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
                  <Text key={day} style={styles.weekDayText}>{day}</Text>
                ))}
              </View>

              <View style={styles.daysGrid}>
                {getCalendarDays().map((date, index) => {
                  if (!date) return <View key={`empty-${index}`} style={styles.dayCell} />;
                  const dateString = formatDate(date);
                  const selected = selectedDates.includes(dateString);
                  return (
                    <TouchableOpacity
                      key={dateString}
                      style={[styles.dayCell, selected && styles.dayCellSelected]}
                      onPress={() => toggleDate(date)}
                    >
                      <Text style={[styles.dayCellText, selected && styles.dayCellTextSelected]}>{date.getDate()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {selectedDates.length > 0 && (
          <>
            <Text style={styles.configTitle}>Configuration des jours sélectionnés</Text>
            {selectedDates.map(date => {
              const config = dayConfigs[date] || { date, menuIds: [], supplementKeys: [] };
              const supplements = getSupplementsForDate(date);

              return (
                <View key={date} style={styles.dayConfigCard}>
                  <View style={styles.dayCardHeader}>
                    <Text style={styles.dayTitle}>{formatDayTitle(date)}</Text>
                    {!params.editDate && (
                      <TouchableOpacity onPress={() => removeDate(date)}>
                        <X size={24} color="#6B7280" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.cardLabel}>Menus proposés :</Text>
                  <View style={styles.chipsRow}>
                    {config.menuIds.map(menuId => {
                      const menu = libraryMenus.find(item => item.id === menuId);
                      if (!menu) return null;
                      return (
                        <TouchableOpacity key={menuId} style={styles.selectedMenuChip} onPress={() => toggleMenuForDate(date, menuId)}>
                          <Text style={styles.selectedMenuText}>{menu.meal_name}</Text>
                          <X size={16} color="#111827" />
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity style={styles.addChip} onPress={() => setPickerDate(date)}>
                      <Plus size={18} color="#4F46E5" />
                      <Text style={styles.addChipText}>Ajouter</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.cardLabel}>Suppléments disponibles ce jour :</Text>
                  <View style={styles.chipsRow}>
                    {supplements.map(option => {
                      const selected = config.supplementKeys.includes(option.key);
                      return (
                        <TouchableOpacity
                          key={option.key}
                          style={[styles.supplementChip, selected && styles.supplementChipSelected]}
                          onPress={() => toggleSupplementForDate(date, option.key)}
                        >
                          <Package size={16} color={selected ? '#FFFFFF' : '#6B7280'} />
                          <Text style={[styles.supplementChipText, selected && styles.supplementChipTextSelected]}>{option.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={!!pickerDate} transparent animationType="fade" onRequestClose={() => setPickerDate(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choisir des menus</Text>
              <TouchableOpacity onPress={() => setPickerDate(null)}>
                <X size={30} color="#111827" />
              </TouchableOpacity>
            </View>

            {libraryMenus.map(menu => {
              const selected = !!pickerConfig?.menuIds.includes(menu.id);
              return (
                <TouchableOpacity
                  key={menu.id}
                  style={styles.menuChoiceRow}
                  onPress={() => pickerDate && toggleMenuForDate(pickerDate, menu.id)}
                >
                  <View style={[styles.colorDot, { backgroundColor: menu.card_color || '#FFE4E1' }]} />
                  <View style={styles.menuChoiceText}>
                    <Text style={styles.menuChoiceName}>{menu.meal_name}</Text>
                    <Text style={styles.menuChoicePrice}>{Number(menu.price).toFixed(2)} DH</Text>
                  </View>
                  <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                    {selected && <Check size={20} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.confirmButton} onPress={() => setPickerDate(null)}>
              <Text style={styles.confirmButtonText}>Confirmer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    height: 82,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16,
  },
  backButton: {
    width: 54,
    height: 54,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  saveButton: {
    backgroundColor: '#111827',
    height: 54,
    borderRadius: 11,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 124,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 22,
    paddingBottom: 48,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 18,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 30,
  },
  schoolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#111827',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  schoolChipSelected: {
    backgroundColor: '#F9FAFB',
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#111827',
  },
  checkCircleSelected: {
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolChipText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  schoolChipTextSelected: {
    color: '#111827',
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    marginBottom: 38,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 7,
    elevation: 4,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  monthButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonth: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekDayText: {
    flex: 1,
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '800',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginVertical: 7,
  },
  dayCellSelected: {
    backgroundColor: '#111827',
  },
  dayCellText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '700',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
  },
  configTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 18,
  },
  dayConfigCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 7,
    elevation: 4,
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  dayTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  cardLabel: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 12,
  },
  selectedMenuChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE2DE',
    borderColor: '#F8C8C1',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  selectedMenuText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#4F46E5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  addChipText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '800',
  },
  supplementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  supplementChipSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  supplementChipText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '800',
  },
  supplementChipTextSelected: {
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    paddingBottom: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  menuChoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 18,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  menuChoiceText: {
    flex: 1,
  },
  menuChoiceName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  menuChoicePrice: {
    color: '#6B7280',
    fontSize: 13,
  },
  radioCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: '#D1D5DB',
  },
  radioCircleSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    marginHorizontal: 24,
    marginTop: 26,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
