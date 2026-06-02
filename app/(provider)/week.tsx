import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PinGate } from '@/components/PinGate';
import { useFocusEffect, useRouter } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { ArrowLeft, Check, ChefHat, Edit, XCircle } from 'lucide-react-native';
import { authService } from '@/lib/auth';
import { Menu, supabase } from '@/lib/supabase';

interface SchoolAccess {
  school_id: string;
  school_name: string;
}

interface MenuRow extends Menu {
  schools?: { name?: string } | null;
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

const getCurrentWeekDates = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = addDays(today, diff);
  return Array.from({ length: 6 }, (_, index) => formatDate(addDays(monday, index)));
};

const formatDayTitle = (dateString: string) => {
  const date = parseLocalDate(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).replace(/^\p{L}/u, char => char.toUpperCase());
};

export default function ProviderWeekScreen() {
  const router = useRouter();
  const [schools, setSchools] = useState<SchoolAccess[]>([]);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const weekDates = useMemo(() => getCurrentWeekDates(), []);

  const loadData = useCallback(async () => {
    try {
      const currentProvider = await authService.getCurrentProviderFromAuth();
      if (!currentProvider) {
        router.replace('/auth');
        return;
      }

      const { data: schoolAccess } = await supabase
        .from('provider_school_access')
        .select('school_id, schools(name)')
        .eq('provider_id', currentProvider.id);

      const schoolsList = (schoolAccess || []).map(sa => ({
        school_id: (sa as any).school_id,
        school_name: (sa as any).schools?.name || 'École',
      }));
      setSchools(schoolsList);

      if (schoolsList.length === 0) {
        setMenus([]);
        return;
      }

      const { data: menusData } = await supabase
        .from('menus')
        .select('*, schools(name)')
        .eq('provider_id', currentProvider.id)
        .in('school_id', schoolsList.map(school => school.school_id))
        .gte('date', weekDates[0])
        .lte('date', weekDates[weekDates.length - 1])
        .eq('available', true)
        .order('date')
        .order('meal_name');

      setMenus((menusData || []) as MenuRow[]);
    } catch (err) {
      console.error('Error loading provider week:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router, weekDates]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getMenusForSchoolDate = (schoolId: string, date: string) =>
    menus.filter(menu => menu.school_id === schoolId && menu.date === date);

  const getSchoolComplete = (schoolId: string) =>
    weekDates.every(date => getMenusForSchoolDate(schoolId, date).length > 0);

  const hasAnyCompleteSchool = schools.some(school => getSchoolComplete(school.school_id));

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
    <PinGate title="Voir ma semaine">
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => safeBack('/(provider)')} style={styles.backButton}>
          <ArrowLeft size={28} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voir ma semaine</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={[styles.statusHero, hasAnyCompleteSchool ? styles.statusHeroComplete : styles.statusHeroIncomplete]}>
          {hasAnyCompleteSchool ? (
            <Check size={30} color="#047857" />
          ) : (
            <XCircle size={30} color="#B45309" />
          )}
          <View style={styles.statusHeroText}>
            <Text style={[styles.statusHeroTitle, hasAnyCompleteSchool ? styles.statusHeroTitleComplete : styles.statusHeroTitleIncomplete]}>
              {hasAnyCompleteSchool ? 'Semaine complète' : 'Semaine incomplète'}
            </Text>
            <Text style={[styles.statusHeroSubtitle, hasAnyCompleteSchool ? styles.statusHeroSubtitleComplete : styles.statusHeroSubtitleIncomplete]}>
              Menus disponibles du lundi au samedi
            </Text>
          </View>
        </View>

        {schools.map(school => {
          const complete = getSchoolComplete(school.school_id);
          return (
            <View key={school.school_id} style={[styles.schoolStatus, complete ? styles.schoolStatusComplete : styles.schoolStatusIncomplete]}>
              <Text style={[styles.schoolStatusText, complete ? styles.schoolStatusTextComplete : styles.schoolStatusTextIncomplete]}>
                {complete ? 'Semaine complète' : 'Semaine incomplète'} – École {school.school_name}
              </Text>
            </View>
          );
        })}

        {weekDates.map(date => (
          <View key={date} style={styles.dayCard}>
            <View style={styles.dayCardHeader}>
              <Text style={styles.dayTitle}>{formatDayTitle(date)}</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => router.push(`/(provider)/create-week?editDate=${date}` as any)}
              >
                <Edit size={18} color="#4F46E5" />
                <Text style={styles.editButtonText}>Modifier</Text>
              </TouchableOpacity>
            </View>

            {schools.map(school => {
              const schoolMenus = getMenusForSchoolDate(school.school_id, date);
              return (
                <View key={`${date}-${school.school_id}`} style={styles.schoolBlock}>
                  <Text style={styles.schoolTitle}>{school.school_name.toUpperCase()}</Text>
                  {schoolMenus.length === 0 ? (
                    <View style={styles.emptyMenuRow}>
                      <Text style={styles.emptyMenuText}>Aucun menu assigné</Text>
                    </View>
                  ) : (
                    schoolMenus.map(menu => (
                      <View key={menu.id} style={styles.menuRow}>
                        <View style={[styles.menuAccent, { backgroundColor: menu.card_color || '#FFE4E1' }]} />
                        <ChefHat size={18} color="#6B7280" />
                        <Text style={styles.menuName}>{menu.meal_name}</Text>
                        <Text style={styles.menuPrice}>{Number(menu.price).toFixed(2)} DH</Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
    </PinGate>
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
    paddingHorizontal: 22,
  },
  backButton: {
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSpacer: {
    width: 54,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 22,
    paddingBottom: 42,
  },
  statusHero: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 30,
    marginBottom: 18,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  statusHeroComplete: {
    backgroundColor: '#86EFAC',
  },
  statusHeroIncomplete: {
    backgroundColor: '#FEF3C7',
  },
  statusHeroText: {
    flex: 1,
  },
  statusHeroTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  statusHeroTitleComplete: {
    color: '#047857',
  },
  statusHeroTitleIncomplete: {
    color: '#92400E',
  },
  statusHeroSubtitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusHeroSubtitleComplete: {
    color: '#047857',
  },
  statusHeroSubtitleIncomplete: {
    color: '#B45309',
  },
  schoolStatus: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
  },
  schoolStatusComplete: {
    backgroundColor: '#D1FAE5',
  },
  schoolStatusIncomplete: {
    backgroundColor: '#FEF3C7',
  },
  schoolStatusText: {
    fontSize: 13,
    fontWeight: '800',
  },
  schoolStatusTextComplete: {
    color: '#047857',
  },
  schoolStatusTextIncomplete: {
    color: '#92400E',
  },
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginTop: 14,
    overflow: 'hidden',
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
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dayTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 6,
  },
  editButtonText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '800',
  },
  schoolBlock: {
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  schoolTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    minHeight: 64,
    paddingHorizontal: 18,
    marginBottom: 18,
    overflow: 'hidden',
    gap: 12,
  },
  menuAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  menuName: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  menuPrice: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyMenuRow: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 18,
  },
  emptyMenuText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
  },
});
