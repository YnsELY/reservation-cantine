import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Animated, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Menu, Provider } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { UtensilsCrossed, ChevronLeft, ChevronRight, ChefHat, ArrowLeft, ChevronRight as ChevronRightIcon } from 'lucide-react-native';

interface MenuWithOrderCount extends Menu {
  order_count: number;
  school_name?: string;
}

interface GroupedMenuWithOrderCount extends MenuWithOrderCount {
  school_ids: string[];
  school_names: string[];
}

const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ProviderDashboard() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [menus, setMenus] = useState<MenuWithOrderCount[]>([]);
  const [groupedMenus, setGroupedMenus] = useState<GroupedMenuWithOrderCount[]>([]);
  const [totalSchools, setTotalSchools] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [weekMenus, setWeekMenus] = useState<{[key: string]: MenuWithOrderCount[]}>({});
  const dayScaleAnim = useRef(new Animated.Value(1)).current;
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  useEffect(() => {
    if (selectedDate && weekMenus[selectedDate]) {
      const dayMenus = weekMenus[selectedDate];
      setMenus(dayMenus);
      const grouped = groupMenusByContent(dayMenus);
      setGroupedMenus(grouped);
    }
  }, [weekMenus, selectedDate]);

  const groupMenusByContent = (menusList: MenuWithOrderCount[]): GroupedMenuWithOrderCount[] => {
    const groups: { [key: string]: GroupedMenuWithOrderCount } = {};

    menusList.forEach((menu) => {
      const key = `${menu.meal_name}-${menu.date}-${menu.price}-${menu.description || ''}-${menu.image_url || ''}`;

      if (!groups[key]) {
        groups[key] = {
          ...menu,
          school_ids: [menu.school_id],
          school_names: [menu.school_name || 'École'],
        };
      } else {
        groups[key].order_count += menu.order_count;
        groups[key].school_ids.push(menu.school_id);
        groups[key].school_names.push(menu.school_name || 'École');
      }
    });

    return Object.values(groups);
  };

  const loadData = async () => {
    try {
      const currentProvider = await authService.getCurrentProviderFromAuth();
      if (!currentProvider) {
        router.replace('/auth');
        return;
      }

      setProvider(currentProvider);

      const dates: Date[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date);
      }

      setWeekDates(dates);
      setSelectedDate(formatDateToLocal(dates[0]));

      const menusMap: {[key: string]: MenuWithOrderCount[]} = {};
      const startDate = formatDateToLocal(dates[0]);
      const endDate = formatDateToLocal(dates[dates.length - 1]);

      const { data: schoolAccess } = await supabase
        .from('provider_school_access')
        .select('school_id')
        .eq('provider_id', currentProvider.id);

      const schoolIds = schoolAccess?.map(sa => sa.school_id) || [];
      setTotalSchools(schoolIds.length);

      let menusData: any[] = [];
      if (schoolIds.length > 0) {
        const { data } = await supabase
          .from('menus')
          .select('*, schools(name)')
          .in('school_id', schoolIds)
          .gte('date', startDate)
          .lte('date', endDate)
          .eq('available', true)
          .order('date')
          .order('meal_name');
        menusData = data || [];
      }

      for (const date of dates) {
        const dateString = formatDateToLocal(date);
        const dayMenus = (menusData || []).filter(menu => menu.date === dateString);

        const menusWithCounts = await Promise.all(
          dayMenus.map(async (menu) => {
            const { data: reservations } = await supabase
              .from('reservations')
              .select('id')
              .eq('menu_id', menu.id)
              .eq('date', dateString);

            return {
              ...menu,
              school_name: (menu.schools as any)?.name,
              order_count: reservations?.length || 0,
            };
          })
        );

        menusMap[dateString] = menusWithCounts;
      }

      setWeekMenus(menusMap);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleDateSelect = (date: Date, index: number) => {
    const dateString = formatDateToLocal(date);
    setSelectedDate(dateString);
    setSelectedDayIndex(index);
    const dayMenus = weekMenus[dateString] || [];
    setMenus(dayMenus);

    Animated.sequence([
      Animated.timing(dayScaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(dayScaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev'
      ? Math.max(0, selectedDayIndex - 1)
      : Math.min(weekDates.length - 1, selectedDayIndex + 1);

    if (newIndex !== selectedDayIndex) {
      handleDateSelect(weekDates[newIndex], newIndex);
    }
  };

  const getVisibleDays = () => {
    const visible = [];
    const centerIndex = selectedDayIndex;

    for (let i = centerIndex - 1; i <= centerIndex + 1; i++) {
      if (i >= 0 && i < weekDates.length) {
        visible.push({ date: weekDates[i], index: i });
      }
    }

    return visible;
  };

  const formatDateLabel = (date: Date) => {
    const days = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
    const months = ['JAN', 'FEV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOU', 'SEP', 'OCT', 'NOV', 'DEC'];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      month: months[date.getMonth()],
      fullDay: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][date.getDay()],
    };
  };

  const getCardColor = (index: number) => {
    const colors = [
      '#BAE6FD',
      '#A7F3D0',
      '#FEF3C7',
      '#DDD6FE',
    ];
    return colors[index % colors.length];
  };

  const isLightColor = (color: string) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 155;
  };





  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Menus à préparer</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.fixedDaySelector}>
        <View style={styles.daySelector}>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={() => navigateDay('prev')}
            disabled={selectedDayIndex === 0}
          >
            <ChevronLeft
              size={24}
              color={selectedDayIndex === 0 ? '#D1D5DB' : '#111827'}
            />
          </TouchableOpacity>

          <View style={styles.daysContainer}>
            {getVisibleDays().map(({ date, index }) => {
              const dateInfo = formatDateLabel(date);
              const isSelected = selectedDayIndex === index;
              const isAdjacent = Math.abs(selectedDayIndex - index) === 1;

              return (
                <Animated.View
                  key={index}
                  style={[
                    isSelected && { transform: [{ scale: dayScaleAnim }] },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.dayTab,
                      isSelected && styles.dayTabSelected,
                      isAdjacent && styles.dayTabAdjacent,
                    ]}
                    onPress={() => handleDateSelect(date, index)}
                  >
                    {isSelected ? (
                      <>
                        <Text style={styles.dayTabFullName}>
                          {dateInfo.fullDay}
                        </Text>
                        <Text style={styles.dayTabDate}>
                          {dateInfo.date}
                        </Text>
                        <Text style={styles.dayTabMonth}>
                          {dateInfo.month}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.dayTabTextAdjacent}>
                        {dateInfo.day}
                      </Text>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.navArrow}
            onPress={() => navigateDay('next')}
            disabled={selectedDayIndex === weekDates.length - 1}
          >
            <ChevronRight
              size={24}
              color={selectedDayIndex === weekDates.length - 1 ? '#D1D5DB' : '#111827'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.menuCardsContainer}
        contentContainerStyle={styles.menuCardsContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {groupedMenus.length === 0 ? (
          <View style={styles.emptyMenusContainer}>
            <UtensilsCrossed size={48} color="#9CA3AF" />
            <Text style={styles.emptyMenusText}>
              Aucun menu disponible pour ce jour
            </Text>
          </View>
        ) : (
          groupedMenus.map((menu, index) => {
            const cardColor = menu.card_color || getCardColor(index);
            const textColor = isLightColor(cardColor) ? '#1F2937' : '#FFFFFF';

            return (
              <View
                key={`${menu.id}-${index}`}
                style={[styles.menuCard, { backgroundColor: cardColor }]}
              >
                <View style={styles.menuCardHeader}>
                  <View style={styles.menuCardTitleContainer}>
                    <View style={styles.menuCardTitleContent}>
                      <Text style={[styles.menuCardTitle, { color: textColor }]}>
                        {menu.meal_name}
                      </Text>
                      <View style={[styles.schoolBadgeCalendar, {
                        backgroundColor: textColor === '#FFFFFF' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'
                      }]}>
                        <Text style={[styles.schoolBadgeTextCalendar, { color: textColor }]}>
                          {menu.school_ids.length === totalSchools && totalSchools > 1
                            ? 'Toutes les écoles'
                            : menu.school_names.join(', ')}
                        </Text>
                      </View>
                    </View>
                    {menu.image_url && (
                      <Image
                        source={{ uri: menu.image_url }}
                        style={styles.menuCardImage}
                        resizeMode="cover"
                      />
                    )}
                  </View>
                </View>

                {menu.description && (
                  <>
                    <View style={[styles.menuCardDivider, { backgroundColor: textColor, opacity: 0.2 }]} />
                    <View style={styles.menuCardSection}>
                      <Text style={[styles.menuCardSectionLabel, { color: textColor }]}>Description</Text>
                      <Text style={[styles.menuCardDescription, { color: textColor }]} numberOfLines={3}>
                        {menu.description}
                      </Text>
                    </View>
                  </>
                )}

                <View style={[styles.menuCardDivider, { backgroundColor: textColor, opacity: 0.2 }]} />

                <View style={styles.menuCardFooter}>
                  <View style={[styles.orderCountBadge, { backgroundColor: '#111827' }]}>
                    <ChefHat size={20} color="#FFFFFF" />
                    <View style={styles.orderCountContent}>
                      <Text style={[styles.orderCountText, { color: '#FFFFFF' }]}>
                        {menu.order_count}
                      </Text>
                      <Text style={[styles.orderCountLabel, { color: '#FFFFFF' }]}>
                        menus à préparer
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.viewOrdersButton, { backgroundColor: textColor === '#FFFFFF' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)' }]}
                    onPress={() => router.push(`/(provider)/menu-orders?menuId=${menu.id}&menuName=${encodeURIComponent(menu.meal_name)}&date=${selectedDate}`)}
                  >
                    <ChevronRightIcon size={24} color={textColor} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
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
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    zIndex: 100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  fixedDaySelector: {
    backgroundColor: '#F9FAFB',
    paddingBottom: 8,
    zIndex: 1,
  },
  daySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 16,
  },
  navArrow: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  daysContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    justifyContent: 'center',
  },
  dayTab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  dayTabAdjacent: {
    backgroundColor: 'transparent',
  },
  dayTabSelected: {
    backgroundColor: '#111827',
    paddingHorizontal: 24,
    paddingVertical: 16,
    minWidth: 120,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    borderRadius: 20,
  },
  dayTabFullName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  dayTabDate: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 36,
  },
  dayTabMonth: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 2,
    letterSpacing: 1,
  },
  dayTabTextAdjacent: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  menuCardsContainer: {
    flex: 1,
  },
  menuCardsContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  emptyMenusContainer: {
    paddingVertical: 60,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyMenusText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 16,
    textAlign: 'center',
  },
  menuCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    minHeight: 180,
  },
  menuCardHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  menuCardTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  menuCardTitleContent: {
    flex: 1,
  },
  menuCardTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  menuCardImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  schoolBadgeCalendar: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  schoolBadgeTextCalendar: {
    fontSize: 13,
    fontWeight: '600',
  },
  menuCardDivider: {
    height: 1,
    marginHorizontal: 24,
  },
  menuCardSection: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  menuCardSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    opacity: 0.7,
  },
  menuCardDescription: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.85,
  },
  menuCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  orderCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  orderCountContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderCountText: {
    fontSize: 20,
    fontWeight: '700',
  },
  orderCountLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
  },
  viewOrdersButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
});
