import {
  Avatar,
  CartButton,
  CategoryIcon,
  Header,
  MenuPhoto,
  PrimaryButton,
  ui,
  palette,
  type,
} from '@/components/parent/OrderingUI';
import {
  matchesMealCategory,
  getMealCategory,
  type MealCategory,
} from '@/lib/meal-category';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase, Child, Menu, Parent, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { parseYmd } from '@/lib/dates';
import { getFirstBookableYmd } from '@/lib/order-time';
import { ChevronLeft, ChevronRight, UserPlus } from 'lucide-react-native';

const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getFirstBookableDate = (): Date => parseYmd(getFirstBookableYmd());

export default function ParentDashboard() {
  const {
    childId: preselectedChildId,
    selectChild,
    date: requestedDate,
    category: requestedCategory,
  } = useLocalSearchParams<{
    childId?: string;
    selectChild?: string;
    date?: string;
    category?: string;
  }>();
  const appliedSelectionRequest = useRef<string | null>(null);
  const preferredDate = useRef<string | undefined>(requestedDate);
  const dataLoadRequest = useRef(0);
  const menuLoadRequest = useRef(0);
  const [parent, setParent] = useState<Parent | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<Child | null>(null);
  const selectedChildRef = useRef<Child | null>(null);
  selectedChildRef.current = selectedChild;
  const [schools, setSchools] = useState<School[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [weekMenus, setWeekMenus] = useState<{ [key: string]: Menu[] }>({});
  const [cartItemCount, setCartItemCount] = useState(0);
  const [menusLoading, setMenusLoading] = useState(false);
  const [cartTotal, setCartTotal] = useState(0);
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState<MealCategory>(
    getMealCategory(requestedCategory),
  );
  const selectedSchool = schools.find(
    (school) => school.id === selectedChild?.school_id,
  );
  const schoolClosed = !!(
    selectedDate &&
    selectedSchool?.closed_weekdays?.includes(parseYmd(selectedDate).getDay())
  );
  const visibleMenus = schoolClosed
    ? []
    : menus.filter((menu) =>
        matchesMealCategory(menu.meal_category, categoryFilter),
      );

  const loadCartCount = async (parentId: string) => {
    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('id, total_price')
        .eq('parent_id', parentId);

      if (!error && data) {
        setCartItemCount(data.length);
        setCartTotal(
          data.reduce((sum, item) => sum + Number(item.total_price), 0),
        );
      }
    } catch (err) {
      console.error('Error loading cart count:', err);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        dataLoadRequest.current++;
        menuLoadRequest.current++;
      };
    }, [preselectedChildId, selectChild, requestedDate, requestedCategory]),
  );

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
    const requestId = ++dataLoadRequest.current;
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (requestId !== dataLoadRequest.current) return;
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

      if (requestId !== dataLoadRequest.current) return;
      if (childrenError) throw childrenError;

      setChildren(childrenData || []);

      // Refresh the selected child too: its school may have changed while away.
      // Consume route instructions once; returning from a menu must not restore
      // the former child after the parent explicitly opened the child selector.
      const request = `${selectChild || ''}:${preselectedChildId || ''}:${requestedDate || ''}:${requestedCategory || ''}`;
      const newRequest = appliedSelectionRequest.current !== request;
      appliedSelectionRequest.current = request;
      if (newRequest) setCategoryFilter(getMealCategory(requestedCategory));
      if (newRequest && requestedDate) preferredDate.current = requestedDate;
      const activeChildId =
        newRequest && selectChild
          ? undefined
          : (newRequest && preselectedChildId) || selectedChildRef.current?.id;
      if (!activeChildId) {
        menuLoadRequest.current++;
        selectedChildRef.current = null;
        setSelectedChild(null);
        setMenus([]);
        setWeekMenus({});
      }
      if (activeChildId && childrenData) {
        const match = childrenData.find((c) => c.id === activeChildId);
        if (match) {
          selectedChildRef.current = match;
          setSelectedChild(match);
          setMenus([]);
          setWeekMenus({});
          loadMenusForChild(match);
        } else {
          menuLoadRequest.current++;
          selectedChildRef.current = null;
          setSelectedChild(null);
          setMenus([]);
          setWeekMenus({});
        }
      }

      const schoolIds = new Set<string>();
      if (currentParent.school_id) {
        schoolIds.add(currentParent.school_id);
      }
      childrenData?.forEach((c) => {
        if (c.school_id) schoolIds.add(c.school_id);
      });

      if (schoolIds.size > 0) {
        const { data: schoolsData } = await supabase
          .from('schools')
          .select(
            'id, name, address, contact_email, contact_phone, user_id, is_school_user, created_at, closed_weekdays',
          )
          .in('id', Array.from(schoolIds))
          .order('name');

        if (requestId !== dataLoadRequest.current) return;
        setSchools(schoolsData || []);
      } else {
        setSchools([]);
      }

      const dates: Date[] = [];
      const start = getFirstBookableDate();

      for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        dates.push(date);
      }

      setWeekDates(dates);
      const dayIndex = Math.max(
        0,
        dates.findIndex(
          (day) => formatDateToLocal(day) === preferredDate.current,
        ),
      );
      setSelectedDayIndex(dayIndex);
      setSelectedDate(formatDateToLocal(dates[dayIndex]));

      setError('');
    } catch (err) {
      if (requestId !== dataLoadRequest.current) return;
      console.error('Error loading data:', err);
      setError('Erreur lors du chargement des données');
    } finally {
      if (requestId === dataLoadRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const loadMenusForChild = async (child: Child) => {
    if (!child.school_id || selectedChildRef.current?.id !== child.id) return;
    const requestId = ++menuLoadRequest.current;
    setMenusLoading(true);
    setError('');

    try {
      const dates: Date[] = [];
      const start = getFirstBookableDate();

      for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        dates.push(date);
      }

      setWeekDates(dates);
      const dayIndex = Math.max(
        0,
        dates.findIndex(
          (day) => formatDateToLocal(day) === preferredDate.current,
        ),
      );
      setSelectedDayIndex(dayIndex);
      setSelectedDate(formatDateToLocal(dates[dayIndex]));

      const menusMap: { [key: string]: Menu[] } = {};
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

      if (
        requestId !== menuLoadRequest.current ||
        selectedChildRef.current?.id !== child.id
      )
        return;
      if (menusError) throw menusError;
      {
        dates.forEach((date) => {
          const dateString = formatDateToLocal(date);
          const dayMenus = (menusData || []).filter(
            (menu) => menu.date === dateString,
          );
          menusMap[dateString] = dayMenus;
        });

        setWeekMenus(menusMap);
      }
    } catch (err) {
      if (requestId !== menuLoadRequest.current) return;
      console.error('Error loading menus:', err);
      setError('Erreur lors du chargement des menus. Réessayez.');
    } finally {
      if (requestId === menuLoadRequest.current) setMenusLoading(false);
    }
  };

  const handleChildSelect = (child: Child) => {
    selectedChildRef.current = child;
    setSelectedChild(child);
    setMenus([]);
    setWeekMenus({});
    loadMenusForChild(child);
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleDateSelect = (date: Date, index: number) => {
    const dateString = formatDateToLocal(date);
    preferredDate.current = dateString;
    setSelectedDate(dateString);
    setSelectedDayIndex(index);
    const dayMenus = weekMenus[dateString] || [];
    setMenus(dayMenus);
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const newIndex =
      direction === 'prev'
        ? Math.max(0, selectedDayIndex - 1)
        : Math.min(weekDates.length - 1, selectedDayIndex + 1);

    if (newIndex !== selectedDayIndex) {
      handleDateSelect(weekDates[newIndex], newIndex);
    }
  };

  const getVisibleDays = () => {
    const start = Math.max(
      0,
      Math.min(selectedDayIndex - 1, weekDates.length - 3),
    );
    return weekDates
      .slice(start, start + 3)
      .map((date, offset) => ({ date, index: start + offset }));
  };

  const handleBackToChildrenList = () => {
    menuLoadRequest.current++;
    selectedChildRef.current = null;
    setSelectedChild(null);
    setMenus([]);
    setWeekMenus({});
  };

  if (loading)
    return (
      <SafeAreaView style={ui.center}>
        <ActivityIndicator color={palette.blue} size="large" />
      </SafeAreaView>
    );

  const cartAction = () => router.push('/(parent)/cart');
  const cartSummary = (
    <View style={[ui.footer, wide && styles.desktopBasket]}>
      {wide && (
        <>
          <Text style={ui.eyebrow}>VOTRE COMMANDE</Text>
          <Text style={ui.sectionTitle}>Mon panier</Text>
          <Text style={ui.body}>
            Les repas et la Snackerie de tous vos enfants, au même endroit.
          </Text>
        </>
      )}
      {cartItemCount > 0 ? (
        <>
          <View style={ui.spread}>
            <Text style={ui.small}>
              {cartItemCount} article{cartItemCount > 1 ? 's' : ''} au panier
            </Text>
            <Text style={ui.strong}>{cartTotal.toFixed(2)} DH</Text>
          </View>
          <PrimaryButton label="Voir mon panier" onPress={cartAction} />
        </>
      ) : (
        <Text style={[ui.small, { textAlign: 'center' }]}>
          Votre panier vous attend. Choisissez votre premier repas.
        </Text>
      )}
    </View>
  );
  return (
    <SafeAreaView style={ui.page} edges={['top', 'bottom']}>
      <Header
        title={selectedChild ? 'Composez sa journée' : 'Pour quel enfant ?'}
        back={() =>
          selectedChild
            ? handleBackToChildrenList()
            : router.replace('/(parent)')
        }
        right={<CartButton count={cartItemCount} onPress={cartAction} />}
      />
      {error ? (
        <View style={ui.error}>
          <Text style={ui.errorText}>{error}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={onRefresh}
            style={{ paddingTop: 12 }}
          >
            <Text style={ui.link}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!selectedChild ? (
        <>
          <ScrollView
            contentContainerStyle={styles.picker}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <View style={[ui.row, { marginBottom: 20 }]}>
              <CategoryIcon category={categoryFilter} size={19} />
              <Text style={ui.eyebrow}>
                {categoryFilter === 'snack' ? 'SNACKERIE' : 'MENUS CLASSIQUES'}
              </Text>
            </View>
            <Text style={ui.title}>À chacun son repas.</Text>
            <Text style={[ui.body, { marginTop: 8, marginBottom: 26 }]}>
              Choisissez l’enfant pour lequel vous commandez.
            </Text>
            {children.map((child) => (
              <TouchableOpacity
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={`Commander pour ${child.first_name} ${child.last_name}`}
                onPress={() => handleChildSelect(child)}
                style={styles.childCard}
              >
                <Avatar
                  firstName={child.first_name}
                  lastName={child.last_name}
                  size={48}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={ui.strong}>
                    {child.first_name} {child.last_name}
                  </Text>
                  <Text style={ui.small}>
                    {[
                      child.grade,
                      schools.find((s) => s.id === child.school_id)?.name,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <ChevronRight size={20} color={palette.blue} />
              </TouchableOpacity>
            ))}
            {!children.length && (
              <View style={ui.card}>
                <Text style={ui.strong}>Aucun enfant enregistré</Text>
                <Text style={[ui.body, { marginTop: 6 }]}>
                  Ajoutez un enfant pour commencer.
                </Text>
              </View>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.push('/(parent)/add-child')}
              style={styles.addChild}
            >
              <UserPlus size={19} color={palette.blue} />
              <Text style={ui.link}>Ajouter un enfant</Text>
            </TouchableOpacity>
          </ScrollView>
          {cartItemCount > 0 && cartSummary}
        </>
      ) : (
        <>
          <View style={styles.orderingFrame}>
            <View style={styles.catalogue}>
              <View style={styles.context}>
                <Avatar
                  firstName={selectedChild.first_name}
                  lastName={selectedChild.last_name}
                  size={36}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[ui.strong, { fontSize: 13 }]}>
                    Pour {selectedChild.first_name}
                    {selectedChild.grade ? ` · ${selectedChild.grade}` : ''}
                  </Text>
                  <Text style={[ui.small, { fontSize: 10 }]} numberOfLines={1}>
                    {selectedSchool?.name || 'École de votre enfant'}
                  </Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Changer d’enfant"
                  onPress={handleBackToChildrenList}
                  style={styles.change}
                >
                  <Text style={ui.link}>Changer</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.dates}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Jour précédent"
                  disabled={selectedDayIndex === 0}
                  onPress={() => navigateDay('prev')}
                  style={styles.dayArrow}
                >
                  <ChevronLeft
                    size={19}
                    color={selectedDayIndex === 0 ? '#CBD3DE' : palette.ink}
                  />
                </TouchableOpacity>
                {getVisibleDays().map(({ date, index }) => (
                  <TouchableOpacity
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={date.toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                    accessibilityState={{
                      selected: index === selectedDayIndex,
                    }}
                    onPress={() => handleDateSelect(date, index)}
                    style={[
                      styles.day,
                      index === selectedDayIndex && styles.activeDay,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayName,
                        index === selectedDayIndex && styles.white,
                      ]}
                    >
                      {date.toLocaleDateString('fr-FR', { weekday: 'short' })}
                    </Text>
                    <Text
                      style={[
                        styles.dayNumber,
                        index === selectedDayIndex && styles.white,
                      ]}
                    >
                      {date.getDate()}{' '}
                      <Text style={{ fontSize: 10 }}>
                        {date.toLocaleDateString('fr-FR', { month: 'short' })}
                      </Text>
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Jour suivant"
                  disabled={selectedDayIndex === weekDates.length - 1}
                  onPress={() => navigateDay('next')}
                  style={styles.dayArrow}
                >
                  <ChevronRight
                    size={19}
                    color={
                      selectedDayIndex === weekDates.length - 1
                        ? '#CBD3DE'
                        : palette.ink
                    }
                  />
                </TouchableOpacity>
              </View>
              <View style={styles.browse}>
                <View style={[styles.rail, wide && { width: 116 }]}>
                  {(['classic', 'snack'] as const).map((category) => (
                    <TouchableOpacity
                      key={category}
                      accessibilityRole="tab"
                      accessibilityLabel={
                        category === 'snack' ? 'Snackerie' : 'Repas'
                      }
                      accessibilityState={{
                        selected: categoryFilter === category,
                      }}
                      aria-selected={categoryFilter === category}
                      onPress={() => setCategoryFilter(category)}
                      style={[
                        styles.railButton,
                        categoryFilter === category &&
                          (category === 'snack'
                            ? styles.snackActive
                            : styles.classicActive),
                      ]}
                    >
                      <CategoryIcon
                        category={category}
                        size={26}
                        color={
                          categoryFilter === category && category === 'classic'
                            ? '#fff'
                            : palette.ink
                        }
                      />
                      <Text
                        style={[
                          styles.railLabel,
                          categoryFilter === category &&
                            category === 'classic' &&
                            styles.white,
                        ]}
                      >
                        {category === 'snack' ? 'Snackerie' : 'Repas'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.products}
                  showsVerticalScrollIndicator={false}
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                    />
                  }
                >
                  <Text style={ui.eyebrow}>À LA CARTE</Text>
                  <Text
                    style={[ui.sectionTitle, { marginTop: 5, marginBottom: 6 }]}
                  >
                    {categoryFilter === 'snack'
                      ? 'La snackerie'
                      : 'Les repas du jour'}
                  </Text>
                  <Text style={[ui.small, { marginBottom: 16 }]}>
                    {categoryFilter === 'snack'
                      ? 'Une petite envie, un grand sourire.'
                      : 'Des menus pour bien grandir.'}
                  </Text>
                  {menusLoading ? (
                    <ActivityIndicator
                      size="large"
                      color={palette.blue}
                      style={{ marginVertical: 40 }}
                    />
                  ) : !visibleMenus.length ? (
                    <View style={styles.empty}>
                      <CategoryIcon category={categoryFilter} size={34} />
                      <Text style={[ui.strong, { textAlign: 'center' }]}>
                        {schoolClosed
                          ? 'Pas de service ce jour'
                          : categoryFilter === 'snack'
                            ? 'Pas de snackerie ce jour'
                            : 'Aucun menu disponible'}
                      </Text>
                      <Text style={[ui.small, { textAlign: 'center' }]}>
                        Choisissez une autre date
                        {schoolClosed
                          ? '.'
                          : ' ou consultez l’autre catégorie.'}
                      </Text>
                      {!schoolClosed && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() =>
                            setCategoryFilter(
                              categoryFilter === 'snack' ? 'classic' : 'snack',
                            )
                          }
                          style={{ padding: 12 }}
                        >
                          <Text style={ui.link}>
                            {categoryFilter === 'snack'
                              ? 'Voir les repas'
                              : 'Voir la snackerie'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    <View style={styles.productGrid}>
                      {visibleMenus.map((menu) => (
                        <TouchableOpacity
                          key={menu.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Choisir ${menu.meal_name}`}
                          onPress={() =>
                            router.push({
                              pathname: '/(parent)/menu-details',
                              params: {
                                menuId: menu.id,
                                childId: selectedChild.id,
                                date: selectedDate || menu.date,
                              },
                            })
                          }
                          style={[styles.productCard, wide && { width: '48%' }]}
                        >
                          <MenuPhoto
                            uri={menu.image_url}
                            category={getMealCategory(menu.meal_category)}
                            label={menu.meal_name}
                            style={styles.productPhoto}
                          />
                          <View style={styles.productInfo}>
                            <Text style={styles.productName}>
                              {menu.meal_name}
                            </Text>
                            {menu.description ? (
                              <Text
                                style={[ui.small, { fontSize: 11 }]}
                                numberOfLines={2}
                              >
                                {menu.description}
                              </Text>
                            ) : null}
                            <View style={[ui.spread, { marginTop: 9 }]}>
                              <Text style={styles.price}>
                                {Number(menu.price).toFixed(2)}{' '}
                                <Text style={{ fontSize: 11 }}>DH</Text>
                              </Text>
                              <View style={styles.plus}>
                                <Text
                                  style={{
                                    fontSize: 25,
                                    color: '#fff',
                                    lineHeight: 29,
                                  }}
                                >
                                  +
                                </Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
            {wide && cartSummary}
          </View>
          {!wide && cartSummary}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  picker: {
    padding: 24,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    flexGrow: 1,
  },
  childCard: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 22,
    marginBottom: 12,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9EEF6',
  },
  addChild: {
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  orderingFrame: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
  },
  catalogue: { flex: 1, minWidth: 0 },
  context: {
    marginHorizontal: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 18,
  },
  change: { minHeight: 44, justifyContent: 'center', paddingLeft: 6 },
  dates: {
    paddingHorizontal: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayArrow: {
    width: 28,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 15,
    gap: 3,
  },
  activeDay: { backgroundColor: palette.blue },
  dayName: {
    fontFamily: type.medium,
    color: palette.muted,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  dayNumber: { fontFamily: type.heavy, color: palette.ink, fontSize: 18 },
  white: { color: '#fff' },
  browse: { flex: 1, flexDirection: 'row' },
  rail: {
    width: 79,
    backgroundColor: '#ECF0F7',
    paddingHorizontal: 6,
    paddingTop: 10,
    gap: 10,
    borderTopRightRadius: 22,
  },
  railButton: {
    minHeight: 80,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  classicActive: { backgroundColor: palette.blue },
  snackActive: { backgroundColor: palette.peach },
  railLabel: { fontFamily: type.bold, fontSize: 10, color: palette.ink },
  products: { padding: 15, paddingTop: 12, paddingBottom: 24 },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
  },
  productCard: {
    width: '100%',
    borderRadius: 21,
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8EDF5',
  },
  productPhoto: { width: '100%', height: 142 },
  productInfo: { padding: 14, gap: 5 },
  productName: {
    fontFamily: type.heavy,
    color: palette.ink,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.4,
  },
  price: { fontFamily: type.heavy, color: palette.blue, fontSize: 20 },
  plus: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: palette.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopBasket: {
    width: 270,
    margin: 16,
    borderRadius: 24,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: palette.line,
    padding: 20,
    gap: 20,
  },
  empty: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    gap: 13,
  },
});
