import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Parent } from '@/lib/supabase';
import Svg, { Circle } from 'react-native-svg';
import {
  CHILD_RESERVATION_COLORS,
  homeWeekRange,
  summarizeHomeWeek,
  type ChildReservationStatus,
} from '@/lib/parent-home-summary';
import {
  User,
  Clock,
  Wallet,
  ArrowRight,
  UserPlus,
  History,
  Calendar,
  Check,
  UtensilsCrossed,
} from 'lucide-react-native';
import {
  Avatar,
  CartButton,
  RoundButton,
  CategoryIcon,
  ui,
  palette,
  type,
} from '@/components/parent/OrderingUI';
import { orderingRoute } from '@/lib/parent-ordering';
import { type MealCategory } from '@/lib/meal-category';

import { useNotifications } from '@/hooks/useNotifications';
import { showAlert } from '@/lib/alert';
import { getBalance } from '@/lib/credits';
import { consumeCreditAdded } from '@/lib/credit-events';
import { parseYmd } from '@/lib/dates';
import {
  getFirstBookableYmd,
  getMoroccoDate,
  getOrderDeadlineMs,
} from '@/lib/order-time';

interface WeekReservation {
  id: string;
  date: string;
  child_id: string;
  menu_id: string;
  total_price: number;
  payment_status: string;
  children: {
    first_name: string;
    last_name: string;
  };
  menus: {
    meal_name: string;
    description: string | null;
  };
}

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  school_id: string;
}

interface ChildWithStatus extends Child {
  reservationCount: number;
  status: ChildReservationStatus;
}

const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Dates de calendrier pour l'affichage ; l'échéance utilise l'heure du Maroc.
const getFirstBookableDate = (): Date => parseYmd(getFirstBookableYmd());

const getTargetLabel = (target: Date): string => {
  const today = parseYmd(getMoroccoDate());
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  const diffDays = Math.round((t.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 0) return "aujourd'hui";
  if (diffDays === 1) return 'demain';
  return t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
};

function OrderCountdown({
  deadlineMs,
  onExpire,
}: {
  deadlineMs: number;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    setNow(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadlineMs && !firedRef.current) {
        firedRef.current = true;
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const remaining = Math.max(0, deadlineMs - now);
  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={styles.countdownTimer}>
      <Clock size={20} color="#0E5FC0" />
      <Text style={styles.countdownValue}>
        {pad(h)}h {pad(m)}m {pad(s)}s
      </Text>
    </View>
  );
}

function HomeOrderIllustration({
  category,
  size,
}: {
  category: MealCategory;
  size: number;
}) {
  return (
    <View
      testID={`home-illustration-${category}`}
      pointerEvents="none"
      style={[
        styles.heroPhoto,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ rotate: category === 'snack' ? '8deg' : '-8deg' }],
        },
      ]}
    >
      <Image
        source={require('@/assets/illustrations/home-order-illustrations.png')}
        accessible={false}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: size * 3,
          height: size * 2,
          left: 0,
          top: category === 'snack' ? -size : 0,
        }}
      />
    </View>
  );
}

