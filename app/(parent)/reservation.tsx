import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Animated, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Child, Menu, Parent, Reservation, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { AlertCircle, ChevronUp, ChevronLeft, ChevronRight, ShoppingCart, UserPlus, School as SchoolIcon, ArrowLeft, UtensilsCrossed } from 'lucide-react-native';

const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ParentDashboard() {
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [weekMenus, setWeekMenus] = useState<{[key: string]: Menu[]}>({});
  const [isReservationExpanded, setIsReservationExpanded] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(0);
  const reservationHeight = useRef(new Animated.Value(90)).current;
  const dayScaleAnim = useRef(new Animated.Value(1)).current;
  const router = useRouter();
  const screenHeight = Dimensions.get('window').height;
  const expandedHeight = screenHeight * 0.6;
  const collapsedHeight = 90;

  const loadCartCount = async (parentId: string) => {
    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('id')
        .eq('parent_id', parentId);

      if (!error && data) {
        setCartItemCount(data.length);
      }
    } catch (err) {
      console.error('Error loading cart count:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (parent?.id) {
      loadCartCount(parent.id);

      const interval = setInterval(() => {
        loadCartCount(parent.id);
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [parent?.id]);

  useEffect(() => {
    if (selectedDate && weekMenus[selectedDate]) {
      setMenus(weekMenus[selectedDate]);
    }
  }, [weekMenus, selectedDate]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent) {
        router.replace('/auth');
        return;
      }

      setParent(currentParent);

      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('*')
        .eq('parent_id', currentParent.id)
        .order('first_name');

      if (childrenError) throw childrenError;

      setChildren(childrenData || []);

      const schoolIds = new Set<string>();
      if (currentParent.school_id) {
        schoolIds.add(currentParent.school_id);
      }
      childrenData?.forEach(c => {
        if (c.school_id) schoolIds.add(c.school_id);
      });

      if (schoolIds.size > 0) {
        const { data: schoolsData } = await supabase
          .from('schools')
          .select('*')
          .in('id', Array.from(schoolIds))
          .order('name');

        setSchools(schoolsData || []);
      } else {
        setSchools([]);
      }

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

      setError('');
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMenusForChild = async (child: Child) => {
    if (!child.school_id) return;

    try {
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

      const menusMap: {[key: string]: Menu[]} = {};
      const startDate = formatDateToLocal(dates[0]);
      const endDate = formatDateToLocal(dates[dates.length - 1]);

      const { data: menusData, error: menusError } = await supabase
        .from('menus')
        .select('*')
        .eq('school_id', child.school_id)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('available', true)
        .order('date')
        .order('meal_name');

      if (!menusError) {
        dates.forEach((date) => {
          const dateString = formatDateToLocal(date);
          const dayMenus = (menusData || []).filter(menu => menu.date === dateString);
          menusMap[dateString] = dayMenus;
        });

        setWeekMenus(menusMap);
      }

      if (parent) {
        await loadWeekReservationsForDates(parent.id, dates);
      }
    } catch (err) {
      console.error('Error loading menus:', err);
      setError('Erreur lors du chargement des menus');
    }
  };

  const handleChildSelect = (child: Child) => {
    setSelectedChild(child);
    loadMenusForChild(child);
  };

  const loadWeekReservationsForDates = async (parentId: string, dates: Date[]) => {
    try {
      if (!dates || dates.length === 0) {
        setReservations([]);
        return;
      }

      const startDate = formatDateToLocal(dates[0]);
      const endDate = formatDateToLocal(dates[dates.length - 1]);

      const { data: reservationsData, error } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          children:child_id (
            first_name,
            last_name
          ),
          menus:menu_id (
            meal_name,
            date,
            price
          )
        `)
        .eq('parent_id', parentId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date');

      if (error) throw error;

      setReservations(reservationsData || []);
    } catch (err) {
      console.error('Error loading reservations:', err);
      setReservations([]);
    }
  };

  const loadWeekReservations = async (parentId: string) => {
    if (weekDates && weekDates.length > 0) {
      await loadWeekReservationsForDates(parentId, weekDates);
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

  const getTextColor = (index: number) => {
    const colors = [
      '#4338CA',
      '#991B1B',
      '#065F46',
      '#9A3412',
      '#5B21B6',
      '#9F1239',
      '#075985',
    ];
    return colors[index % colors.length];
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return `${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
  };

  const toggleReservationExpansion = () => {
    const toValue = isReservationExpanded ? collapsedHeight : expandedHeight;
    setIsReservationExpanded(!isReservationExpanded);
    Animated.spring(reservationHeight, {
      toValue,
      useNativeDriver: false,
      friction: 8,
      tension: 40,
    }).start();
  };

  const handleBackToChildrenList = () => {
    setSelectedChild(null);
    setMenus([]);
    setWeekMenus({});
    setReservations([]);
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
        <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/(parent)')}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.rightButtons}>
          <TouchableOpacity
            style={styles.addChildPill}
            onPress={() => router.push('/(parent)/add-child')}
          >
            <UserPlus size={16} color="#FFFFFF" />
            <Text style={styles.addChildPillText}>Ajouter un enfant</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(parent)/cart')}
          >
            <View>
              <ShoppingCart size={24} color="#111827" />
              {cartItemCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <AlertCircle size={20} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {!selectedChild && children.length === 0 ? (
        <View style={styles.emptyState}>
          <UtensilsCrossed size={48} color="#9CA3AF" />
          <Text style={styles.emptyStateTitle}>Aucun enfant enregistré</Text>
          <Text style={styles.emptyStateText}>
            Ajoutez un enfant dans votre profil pour commencer
          </Text>
        </View>
      ) : !selectedChild ? (
        <ScrollView
          style={styles.childrenListContainer}
          contentContainerStyle={styles.childrenListContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.childrenListHeader}>
            <Text style={styles.childrenListTitle}>Sélectionnez un enfant</Text>
            <Text style={styles.childrenListSubtitle}>
              Choisissez l'enfant pour lequel vous souhaitez réserver un menu
            </Text>
          </View>
          {children.map((child, index) => (
            <TouchableOpacity
              key={child.id}
              style={styles.childCard}
              onPress={() => handleChildSelect(child)}
            >
              <View style={styles.childCardAvatar}>
                <Text style={styles.childCardAvatarText}>
                  {child.first_name.charAt(0)}{child.last_name.charAt(0)}
                </Text>
              </View>
              <View style={styles.childCardInfo}>
                <Text style={styles.childCardName}>
                  {child.first_name} {child.last_name}
                </Text>
                {child.class_name && (
                  <Text style={styles.childCardClass}>
                    {child.class_name}
                  </Text>
                )}
              </View>
              <ChevronRight size={24} color="#9CA3AF" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <>
          <View style={styles.selectedChildBanner}>
            <TouchableOpacity
              style={styles.selectedChildPill}
              onPress={handleBackToChildrenList}
            >
              <View style={styles.pillAvatar}>
                <Text style={styles.pillAvatarText}>
                  {selectedChild.first_name.charAt(0)}{selectedChild.last_name.charAt(0)}
                </Text>
              </View>
              <Text style={styles.pillName}>
                {selectedChild.first_name} {selectedChild.last_name}
              </Text>
              <ChevronLeft size={18} color="#FFFFFF" style={styles.pillIcon} />
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

                  console.log('Menu:', menu.meal_name, 'has image_url:', menu.image_url);

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
                        <View style={styles.priceContainer}>
                          <Text style={[styles.priceLabelText, { color: textColor }]}>Prix</Text>
                          <Text style={[styles.menuCardPrice, { color: textColor }]}>
                            {menu.price.toFixed(2)} €
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.menuCardButton, { backgroundColor: textColor }]}
                          onPress={() => {
                            if (!selectedChild || !selectedDate) return;
                            router.push({
                              pathname: '/(parent)/menu-details',
                              params: {
                                menuId: menu.id,
                                childId: selectedChild.id,
                                date: selectedDate,
                              }
                            });
                          }}
                        >
                          <Text style={[styles.menuCardButtonText, { color: '#FFFFFF' }]}>
                            Réserver
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
          </ScrollView>
        </>
      )}

      <Animated.View style={[styles.reservationsSection, { height: reservationHeight }]}>
        <View style={styles.reservationsCard}>
          <View style={styles.reservationHeader}>
            <Text style={styles.reservationsSectionTitle}>Réservations de la semaine</Text>
            <TouchableOpacity
              style={styles.expandButton}
              onPress={toggleReservationExpansion}
            >
              <Animated.View style={{
                transform: [{
                  rotate: reservationHeight.interpolate({
                    inputRange: [collapsedHeight, expandedHeight],
                    outputRange: ['0deg', '180deg'],
                  })
                }]
              }}>
                <ChevronUp size={24} color="#111827" />
              </Animated.View>
            </TouchableOpacity>
          </View>
          {reservations.length === 0 ? (
            <Text style={styles.noReservationsText}>
              Vous n'avez pas encore réservé de repas
            </Text>
          ) : (
            <ScrollView
              style={styles.reservationsScroll}
              showsVerticalScrollIndicator={false}
            >
              {reservations.map((reservation: any, index: number) => {
                const pastelColors = [
                  { bg: '#FFE5E5', left: '#FF9999', dash: '#FFCCCC', price: '#FFB3B3' },
                  { bg: '#E5F5FF', left: '#99D6FF', dash: '#CCE9FF', price: '#B3DFFF' },
                  { bg: '#FFF4E5', left: '#FFCC99', dash: '#FFE5CC', price: '#FFD9B3' },
                  { bg: '#F0E5FF', left: '#CC99FF', dash: '#E5CCFF', price: '#D9B3FF' },
                  { bg: '#E5FFE5', left: '#99FF99', dash: '#CCFFCC', price: '#B3FFB3' },
                  { bg: '#FFE5F5', left: '#FF99CC', dash: '#FFCCE5', price: '#FFB3D9' },
                ];
                const colors = pastelColors[index % pastelColors.length];

                const reservationDate = reservation.date || reservation.menus?.date;
                const childData = reservation.children || {};
                const menuData = reservation.menus || {};

                return (
                  <View key={reservation.id} style={[styles.couponCard, { backgroundColor: colors.bg }]}>
                    <View style={[styles.couponLeft, { backgroundColor: colors.left }]}>
                      <View style={styles.couponDateBadge}>
                        <Text style={styles.couponDay}>
                          {new Date(reservationDate).getDate()}
                        </Text>
                        <Text style={styles.couponMonth}>
                          {new Date(reservationDate).toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.couponDivider}>
                      <View style={styles.couponCircleTop} />
                      <View style={styles.dashedLineContainer}>
                        {Array.from({ length: 8 }).map((_, i) => (
                          <View key={i} style={[styles.dash, { backgroundColor: colors.dash }]} />
                        ))}
                      </View>
                      <View style={styles.couponCircleBottom} />
                    </View>

                    <View style={styles.couponRight}>
                      <View style={styles.couponContent}>
                        <Text style={styles.couponChildName}>
                          {childData.first_name} {childData.last_name}
                        </Text>
                        <Text style={styles.couponMealName}>
                          {menuData.meal_name}
                        </Text>
                        <Text style={styles.couponDate}>
                          {formatFullDate(reservationDate)}
                        </Text>
                      </View>
                      <View style={[styles.couponPriceTag, { backgroundColor: colors.price }]}>
                        <Text style={styles.couponPrice}>
                          {Number(menuData.price || 0).toFixed(2)} €
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Animated.View>
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
  cartBadge: {
    position: 'absolute',
    top: -16,
    right: -16,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  fixedDaySelector: {
    backgroundColor: '#F9FAFB',
    paddingBottom: 8,
    zIndex: 1,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    padding: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    gap: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    flex: 1,
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
    paddingBottom: 120,
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
  priceContainer: {
    flex: 1,
  },
  priceLabelText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    opacity: 0.7,
  },
  menuCardPrice: {
    fontSize: 32,
    fontWeight: '700',
  },
  menuCardButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  menuCardButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  reservationsSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  reservationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reservationsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  expandButton: {
    padding: 4,
  },
  reservationsCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    flex: 1,
  },
  reservationsScroll: {
    flex: 1,
  },
  noReservationsText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
  couponCard: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  couponLeft: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  couponDateBadge: {
    alignItems: 'center',
  },
  couponDay: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 36,
  },
  couponMonth: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
    opacity: 0.8,
  },
  couponDivider: {
    width: 16,
    position: 'relative',
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  couponCircleTop: {
    position: 'absolute',
    top: -12,
    left: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  couponCircleBottom: {
    position: 'absolute',
    bottom: -12,
    left: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  dashedLineContainer: {
    flex: 1,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: 8,
  },
  dash: {
    width: 3,
    height: 6,
    borderRadius: 1.5,
  },
  couponRight: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  couponContent: {
    flex: 1,
  },
  couponChildName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  couponMealName: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 6,
  },
  couponDate: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  couponPriceTag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
  },
  couponPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  emptyState: {
    alignItems: 'center',
    padding: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
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
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addChildPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111827',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addChildPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  childrenListContainer: {
    flex: 1,
  },
  childrenListContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 120,
  },
  childrenListHeader: {
    marginBottom: 24,
  },
  childrenListTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  childrenListSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
  },
  childCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  childCardAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  childCardAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  childCardInfo: {
    flex: 1,
  },
  childCardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  childCardClass: {
    fontSize: 14,
    color: '#6B7280',
  },
  selectedChildBanner: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    alignItems: 'flex-start',
  },
  selectedChildPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 16,
    borderRadius: 24,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  pillAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  pillName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pillIcon: {
    marginLeft: 4,
  },
  schoolsSection: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  schoolsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  schoolsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  schoolItem: {
    paddingVertical: 6,
    paddingLeft: 26,
  },
  schoolItemName: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
});
