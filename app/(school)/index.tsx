import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Animated, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Menu, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { MenuIcon, UtensilsCrossed, ChevronLeft, ChevronRight, LogOut, Users, History, Share2, Building2 } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

const WhatsAppIcon = ({ size = 22, color = '#25D366' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      fill={color}
    />
  </Svg>
);

interface MenuWithOrderCount extends Menu {
  order_count: number;
}

const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SchoolDashboard() {
  const [school, setSchool] = useState<School | null>(null);
  const [menus, setMenus] = useState<MenuWithOrderCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [weekMenus, setWeekMenus] = useState<{[key: string]: MenuWithOrderCount[]}>({});
  const [isMenuCardOpen, setIsMenuCardOpen] = useState(false);
  const dayScaleAnim = useRef(new Animated.Value(1)).current;
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedDate && weekMenus[selectedDate]) {
      setMenus(weekMenus[selectedDate]);
    }
  }, [weekMenus, selectedDate]);

  const loadData = async () => {
    try {
      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }

      setSchool(currentSchool);

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

      const { data: menusData } = await supabase
        .from('menus')
        .select('*')
        .eq('school_id', currentSchool.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('available', true)
        .order('date')
        .order('meal_name');

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

  const toggleMenuCard = () => {
    setIsMenuCardOpen(!isMenuCardOpen);
  };

  const handleWhatsAppContact = () => {
    const phoneNumber = '33612345678';
    const message = encodeURIComponent('Bonjour, j\'ai une question concernant les repas scolaires.');
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    Linking.openURL(whatsappUrl).catch(() => {});
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
        <View style={styles.menuButtonContainer}>
          <TouchableOpacity style={styles.headerButton} onPress={toggleMenuCard}>
            <MenuIcon size={24} color="#111827" />
          </TouchableOpacity>

          {isMenuCardOpen && (
            <View style={styles.dropdownCard}>
              <TouchableOpacity
                style={[styles.dropdownItem, styles.dropdownItemFirst]}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(school)/commander');
                }}
              >
                <UtensilsCrossed size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Commander</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(school)/students');
                }}
              >
                <Users size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Liste des élèves</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(school)/history');
                }}
              >
                <History size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Voir l'historique</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(school)/share-access');
                }}
              >
                <Share2 size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Partager accès</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  router.push('/(school)/account');
                }}
              >
                <Building2 size={22} color="#4B5563" />
                <Text style={styles.dropdownItemText}>Mon établissement</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setIsMenuCardOpen(false);
                  handleWhatsAppContact();
                }}
              >
                <WhatsAppIcon size={22} color="#25D366" />
                <Text style={styles.dropdownItemText}>Contact WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dropdownItem, styles.dropdownItemLogout, styles.dropdownItemLast]}
                onPress={async () => {
                  setIsMenuCardOpen(false);
                  await authService.signOut();
                  router.replace('/auth');
                }}
              >
                <LogOut size={22} color="#EF4444" />
                <Text style={[styles.dropdownItemText, styles.dropdownItemLogoutText]}>Déconnexion</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.schoolButton} onPress={() => router.push('/(school)/account')}>
          <Building2 size={24} color="#111827" />
        </TouchableOpacity>
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
        {menus.length === 0 ? (
          <View style={styles.emptyMenusContainer}>
            <UtensilsCrossed size={48} color="#9CA3AF" />
            <Text style={styles.emptyMenusText}>
              Aucun menu disponible pour ce jour
            </Text>
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
                <View style={styles.menuCardHeader}>
                  <Text style={[styles.menuCardTitle, { color: textColor }]}>
                    {menu.meal_name}
                  </Text>
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
                    <Users size={20} color="#FFFFFF" />
                    <Text style={[styles.orderCountText, { color: '#FFFFFF' }]}>
                      {menu.order_count}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.viewOrdersButton, { backgroundColor: '#111827' }]}
                    onPress={() => {
                      router.push({
                        pathname: '/(school)/orders',
                        params: {
                          menuId: menu.id,
                          menuName: menu.meal_name,
                          date: selectedDate
                        }
                      });
                    }}
                  >
                    <Text style={[styles.viewOrdersButtonText, { color: '#FFFFFF' }]}>
                      Voir les commandes
                    </Text>
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
  headerButton: {
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
  schoolButton: {
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
  menuCardImage: {
    width: '100%',
    height: 200,
  },
  menuCardHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  menuCardTitle: {
    fontSize: 28,
    fontWeight: '700',
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
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  orderCountText: {
    fontSize: 20,
    fontWeight: '700',
  },
  viewOrdersButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  viewOrdersButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  menuButtonContainer: {
    position: 'relative',
    zIndex: 101,
  },
  dropdownCard: {
    position: 'absolute',
    top: 48,
    left: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
    minWidth: 220,
    zIndex: 102,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  dropdownItemFirst: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dropdownItemLast: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
  },
  dropdownItemLogout: {
    backgroundColor: '#FEF2F2',
  },
  dropdownItemLogoutText: {
    color: '#EF4444',
    fontWeight: '600',
  },
});
