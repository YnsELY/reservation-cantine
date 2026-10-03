import {
  Avatar,
  CategoryIcon,
  Header,
  MenuPhoto,
  PrimaryButton,
  RoundButton,
  ui,
  palette,
  type,
} from '@/components/parent/OrderingUI';
import { orderingRoute } from '@/lib/parent-ordering';
import { getMealCategory } from '@/lib/meal-category';
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, Child, Menu, Parent } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import {
  confirmRepeatOrder,
  getActiveMeals,
  hasAnotherChild,
} from '@/lib/meal-orders';
import { getPaymentErrorMessage } from '@/lib/payment-errors';
import { isPastOrderCutoff } from '@/lib/order-time';
import { parseYmd } from '@/lib/dates';
import { ShoppingCart, Check, X } from 'lucide-react-native';

interface Supplement {
  id: string;
  name: string;
  description: string | null;
  price: number;
  available: boolean;
  menu_id?: string | null;
}

export default function MenuDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [parent, setParent] = useState<Parent | null>(null);
  const [child, setChild] = useState<Child | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [addingToCart, setAddingToCart] = useState(false);
  const addingToCartRef = useRef(false);
  const [addedTotal, setAddedTotal] = useState<number | null>(null);
  const [hasSibling, setHasSibling] = useState(false);
  const [hasOtherCategory, setHasOtherCategory] = useState(false);

  const menuId = params.menuId as string;
  const childId = params.childId as string;
  const date = params.date as string;
  const category = getMealCategory(menu?.meal_category);
  const returnToCatalogue = (nextCategory = category, selectChild = false) => {
    router.replace(
      orderingRoute({ childId, date, category: nextCategory, selectChild }),
    );
  };

  useEffect(() => {
    loadData();
  }, [menuId, childId, date]);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent) {
        router.replace('/auth');
        return;
      }
      setParent(currentParent);

      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .maybeSingle();

      if (childError) throw childError;
      setChild(childData);

      const { data: menuData, error: menuError } = await supabase
        .from('menus')
        .select('*')
        .eq('id', menuId)
        .maybeSingle();

      if (menuError) throw menuError;
      setMenu(menuData);
      hasAnotherChild(currentParent.id, childId)
        .then(setHasSibling)
        .catch(() => setHasSibling(false));
      if (menuData && childData?.school_id) {
        const [
          { data: alternatives, error: alternativesError },
          { data: school },
        ] = await Promise.all([
          supabase
            .from('menus')
            .select('meal_category')
            .eq('school_id', childData.school_id)
            .eq('date', date)
            .eq('available', true),
          supabase
            .from('schools')
            .select('closed_weekdays')
            .eq('id', childData.school_id)
            .maybeSingle(),
        ]);
        const closed = school?.closed_weekdays?.includes(
          parseYmd(date).getDay(),
        );
        setHasOtherCategory(
          !alternativesError &&
            !closed &&
            !isPastOrderCutoff(date) &&
            !!alternatives?.some(
              (item) =>
                getMealCategory(item.meal_category) !==
                getMealCategory(menuData.meal_category),
            ),
        );
      }

      if (menuData?.school_id) {
        const allSupplements: Supplement[] = [];

        if (
          menuData.supplements &&
          Array.isArray(menuData.supplements) &&
          menuData.supplements.length > 0
        ) {
          const { data: genericSupplementsData, error: genericError } =
            await supabase
              .from('provider_supplements')
              .select('*')
              .in('id', menuData.supplements)
              .eq('available', true);

          if (!genericError && genericSupplementsData) {
            allSupplements.push(...genericSupplementsData);
          }
        }

        const { data: specificSupplementsData, error: specificError } =
          await supabase
            .from('provider_supplements')
            .select('*')
            .eq('menu_id', menuData.id)
            .eq('available', true);

        if (!specificError && specificSupplementsData) {
          allSupplements.push(...specificSupplementsData);
        }

        const uniqueSupplements = Array.from(
          new Map(allSupplements.map((s) => [s.id, s])).values(),
        );

        uniqueSupplements.sort((a, b) => a.price - b.price);

        setSupplements(uniqueSupplements);
      } else {
      }

      setError('');
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const toggleSupplement = (supplementId: string) => {
    setSelectedSupplements((prev) => {
      if (prev.includes(supplementId)) {
        return prev.filter((id) => id !== supplementId);
      } else {
        return [...prev, supplementId];
      }
    });
  };

  const handleAddToCart = async () => {
    if (
      !parent ||
      !child ||
      !menu ||
      addedTotal !== null ||
      addingToCartRef.current
    )
      return;

    addingToCartRef.current = true;
    setAddingToCart(true);
    setError('');

    try {
      if (isPastOrderCutoff(date)) {
        throw new Error(
          'Les commandes pour ce repas sont closes depuis 7 h, heure du Maroc.',
        );
      }
      const reservations = await getActiveMeals([
        { child_id: child.id, menu_id: menu.id, date },
      ]);
      const { data: existingItems, error: cartError } = await supabase
        .from('cart_items')
        .select('id')
        .eq('child_id', child.id)
        .eq('date', date);
      if (cartError) throw cartError;

      const selectedSupplementsData = supplements
        .filter((s) => selectedSupplements.includes(s.id))
        .map((s) => ({ id: s.id, name: s.name, price: s.price }));

      const supplementsTotal = selectedSupplementsData.reduce(
        (sum, s) => sum + s.price,
        0,
      );
      const totalPrice = Number(menu.price) + supplementsTotal;

      const cartCount = existingItems?.length || 0;
      const quantity = reservations.length + cartCount + 1;
      if (quantity > 1) {
        const choice = await confirmRepeatOrder({
          childName: `${child.first_name} ${child.last_name}`,
          date,
          reservedCount: reservations.length,
          cartCount,
          quantity,
          amount: totalPrice,
          adding: true,
          hasSibling: await hasAnotherChild(parent.id, child.id),
        });
        if (choice === 'other-child') returnToCatalogue(category, true);
        if (choice !== 'confirm') return;
      }

      const supplementsJson =
        selectedSupplementsData.length > 0
          ? { items: selectedSupplementsData }
          : null;

      // La confirmation peut rester ouverte jusqu'après l'échéance.
      if (isPastOrderCutoff(date)) {
        throw new Error(
          'Les commandes pour ce repas sont closes depuis 7 h, heure du Maroc.',
        );
      }
      const { error } = await supabase.from('cart_items').insert({
        parent_id: parent.id,
        child_id: child.id,
        menu_id: menu.id,
        date: date,
        total_price: totalPrice,
        supplements: supplementsJson,
        annotations: specialInstructions || null,
        confirmed_daily_quantity: quantity,
      });

      if (error) throw error;

      setAddedTotal(totalPrice);
    } catch (err) {
      console.error('Error adding to cart:', err);
      setError(getPaymentErrorMessage(err, false));
    } finally {
      addingToCartRef.current = false;
      setAddingToCart(false);
    }
  };

  if (loading)
    return (
      <SafeAreaView style={ui.center}>
        <ActivityIndicator size="large" color={palette.blue} />
      </SafeAreaView>
    );
  if (!menu || !child)
    return (
      <SafeAreaView style={ui.page}>
        <Header title="Votre repas" back={() => returnToCatalogue()} />
        <View style={ui.center}>
          <Text style={ui.strong}>Menu introuvable</Text>
          <Text style={[ui.body, { marginVertical: 14 }]}>
            {error || 'Ce menu n’est plus disponible.'}
          </Text>
          <PrimaryButton
            label="Revenir aux menus"
            onPress={() => returnToCatalogue()}
          />
        </View>
      </SafeAreaView>
    );

  const selectedSupplementsData = supplements.filter((s) =>
    selectedSupplements.includes(s.id),
  );
  const totalPrice =
    Number(menu.price) +
    selectedSupplementsData.reduce((sum, s) => sum + Number(s.price), 0);
  const dayLabel = parseYmd(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const canSuggestOther = hasOtherCategory && !isPastOrderCutoff(date);
  const goToCart = () => router.replace('/(parent)/cart');

  return (
    <SafeAreaView style={ui.page} edges={['top', 'bottom']}>
      <Header
        title={category === 'snack' ? 'Votre snack' : 'Votre repas'}
        back={() => returnToCatalogue()}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={ui.error} accessibilityRole="alert">
            <Text style={ui.errorText}>{error}</Text>
          </View>
        ) : null}
        <View style={styles.context}>
          <Avatar
            firstName={child.first_name}
            lastName={child.last_name}
            size={36}
          />
          <View style={{ flex: 1 }}>
            <Text style={ui.strong}>Pour {child.first_name}</Text>
            <Text style={ui.small}>{dayLabel}</Text>
          </View>
        </View>
        <View style={styles.menuCard}>
          <MenuPhoto
            uri={menu.image_url}
            category={category}
            label={menu.meal_name}
            style={styles.photo}
          />
          <View style={styles.menuInfo}>
            <View style={ui.row}>
              <CategoryIcon category={category} size={16} />
              <Text style={ui.eyebrow}>
                {category === 'snack' ? 'SNACKERIE' : 'MENU CLASSIQUE'}
              </Text>
            </View>
            <Text style={[ui.title, { fontSize: 27, lineHeight: 34 }]}>
              {menu.meal_name}
            </Text>
            {menu.description ? (
              <Text style={ui.body}>{menu.description}</Text>
            ) : null}
            <Text style={styles.price}>
              {Number(menu.price).toFixed(2)}{' '}
              <Text style={{ fontSize: 14 }}>DH</Text>
            </Text>
          </View>
        </View>
        {supplements.length > 0 && (
          <View style={styles.section}>
            <View style={ui.spread}>
              <Text style={ui.sectionTitle}>Un petit plus ?</Text>
              <Text style={ui.small}>Facultatif</Text>
            </View>
            <Text style={[ui.small, { marginTop: 6, marginBottom: 10 }]}>
              Personnalisez son repas.
            </Text>
            {supplements.map((supplement) => {
              const selected = selectedSupplements.includes(supplement.id);
              return (
                <TouchableOpacity
                  key={supplement.id}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`${supplement.name}, ${Number(supplement.price).toFixed(2)} DH`}
                  accessibilityState={{ checked: selected }}
                  disabled={addingToCart || addedTotal !== null}
                  onPress={() => toggleSupplement(supplement.id)}
                  style={[
                    styles.supplement,
                    selected && styles.selectedSupplement,
                  ]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selected && {
                        backgroundColor: palette.blue,
                        borderColor: palette.blue,
                      },
                    ]}
                  >
                    {selected && <Check size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[ui.strong, { fontSize: 13 }]}>
                      {supplement.name}
                    </Text>
                    {supplement.description ? (
                      <Text style={ui.small}>{supplement.description}</Text>
                    ) : null}
                  </View>
                  <Text style={ui.link}>
                    +{Number(supplement.price).toFixed(2)} DH
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <View style={styles.section}>
          <Text style={ui.strong}>Une précision pour la cuisine ?</Text>
          <Text style={[ui.small, { marginVertical: 6 }]}>
            Instructions spéciales · facultatif
          </Text>
          <TextInput
            accessibilityLabel="Instructions spéciales"
            value={specialInstructions}
            onChangeText={setSpecialInstructions}
            editable={!addingToCart && addedTotal === null}
            placeholder="Allergies, préférences alimentaires…"
            placeholderTextColor={palette.muted}
            multiline
            numberOfLines={3}
            style={styles.input}
          />
        </View>
      </ScrollView>
      <View style={ui.footer}>
        <View style={styles.footerInner}>
          <View style={ui.spread}>
            <Text style={ui.small}>Total avec suppléments</Text>
            <Text style={ui.strong}>{totalPrice.toFixed(2)} DH</Text>
          </View>
          <PrimaryButton
            label={addingToCart ? 'Ajout en cours…' : 'Ajouter au panier'}
            onPress={handleAddToCart}
            disabled={addingToCart || addedTotal !== null}
          >
            {addingToCart ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ShoppingCart size={18} color="#fff" />
            )}
          </PrimaryButton>
        </View>
      </View>
      <Modal
        visible={addedTotal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => returnToCatalogue()}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Fermer et revenir aux menus"
            accessibilityRole="button"
            style={StyleSheet.absoluteFill}
            onPress={() => returnToCatalogue()}
          />
          <SafeAreaView
            style={styles.sheet}
            edges={['bottom']}
            accessibilityViewIsModal
          >
            <ScrollView bounces={false} contentContainerStyle={{ padding: 22 }}>
              <View style={{ alignSelf: 'flex-end' }}>
                <RoundButton label="Fermer" onPress={() => returnToCatalogue()}>
                  <X size={20} color={palette.ink} />
                </RoundButton>
              </View>
              <View style={styles.success}>
                <Check size={30} color="#227454" />
              </View>
              <Text
                style={[
                  ui.title,
                  { fontSize: 26, textAlign: 'center', marginTop: 14 },
                ]}
              >
                C’est dans le panier !
              </Text>
              <Text style={[ui.body, { textAlign: 'center', marginTop: 7 }]}>
                {child.first_name} · {dayLabel}
              </Text>
              <View style={styles.addedItem}>
                <MenuPhoto
                  uri={menu.image_url}
                  category={category}
                  style={{ width: 48, height: 48, borderRadius: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[ui.strong, { fontSize: 13 }]}>
                    {menu.meal_name}
                  </Text>
                  <Text style={ui.small}>{addedTotal?.toFixed(2)} DH</Text>
                </View>
                <Check size={18} color="#227454" />
              </View>
              <View style={{ gap: 10 }}>
                {category === 'classic' && canSuggestOther ? (
                  <>
                    <Text
                      style={[
                        ui.small,
                        { textAlign: 'center', marginBottom: 3 },
                      ]}
                    >
                      Une envie de snackerie pour le même jour ?
                    </Text>
                    <PrimaryButton
                      label="Voir la snackerie du jour"
                      onPress={() => returnToCatalogue('snack')}
                    />
                  </>
                ) : (
                  <PrimaryButton label="Aller au panier" onPress={goToCart} />
                )}
                {hasSibling && (
                  <PrimaryButton
                    label="Commander pour un autre enfant"
                    onPress={() => returnToCatalogue(category, true)}
                    secondary
                  />
                )}
                {category === 'snack' && canSuggestOther && (
                  <PrimaryButton
                    label="Voir les repas du jour"
                    onPress={() => returnToCatalogue('classic')}
                    secondary
                  />
                )}
                {category === 'classic' && canSuggestOther && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={goToCart}
                    style={styles.textButton}
                  >
                    <Text style={ui.link}>Aller au panier</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 25,
    overflow: 'hidden',
    marginBottom: 24,
  },
  photo: { width: '100%', height: 220 },
  menuInfo: { padding: 22, gap: 13 },
  price: { fontFamily: type.heavy, fontSize: 25, color: palette.blue },
  section: { marginBottom: 20 },
  supplement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    marginBottom: 8,
    minHeight: 62,
  },
  selectedSupplement: { borderColor: palette.blue, backgroundColor: '#EDF4FE' },
  checkbox: {
    width: 21,
    height: 21,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#CCD6E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    fontFamily: type.body,
    color: palette.ink,
    fontSize: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    minHeight: 90,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: palette.line,
  },
  footerInner: { width: '100%', maxWidth: 680, alignSelf: 'center', gap: 12 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(20,39,66,0.42)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#fff',
    maxHeight: '95%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  success: {
    width: 64,
    height: 64,
    borderRadius: 23,
    backgroundColor: '#E4F2EA',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: -26,
  },
  addedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.bg,
    borderRadius: 18,
    padding: 14,
    marginVertical: 21,
  },
  textButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
});