export default function ParentHomeScreen() {
  const router = useRouter();
  const compact = useWindowDimensions().width < 360;
  const [parent, setParent] = useState<Parent | null>(null);

  const [upcomingReservations, setUpcomingReservations] = useState<
    WeekReservation[]
  >([]);
  const [loadError, setLoadError] = useState('');
  const [weekSummary, setWeekSummary] = useState<ReturnType<
    typeof summarizeHomeWeek
  > | null>(null);
  const [children, setChildren] = useState<ChildWithStatus[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [balance, setBalance] = useState(0);
  const [countdown, setCountdown] = useState<{
    deadlineMs: number;
    label: string;
    missing: ChildWithStatus[];
    hasService: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Register push notifications
  useNotifications(parent?.id, 'parent');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, []),
  );

  const loadData = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/auth');
        return;
      }

      const { data: parentData } = await supabase
        .from('parents')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!parentData) {
        router.replace('/auth');
        return;
      }

      setParent(parentData);

      const { count: cartItemCount } = await supabase
        .from('cart_items')
        .select('*', { count: 'exact', head: true })
        .eq('parent_id', parentData.id);
      setCartCount(cartItemCount || 0);

      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('id, first_name, last_name, date_of_birth, school_id')
        .eq('parent_id', parentData.id);

      if (childrenError) {
        console.error('Error loading children:', childrenError);
      }

      if (childrenError) throw childrenError;
      const todayStr = getMoroccoDate();
      const weekRange = homeWeekRange(todayStr);
      const { data: weeklyReservations, error: weeklyError } = await supabase
        .from('reservations')
        .select('child_id, date, payment_status')
        .eq('parent_id', parentData.id)
        .neq('payment_status', 'cancelled')
        .gte('date', weekRange.start)
        .lte('date', weekRange.end);
      if (weeklyError) throw weeklyError;
      const summary = summarizeHomeWeek(
        (childrenData || []).map((child) => child.id),
        weeklyReservations || [],
        weekRange,
      );
      const childrenWithStatus = (childrenData || []).map((child) => ({
        ...child,
        ...summary.children[child.id],
      }));
      setChildren(childrenWithStatus);
      setWeekSummary(summary);

      // Compte à rebours: prochaine échéance de commande (jour J à 7h)
      const targetDate = getFirstBookableDate();
      const targetDateStr = formatDateToLocal(targetDate);
      const childSchoolIds = Array.from(
        new Set((childrenData || []).map((c) => c.school_id).filter(Boolean)),
      );

      let hasService = false;
      let missing: ChildWithStatus[] = [];
      if (childSchoolIds.length > 0) {
        const { data: targetMenus } = await supabase
          .from('menus')
          .select('school_id')
          .in('school_id', childSchoolIds)
          .eq('date', targetDateStr)
          .eq('available', true);
        const schoolsWithService = new Set<string>(
          (targetMenus || []).map((m) => m.school_id),
        );

        // Jours de fermeture par école : un jour fermé = pas de service (donc pas de
        // compte à rebours), même s'il reste d'anciens menus publiés ce jour-là.
        const { data: schoolRows } = await supabase
          .from('schools')
          .select('id, closed_weekdays')
          .in('id', childSchoolIds);
        const closedBySchool: Record<string, number[]> = {};
        (schoolRows || []).forEach((s: any) => {
          closedBySchool[s.id] = (s.closed_weekdays || []) as number[];
        });
        const targetWeekday = targetDate.getDay();

        const { data: targetReservations } = await supabase
          .from('reservations')
          .select('child_id')
          .eq('parent_id', parentData.id)
          .eq('date', targetDateStr)
          .neq('payment_status', 'cancelled');
        const orderedChildIds = new Set<string>(
          (targetReservations || []).map((r: any) => r.child_id),
        );

        const servableChildren = childrenWithStatus.filter(
          (c) =>
            schoolsWithService.has(c.school_id) &&
            !(closedBySchool[c.school_id] || []).includes(targetWeekday),
        );
        hasService = servableChildren.length > 0;
        missing = servableChildren.filter((c) => !orderedChildIds.has(c.id));
      }

      setCountdown({
        deadlineMs: getOrderDeadlineMs(targetDateStr),
        label: getTargetLabel(targetDate),
        missing,
        hasService,
      });

      const { data: upcomingData } = await supabase
        .from('reservations')
        .select(
          `
          id,
          date,
          child_id,
          menu_id,
          total_price,
          payment_status,
          children (first_name, last_name),
          menus (meal_name, description)
        `,
        )
        .eq('parent_id', parentData.id)
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(100)
        .returns<WeekReservation[]>();

      setUpcomingReservations(upcomingData || []);

      // Solde cagnotte + popup éventuel après une annulation
      const bal = await getBalance(parentData.id);
      setBalance(bal);
      if (consumeCreditAdded()) {
        showAlert(
          'Cagnotte créditée 💰',
          `Vous avez ${bal.toFixed(2)} DH dans votre cagnotte. Utilisable quand vous voulez sur vos prochaines commandes.`,
        );
      }

      setLoadError('');
    } catch (err) {
      console.error('Error loading data:', err);
      setLoadError(
        'Impossible de rafraîchir l’accueil. Réessayez en tirant vers le bas.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E293B" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={ui.page} edges={['top', 'bottom']}>
      <View style={ui.header}>
        <Text style={[ui.strong, { flex: 1 }]}>
          Bonjour, {parent?.first_name || 'Parent'} ☀
        </Text>
        <CartButton
          count={cartCount}
          onPress={() => router.push('/(parent)/cart')}
        />
        <RoundButton
          label="Mon profil"
          onPress={() => router.push('/(parent)/profile')}
        >
          <User size={21} color={palette.ink} />
        </RoundButton>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ gap: 9, marginBottom: 22 }}>
          <Text style={ui.eyebrow}>CHILD’S KITCHEN</Text>
          <Text style={[ui.title, compact && { fontSize: 26, lineHeight: 33 }]}>
            On commande quoi ?
          </Text>
          <Text style={ui.body}>Un bon repas pour une belle journée.</Text>
        </View>
        {loadError ? (
          <View style={ui.error}>
            <Text style={ui.errorText}>{loadError}</Text>
          </View>
        ) : null}
        {(['classic', 'snack'] as const).map((category) => {
          const snack = category === 'snack';
          return (
            <TouchableOpacity
              key={category}
              accessibilityRole="button"
              accessibilityLabel={
                snack ? 'Commander snackerie' : 'Commander un repas'
              }
              onPress={() =>
                router.push(orderingRoute({ category, selectChild: true }))
              }
              style={[styles.orderCard, snack && styles.snackCard]}
            >
              <View style={{ flex: 1, zIndex: 1, gap: 12 }}>
                <View style={[ui.row, { gap: 7 }]}>
                  <CategoryIcon
                    category={category}
                    color={snack ? palette.ink : '#fff'}
                    size={16}
                  />
                  <Text
                    style={[
                      styles.categoryLabel,
                      snack && { color: palette.ink },
                    ]}
                  >
                    {snack ? 'SNACKERIE' : 'MENUS CLASSIQUES'}
                  </Text>
                </View>
                <Text
                  style={[styles.orderTitle, snack && { color: palette.ink }]}
                >
                  Commander{'\n'}
                  {snack ? 'snackerie' : 'un repas'}
                </Text>
              </View>
              <HomeOrderIllustration
                category={category}
                size={compact ? 116 : 147}
              />
              <View style={styles.orderArrow}>
                <ArrowRight size={21} color={palette.ink} />
              </View>
            </TouchableOpacity>
          );
        })}
        {countdown?.hasService && (
          <View style={styles.reminder}>
            <View style={[ui.row, { alignItems: 'flex-start' }]}>
              <Clock size={18} color={palette.blue} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={ui.link}>
                  {countdown.missing.length
                    ? `Pour ${countdown.label}, pensez à commander`
                    : `Tout est commandé pour ${countdown.label}`}
                </Text>
                <Text style={ui.small}>Clôture à 7 h, heure du Maroc</Text>
                {countdown.missing.length > 0 ? (
                  <>
                    <OrderCountdown
                      deadlineMs={countdown.deadlineMs}
                      onExpire={loadData}
                    />
                    <Text style={[ui.small, { marginTop: 8 }]}>
                      Sans commande pour {countdown.label} :
                    </Text>
                    <View style={styles.missingChildren}>
                      {countdown.missing.map((child) => (
                        <View key={child.id} style={styles.missingChild}>
                          <Text style={ui.link}>
                            {child.first_name} {child.last_name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <View style={[ui.row, { gap: 6, marginTop: 6 }]}>
                    <Check size={16} color="#227454" />
                    <Text style={[ui.small, { color: '#227454' }]}>
                      Tout est prêt pour vos enfants.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
        <View style={styles.quickActions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Ajouter un enfant"
            onPress={() => router.push('/(parent)/add-child')}
            style={styles.quickAction}
          >
            <View style={styles.quickActionIcon}>
              <UserPlus size={23} color={palette.blue} />
            </View>
            <Text style={styles.quickActionText}>Ajouter un enfant</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Historique"
            onPress={() => router.push('/(parent)/history')}
            style={styles.quickAction}
          >
            <View style={styles.quickActionIcon}>
              <History size={23} color={palette.blue} />
            </View>
            <Text style={styles.quickActionText}>Historique</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.childrenSection} testID="home-children-section">
          <Text style={styles.childrenTitle}>Mes enfants</Text>
          {children.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.childrenList}
            >
              {children.map((child) => (
                <TouchableOpacity
                  key={child.id}
                  testID={`home-child-${child.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Voir la fiche de ${child.first_name} ${child.last_name}`}
                  accessibilityHint={
                    child.reservationCount === 0
                      ? 'Aucune réservation cette semaine'
                      : `${child.reservationCount} jours réservés cette semaine`
                  }
                  style={[
                    styles.childCard,
                    { borderColor: CHILD_RESERVATION_COLORS[child.status] },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: '/(parent)/child-details',
                      params: { childId: child.id },
                    })
                  }
                >
                  <View style={styles.childAvatar}>
                    <User size={36} color="#1E293B" />
                  </View>
                  <Text style={styles.childName}>{child.first_name}</Text>
                  <Text style={styles.childName}>{child.last_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyChildren}>
              <Text style={ui.body}>Aucun enfant enregistré</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Ajouter mon premier enfant"
                style={styles.addFirstChild}
                onPress={() => router.push('/(parent)/add-child')}
              >
                <UserPlus size={20} color="#fff" />
                <Text style={styles.addFirstChildText}>Ajouter un enfant</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={styles.weekCard} testID="home-weekly-gauge">
          <Text style={styles.weekCardTitle}>Réservations de la semaine</Text>
          {weekSummary ? (
            <View
              style={styles.ringWrap}
              accessibilityRole="progressbar"
              accessibilityLabel="Menus réservés cette semaine"
              aria-valuemin={0}
              aria-valuemax={weekSummary.maxMeals}
              aria-valuenow={weekSummary.bookedMeals}
              aria-valuetext={`${weekSummary.bookedMeals}/${weekSummary.maxMeals} menus réservés`}
              accessibilityValue={{
                min: 0,
                max: weekSummary.maxMeals,
                now: weekSummary.bookedMeals,
                text: `${weekSummary.bookedMeals}/${weekSummary.maxMeals} menus réservés`,
              }}
            >
              <Svg width={190} height={190} accessible={false}>
                <Circle
                  cx={95}
                  cy={95}
                  r={87}
                  stroke="#E5E7EB"
                  strokeWidth={16}
                  fill="none"
                />
                {weekSummary.progress > 0 && (
                  <Circle
                    cx={95}
                    cy={95}
                    r={87}
                    stroke="#2E97DD"
                    strokeWidth={16}
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 87 * weekSummary.progress} ${2 * Math.PI * 87}`}
                    strokeLinecap="round"
                    transform="rotate(-90 95 95)"
                  />
                )}
              </Svg>
              <View style={styles.ringCenter}>
                <Text style={styles.ringNumber}>
                  {weekSummary.bookedMeals}/{weekSummary.maxMeals}
                </Text>
                <Text style={styles.ringLabel}>menus réservés</Text>
              </View>
            </View>
          ) : (
            <Text style={ui.body}>
              Le suivi de la semaine est indisponible.
            </Text>
          )}
          <Text style={styles.weekPhrase}>
            N’oubliez pas de commander les repas pour la semaine prochaine !
          </Text>
        </View>
        {balance > 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.wallet}
            onPress={() => router.push(orderingRoute({ selectChild: true }))}
          >
            <Wallet size={22} color={palette.blue} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={ui.strong}>Ma cagnotte</Text>
              <Text style={ui.small}>
                Utilisable sur vos prochaines commandes.
              </Text>
            </View>
            <Text style={[ui.strong, { color: palette.blue }]}>
              {balance.toFixed(2)} DH
            </Text>
            <ArrowRight size={17} color={palette.blue} />
          </TouchableOpacity>
        )}
        <View style={[ui.spread, { marginTop: 24, marginBottom: 12 }]}>
          <Text style={[ui.sectionTitle, { flex: 1 }]}>
            Prochaines réservations
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Voir tout l’historique des réservations"
            onPress={() => router.push('/(parent)/history')}
            style={{ paddingVertical: 12 }}
          >
            <Text style={ui.link}>Tout voir</Text>
          </TouchableOpacity>
        </View>
        {upcomingReservations.length === 0 ? (
          <View style={[ui.card, { alignItems: 'center', gap: 12 }]}>
            <UtensilsCrossed size={30} color={palette.blue} />
            <Text style={ui.body}>Aucune réservation à venir.</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.push(orderingRoute({ selectChild: true }))}
              style={styles.emptyOrderButton}
            >
              <Text style={ui.link}>Commander maintenant</Text>
              <ArrowRight size={16} color={palette.blue} />
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={styles.reservationsList}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            contentContainerStyle={{ gap: 14 }}
          >
            {Array.from(
              upcomingReservations.reduce((groups, reservation) => {
                const items = groups.get(reservation.child_id) || [];
                items.push(reservation);
                groups.set(reservation.child_id, items);
                return groups;
              }, new Map<string, WeekReservation[]>()),
            ).map(([childId, reservations]) => {
              const child = reservations[0].children;
              return (
                <View
                  key={childId}
                  style={styles.reservationGroup}
                  testID={`home-reservations-${childId}`}
                >
                  <View style={[ui.row, { marginBottom: 4 }]}>
                    <Avatar
                      firstName={child?.first_name || 'E'}
                      lastName={child?.last_name}
                      size={32}
                    />
                    <Text style={ui.strong}>
                      {child?.first_name} {child?.last_name}
                    </Text>
                  </View>
                  {reservations.map((reservation) => {
                    const cancelled =
                      reservation.payment_status === 'cancelled';
                    return (
                      <View
                        key={reservation.id}
                        style={[
                          styles.reservation,
                          cancelled && styles.cancelledReservation,
                        ]}
                      >
                        <View style={ui.spread}>
                          <View style={styles.reservationDate}>
                            <Calendar size={13} color={palette.blue} />
                            <Text style={ui.link}>
                              {parseYmd(reservation.date).toLocaleDateString(
                                'fr-FR',
                                {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                },
                              )}
                            </Text>
                          </View>
                          {cancelled && (
                            <Text style={styles.cancelledLabel}>Annulé</Text>
                          )}
                        </View>
                        <View style={[ui.spread, { alignItems: 'flex-start' }]}>
                          <Text
                            style={[
                              ui.strong,
                              { flex: 1 },
                              cancelled && styles.cancelledText,
                            ]}
                          >
                            {reservation.menus?.meal_name || 'Menu'}
                          </Text>
                          <Text
                            style={[
                              ui.strong,
                              { color: palette.blue },
                              cancelled && styles.cancelledText,
                            ]}
                          >
                            {Number(reservation.total_price).toFixed(2)} DH
                          </Text>
                        </View>
                        {reservation.menus?.description ? (
                          <Text style={ui.small} numberOfLines={2}>
                            {reservation.menus.description}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        )}
        <Image
          source={require('@/assets/images/Box2.png')}
          testID="home-bottom-banner"
          accessible={false}
          style={styles.bottomBanner}
          resizeMode="contain"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  orderCard: {
    minHeight: 157,
    backgroundColor: palette.blue,
    padding: 22,
    borderRadius: 25,
    marginBottom: 13,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  snackCard: { backgroundColor: palette.peach },
  categoryLabel: {
    fontFamily: type.bold,
    fontSize: 9,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  orderTitle: {
    fontFamily: type.heavy,
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.7,
    color: '#fff',
  },
  heroPhoto: {
    position: 'absolute',
    right: -16,
    top: 10,
    overflow: 'hidden',
  },
  orderArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    zIndex: 2,
  },
  reminder: {
    padding: 15,
    backgroundColor: '#EAF1FB',
    borderRadius: 17,
    marginTop: 4,
  },
  countdownTimer: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    marginTop: 5,
  },
  countdownValue: { fontFamily: type.bold, fontSize: 13, color: palette.blue },
  childrenSection: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginTop: 22,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  childrenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 16,
  },
  childrenList: { paddingVertical: 4, gap: 12 },
  childCard: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 2,
    minWidth: 112,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  childAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EAF4FC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  childName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
  },
  emptyChildren: { alignItems: 'center', paddingVertical: 24, gap: 16 },
  addFirstChild: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.blue,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  addFirstChildText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  weekCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  weekCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringNumber: { fontSize: 40, fontWeight: '800', color: '#1E293B' },
  ringLabel: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  weekPhrase: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 21,
  },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#EAF1FB',
    borderRadius: 17,
    padding: 16,
    marginTop: 16,
  },
  quickActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  quickAction: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#E8EDF5',
  },
  quickActionIcon: {
    width: 45,
    height: 45,
    borderRadius: 16,
    backgroundColor: '#EAF1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    fontFamily: type.bold,
    fontSize: 12,
    color: palette.ink,
    textAlign: 'center',
  },
  missingChildren: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  missingChild: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  reservationsList: { maxHeight: 410, flexGrow: 0 },
  reservationGroup: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 22,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E8EDF5',
  },
  reservation: {
    backgroundColor: palette.bg,
    padding: 14,
    borderRadius: 16,
    gap: 10,
  },
  reservationDate: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cancelledReservation: { backgroundColor: '#FAF0F0' },
  cancelledLabel: {
    fontFamily: type.bold,
    fontSize: 11,
    color: '#A64343',
    backgroundColor: '#FBE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cancelledText: { color: palette.muted, textDecorationLine: 'line-through' },
  emptyOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#EAF1FB',
  },
  bottomBanner: { width: '100%', aspectRatio: 1162 / 123, marginTop: 24 },
});
