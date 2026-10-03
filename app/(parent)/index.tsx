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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase, Parent } from '@/lib/supabase';
import { User, Clock, Wallet, ArrowRight, Plus } from 'lucide-react-native';
import {
  Avatar,
  CartButton,
  RoundButton,
  MenuPhoto,
  CategoryIcon,
  ui,
  palette,
  type,
} from '@/components/parent/OrderingUI';
import { orderingRoute } from '@/lib/parent-ordering';
import { getMealCategory, type MealCategory } from '@/lib/meal-category';

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

type ChildWithStatus = Child;

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

export default function ParentHomeScreen() {
  const router = useRouter();
  const compact = useWindowDimensions().width < 360;
  const [parent, setParent] = useState<Parent | null>(null);

  const [upcomingReservations, setUpcomingReservations] = useState<
    WeekReservation[]
  >([]);
  const [photos, setPhotos] = useState<Partial<Record<MealCategory, string>>>(
    {},
  );
  const [loadError, setLoadError] = useState('');
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
      const childrenWithStatus = childrenData || [];
      setChildren(childrenWithStatus);

      // Compte à rebours: prochaine échéance de commande (jour J à 7h)
      const targetDate = getFirstBookableDate();
      const targetDateStr = formatDateToLocal(targetDate);
      const childSchoolIds = Array.from(
        new Set((childrenData || []).map((c) => c.school_id).filter(Boolean)),
      );

      let hasService = false;
      let missing: ChildWithStatus[] = [];
      if (childSchoolIds.length > 0) {
        const lastDate = new Date(targetDate);
        lastDate.setDate(lastDate.getDate() + 6);
        const { data: targetMenus } = await supabase
          .from('menus')
          .select('school_id, date, image_url, meal_category')
          .in('school_id', childSchoolIds)
          .gte('date', targetDateStr)
          .lte('date', formatDateToLocal(lastDate))
          .eq('available', true)
          .order('date');
        const nextPhotos: Partial<Record<MealCategory, string>> = {};
        for (const menu of targetMenus || []) {
          const category = getMealCategory(menu.meal_category);
          if (menu.image_url && !nextPhotos[category])
            nextPhotos[category] = menu.image_url;
        }
        setPhotos(nextPhotos);
        const schoolsWithService = new Set<string>(
          (targetMenus || [])
            .filter((m) => m.date === targetDateStr)
            .map((m) => m.school_id),
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
          <Text style={ui.title}>On commande quoi ?</Text>
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
              <MenuPhoto
                uri={photos[category]}
                category={category}
                style={[
                  styles.heroPhoto,
                  compact && { width: 116, height: 116, right: -20 },
                ]}
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
                {countdown.missing.length > 0 && (
                  <OrderCountdown
                    deadlineMs={countdown.deadlineMs}
                    onExpire={loadData}
                  />
                )}
              </View>
            </View>
          </View>
        )}
        <View style={[ui.spread, { marginTop: 22, marginBottom: 12 }]}>
          <Text style={ui.sectionTitle}>Mes enfants</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Ajouter un enfant"
            onPress={() => router.push('/(parent)/add-child')}
            style={styles.addChild}
          >
            <Plus size={15} color={palette.blue} />
            <Text style={ui.link}>Ajouter</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.children}>
          {children.map((child) => (
            <TouchableOpacity
              key={child.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/(parent)/child-details',
                  params: { childId: child.id },
                })
              }
              style={styles.child}
            >
              <Avatar firstName={child.first_name} lastName={child.last_name} />
              <View style={{ flex: 1 }}>
                <Text style={ui.strong}>{child.first_name}</Text>
                <Text style={ui.small}>{child.last_name}</Text>
              </View>
              <ArrowRight size={16} color={palette.muted} />
            </TouchableOpacity>
          ))}
          {!children.length && (
            <Text style={ui.body}>Ajoutez votre enfant pour commencer.</Text>
          )}
        </View>
        {balance > 0 && (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.wallet}
            onPress={() => router.push(orderingRoute({ selectChild: true }))}
          >
            <Wallet size={22} color={palette.blue} />
            <Text style={[ui.strong, { flex: 1 }]}>Ma cagnotte</Text>
            <Text style={[ui.strong, { color: palette.blue }]}>
              {balance.toFixed(2)} DH
            </Text>
            <ArrowRight size={17} color={palette.blue} />
          </TouchableOpacity>
        )}
        <View style={[ui.spread, { marginTop: 24, marginBottom: 12 }]}>
          <Text style={ui.sectionTitle}>À venir</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push('/(parent)/history')}
            style={{ paddingVertical: 12 }}
          >
            <Text style={ui.link}>Historique</Text>
          </TouchableOpacity>
        </View>
        {upcomingReservations.length === 0 ? (
          <View style={ui.card}>
            <Text style={ui.body}>Aucune réservation à venir.</Text>
          </View>
        ) : (
          upcomingReservations.map((reservation) => (
            <View key={reservation.id} style={styles.reservation}>
              <View style={ui.spread}>
                <Text style={ui.strong}>
                  {reservation.children?.first_name}{' '}
                  {reservation.children?.last_name}
                </Text>
                <Text style={ui.small}>
                  {parseYmd(reservation.date).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </View>
              <Text
                style={[
                  ui.body,
                  reservation.payment_status === 'cancelled' && {
                    textDecorationLine: 'line-through',
                  },
                ]}
              >
                {reservation.menus?.meal_name || 'Menu'}
              </Text>
              <Text style={ui.link}>
                {reservation.payment_status === 'cancelled'
                  ? 'Annulée'
                  : `${Number(reservation.total_price).toFixed(2)} DH`}
              </Text>
            </View>
          ))
        )}
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
    width: 137,
    height: 137,
    right: -16,
    bottom: -7,
    borderRadius: 70,
    transform: [{ rotate: '-10deg' }],
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
  addChild: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
  },
  children: { gap: 10 },
  child: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 19,
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
  reservation: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 19,
    gap: 7,
    marginBottom: 10,
  },
});
