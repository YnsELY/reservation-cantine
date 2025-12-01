import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Animated, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase, Menu, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ChevronLeft, ChevronRight, ArrowLeft, Users, UtensilsCrossed, X, ShoppingBag } from 'lucide-react-native';

interface MenuWithOrderCount extends Menu {
  order_count: number;
}

interface OrderDetail {
  id: string;
  child_name: string;
  menu_name: string;
  menu_price: number;
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
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [allOrders, setAllOrders] = useState<OrderDetail[]>([]);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const dayScaleAnim = useRef(new Animated.Value(1)).current;
  const router = useRouter();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedDate && weekMenus[selectedDate]) {
      setMenus(weekMenus[selectedDate]);
      loadAllOrdersForDate(selectedDate);
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
    loadAllOrdersForDate(dateString);

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

  const loadAllOrdersForDate = async (dateString: string) => {
    if (!school) return;

    try {
      const { data: reservations, error } = await supabase
        .from('reservations')
        .select(`
          id,
          children!inner(first_name, last_name),
          menus!inner(meal_name, price)
        `)
        .eq('date', dateString)
        .eq('children.school_id', school.id);

      if (error) throw error;

      const orders: OrderDetail[] = (reservations || []).map(res => ({
        id: res.id,
        child_name: `${res.children.first_name} ${res.children.last_name}`,
        menu_name: res.menus.meal_name,
        menu_price: res.menus.price,
      }));

      orders.sort((a, b) => a.child_name.localeCompare(b.child_name));

      setAllOrders(orders);
      setTotalOrdersCount(orders.length);
    } catch (err) {
      console.error('Error loading all orders:', err);
      setAllOrders([]);
      setTotalOrdersCount(0);
    }
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
        <TouchableOpacity
          style={styles.totalOrdersWidget}
          onPress={() => setShowOrdersModal(true)}
        >
          <View style={styles.totalOrdersIconContainer}>
            <ShoppingBag size={32} color="#FFFFFF" />
          </View>
          <View style={styles.totalOrdersTextContainer}>
            <Text style={styles.totalOrdersCount}>{totalOrdersCount}</Text>
            <Text style={styles.totalOrdersLabel}>Commandes totales</Text>
          </View>
        </TouchableOpacity>

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

      <Modal
        visible={showOrdersModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowOrdersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Toutes les commandes</Text>
              <TouchableOpacity
                onPress={() => setShowOrdersModal(false)}
                style={styles.modalCloseButton}
              >
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {allOrders.length === 0 ? (
                <View style={styles.emptyModalContainer}>
                  <ShoppingBag size={48} color="#9CA3AF" />
                  <Text style={styles.emptyModalText}>
                    Aucune commande pour ce jour
                  </Text>
                </View>
              ) : (
                allOrders.map((order, index) => (
                  <View
                    key={order.id}
                    style={[
                      styles.orderItem,
                      index % 2 === 0 && styles.orderItemEven
                    ]}
                  >
                    <View style={styles.orderItemLeft}>
                      <Text style={styles.orderChildName}>{order.child_name}</Text>
                      <Text style={styles.orderMenuName}>{order.menu_name}</Text>
                    </View>
                    <Text style={styles.orderPrice}>{order.menu_price.toFixed(2)} €</Text>
                  </View>
                ))
              )}
            </ScrollView>

            {allOrders.length > 0 && (
              <View style={styles.modalFooter}>
                <Text style={styles.modalFooterLabel}>Total</Text>
                <Text style={styles.modalFooterTotal}>
                  {allOrders.reduce((sum, order) => sum + order.menu_price, 0).toFixed(2)} €
                </Text>
              </View>
            )}
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
    backgroundColor: '#F9FAFB',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  totalOrdersWidget: {
    backgroundColor: '#FEF3C7',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  totalOrdersIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  totalOrdersTextContainer: {
    flex: 1,
  },
  totalOrdersCount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#92400E',
  },
  totalOrdersLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B45309',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScrollView: {
    maxHeight: 500,
  },
  emptyModalContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyModalText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  orderItemEven: {
    backgroundColor: '#F9FAFB',
  },
  orderItemLeft: {
    flex: 1,
    marginRight: 12,
  },
  orderChildName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  orderMenuName: {
    fontSize: 14,
    color: '#6B7280',
  },
  orderPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  modalFooterLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalFooterTotal: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
});
