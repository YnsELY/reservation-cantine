import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase, Child, Menu, School } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Calendar, Check } from 'lucide-react-native';

export default function SchoolCommanderScreen() {
  const [school, setSchool] = useState<School | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [selectedChildren, setSelectedChildren] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [weekDates, setWeekDates] = useState<Date[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      loadMenusForDate(selectedDate);
    }
  }, [selectedDate]);

  const loadData = async () => {
    try {
      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }

      setSchool(currentSchool);

      const { data: childrenData } = await supabase
        .from('children')
        .select('*')
        .eq('school_id', currentSchool.id)
        .order('last_name')
        .order('first_name');

      setChildren(childrenData || []);

      const dates: Date[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date);
      }

      setWeekDates(dates);
      if (dates.length > 0) {
        setSelectedDate(dates[0].toISOString().split('T')[0]);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMenusForDate = async (date: string) => {
    if (!school) return;

    try {
      const { data } = await supabase
        .from('menus')
        .select('*')
        .eq('school_id', school.id)
        .eq('date', date)
        .eq('available', true)
        .order('meal_name');

      setMenus(data || []);
    } catch (err) {
      console.error('Error loading menus:', err);
    }
  };

  const toggleChild = (childId: string) => {
    const newSelected = new Set(selectedChildren);
    if (newSelected.has(childId)) {
      newSelected.delete(childId);
    } else {
      newSelected.add(childId);
    }
    setSelectedChildren(newSelected);
  };

  const selectAllChildren = () => {
    if (selectedChildren.size === children.length) {
      setSelectedChildren(new Set());
    } else {
      setSelectedChildren(new Set(children.map(c => c.id)));
    }
  };

  const handleSubmit = async () => {
    if (!selectedMenu || selectedChildren.size === 0) {
      Alert.alert('Erreur', 'Veuillez sélectionner un menu et au moins un élève');
      return;
    }

    setSubmitting(true);
    try {
      const reservations = Array.from(selectedChildren).map(childId => {
        const child = children.find(c => c.id === childId);
        return {
          child_id: childId,
          menu_id: selectedMenu.id,
          parent_id: child?.parent_id,
          date: selectedDate,
          supplements: [],
          annotations: null,
          total_price: selectedMenu.price,
          payment_status: 'pending',
          created_by_school: true,
          school_payment_pending: true,
        };
      });

      const { error } = await supabase
        .from('reservations')
        .insert(reservations);

      if (error) throw error;

      Alert.alert(
        'Succès',
        `${selectedChildren.size} commande(s) créée(s) avec succès`,
        [
          {
            text: 'OK',
            onPress: () => {
              setSelectedMenu(null);
              setSelectedChildren(new Set());
              router.back();
            },
          },
        ]
      );
    } catch (err) {
      console.error('Error creating orders:', err);
      Alert.alert('Erreur', 'Impossible de créer les commandes');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateLabel = (date: Date) => {
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    return `${days[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`;
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
      <View style={styles.topSection}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Commander pour les élèves</Text>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Sélectionner une date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datesScroll}>
            {weekDates.map((date) => {
              const dateString = date.toISOString().split('T')[0];
              const isSelected = selectedDate === dateString;

              return (
                <TouchableOpacity
                  key={dateString}
                  style={[styles.dateCard, isSelected && styles.dateCardSelected]}
                  onPress={() => setSelectedDate(dateString)}
                >
                  <Calendar size={16} color={isSelected ? '#FFFFFF' : '#6B7280'} />
                  <Text style={[styles.dateText, isSelected && styles.dateTextSelected]}>
                    {formatDateLabel(date)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Sélectionner un menu</Text>
          {menus.length === 0 ? (
            <Text style={styles.emptyText}>Aucun menu disponible pour cette date</Text>
          ) : (
            menus.map((menu) => {
              const isSelected = selectedMenu?.id === menu.id;
              return (
                <TouchableOpacity
                  key={menu.id}
                  style={[styles.menuCard, isSelected && styles.menuCardSelected]}
                  onPress={() => setSelectedMenu(menu)}
                >
                  {menu.image_url && (
                    <Image
                      source={{ uri: menu.image_url }}
                      style={styles.menuCardImage}
                      resizeMode="cover"
                    />
                  )}
                  <View style={styles.menuInfo}>
                    <Text style={[styles.menuName, isSelected && styles.menuNameSelected]}>
                      {menu.meal_name}
                    </Text>
                    <Text style={[styles.menuPrice, isSelected && styles.menuPriceSelected]}>
                      {menu.price.toFixed(2)} €
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={styles.checkIcon}>
                      <Check size={20} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>3. Sélectionner les élèves</Text>
            <TouchableOpacity style={styles.selectAllButton} onPress={selectAllChildren}>
              <Text style={styles.selectAllText}>
                {selectedChildren.size === children.length ? 'Désélectionner tout' : 'Tout sélectionner'}
              </Text>
            </TouchableOpacity>
          </View>
          {children.length === 0 ? (
            <Text style={styles.emptyText}>Aucun élève inscrit</Text>
          ) : (
            <FlatList
              data={children}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = selectedChildren.has(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.childCard, isSelected && styles.childCardSelected]}
                    onPress={() => toggleChild(item.id)}
                  >
                    <View style={styles.childInfo}>
                      <Text style={[styles.childName, isSelected && styles.childNameSelected]}>
                        {item.first_name} {item.last_name}
                      </Text>
                      {item.grade && (
                        <Text style={[styles.childGrade, isSelected && styles.childGradeSelected]}>
                          {item.grade}
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <View style={styles.checkIcon}>
                        <Check size={20} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Résumé</Text>
          <Text style={styles.summaryText}>
            {selectedChildren.size} élève(s) sélectionné(s)
          </Text>
          {selectedMenu && (
            <Text style={styles.summaryText}>
              Menu: {selectedMenu.meal_name} ({selectedMenu.price.toFixed(2)} €)
            </Text>
          )}
          <Text style={styles.summaryTotal}>
            Total: {(selectedChildren.size * (selectedMenu?.price || 0)).toFixed(2)} €
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!selectedMenu || selectedChildren.size === 0 || submitting) && styles.submitButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={!selectedMenu || selectedChildren.size === 0 || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Créer les commandes</Text>
          )}
        </TouchableOpacity>
      </View>
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
  topSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  datesScroll: {
    flexDirection: 'row',
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  dateCardSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  dateTextSelected: {
    color: '#FFFFFF',
  },
  menuCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    position: 'relative',
  },
  menuCardImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 60,
    height: 60,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#F3F4F6',
    zIndex: 10,
  },
  menuCardSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  menuInfo: {
    flex: 1,
    paddingRight: 70,
  },
  menuName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  menuNameSelected: {
    color: '#FFFFFF',
  },
  menuPrice: {
    fontSize: 14,
    color: '#6B7280',
  },
  menuPriceSelected: {
    color: '#FFFFFF',
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
  childCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  childCardSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  childNameSelected: {
    color: '#FFFFFF',
  },
  childGrade: {
    fontSize: 14,
    color: '#6B7280',
  },
  childGradeSelected: {
    color: '#FFFFFF',
  },
  checkIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
  summary: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  summaryTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4F46E5',
    marginTop: 8,
  },
  footer: {
    backgroundColor: '#F9FAFB',
    paddingTop: 16,
    paddingBottom: 0,
    paddingHorizontal: 0,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  submitButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 0,
    paddingVertical: 20,
    alignItems: 'center',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
