import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Animated, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Menu, Provider } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Download, ChefHat, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

interface MenuWithOrderCount extends Menu {
  order_count: number;
  school_name?: string;
}

const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function PreparationScreen() {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [menus, setMenus] = useState<MenuWithOrderCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const dayScaleAnim = useRef(new Animated.Value(1)).current;
  const router = useRouter();

  useEffect(() => {
    initializeDates();
  }, []);

  useEffect(() => {
    if (selectedDate && provider) {
      loadMenusForDate();
    }
  }, [selectedDate, provider]);

  const initializeDates = async () => {
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
  };

  const loadMenusForDate = async () => {
    if (!provider || !selectedDate) return;

    try {
      setLoading(true);

      const { data: schoolAccess } = await supabase
        .from('provider_school_access')
        .select('school_id')
        .eq('provider_id', provider.id);

      const schoolIds = schoolAccess?.map(sa => sa.school_id) || [];

      let menusData: any[] = [];
      if (schoolIds.length > 0) {
        const { data } = await supabase
          .from('menus')
          .select('*, schools(name)')
          .in('school_id', schoolIds)
          .eq('date', selectedDate)
          .eq('available', true)
          .order('meal_name');
        menusData = data || [];
      }

      const menusWithCounts = await Promise.all(
        menusData.map(async (menu) => {
          const { data: reservations } = await supabase
            .from('reservations')
            .select('id')
            .eq('menu_id', menu.id)
            .eq('date', selectedDate);

          return {
            ...menu,
            school_name: (menu.schools as any)?.name,
            order_count: reservations?.length || 0,
          };
        })
      );

      setMenus(menusWithCounts);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    try {
      setExporting(true);

      const csvContent = generateCSV();
      const fileUri = FileSystem.documentDirectory + `preparation_${selectedDate}.csv`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Succès', 'Fichier exporté avec succès');
      }
    } catch (err) {
      console.error('Error exporting:', err);
      Alert.alert('Erreur', 'Impossible d\'exporter le fichier');
    } finally {
      setExporting(false);
    }
  };

  const generateCSV = (): string => {
    const header = 'Menu,École,Nombre de commandes\n';
    const rows = menus
      .map(menu => `"${menu.meal_name}","${menu.school_name || 'N/A'}",${menu.order_count}`)
      .join('\n');
    return header + rows;
  };

  const handleDateSelect = (date: Date, index: number) => {
    const dateString = formatDateToLocal(date);
    setSelectedDate(dateString);
    setSelectedDayIndex(index);

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

  const totalOrders = menus.reduce((sum, menu) => sum + menu.order_count, 0);

  const getCardColor = (index: number) => {
    const colors = ['#BAE6FD', '#A7F3D0', '#FEF3C7', '#DDD6FE'];
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
        <ActivityIndicator size="large" color="#111827" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Menus à préparer</Text>
        <View style={styles.headerRight} />
      </View>

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

      <View style={styles.summaryCard}>
        <ChefHat size={32} color="#111827" />
        <View style={styles.summaryContent}>
          <Text style={styles.summaryLabel}>Total à préparer aujourd'hui</Text>
          <Text style={styles.summaryCount}>{totalOrders} commandes</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
        onPress={exportToExcel}
        disabled={exporting}
      >
        {exporting ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Download size={20} color="#FFFFFF" />
            <Text style={styles.exportButtonText}>Exporter en Excel</Text>
          </>
        )}
      </TouchableOpacity>

      <ScrollView
        style={styles.menuList}
        contentContainerStyle={styles.menuListContent}
        showsVerticalScrollIndicator={false}
      >
        {menus.length === 0 ? (
          <View style={styles.emptyContainer}>
            <ChefHat size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>Aucun menu à préparer aujourd'hui</Text>
          </View>
        ) : (
          menus.map((menu, index) => {
            const cardColor = menu.card_color || getCardColor(index);
            const textColor = isLightColor(cardColor) ? '#1F2937' : '#FFFFFF';

            return (
              <View
                key={menu.id}
                style={[styles.menuCard, { backgroundColor: cardColor }]}
              >
                {menu.image_url && (
                  <Image
                    source={{ uri: menu.image_url }}
                    style={styles.menuCardImage}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.menuCardContent}>
                  <View style={styles.menuCardLeft}>
                    <Text style={[styles.menuCardTitle, { color: textColor }]}>
                      {menu.meal_name}
                    </Text>
                    {menu.school_name && (
                      <Text style={[styles.menuCardSchool, { color: textColor, opacity: 0.7 }]}>
                        {menu.school_name}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.orderBadge, { backgroundColor: '#111827' }]}>
                    <Text style={styles.orderBadgeText}>{menu.order_count}</Text>
                  </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
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
  },
  headerRight: {
    width: 40,
  },
  daySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 16,
    backgroundColor: '#F9FAFB',
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
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  summaryCount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  exportButton: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  menuList: {
    flex: 1,
  },
  menuListContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
    paddingVertical: 60,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 16,
    textAlign: 'center',
  },
  menuCard: {
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  menuCardImage: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    zIndex: 10,
  },
  menuCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingRight: 110,
  },
  menuCardLeft: {
    flex: 1,
  },
  menuCardTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  menuCardSchool: {
    fontSize: 14,
    fontWeight: '600',
  },
  orderBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  orderBadgeText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
