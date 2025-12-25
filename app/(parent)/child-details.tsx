import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Edit, Calendar, Clock, AlertCircle, User } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  class_name: string;
  allergies: string;
  school_id: string;
  schools?: {
    name: string;
  };
}

interface Reservation {
  id: string;
  date: string;
  menus: {
    id: string;
    name: string;
    description: string;
    price: number;
    date: string;
  };
}

export default function ChildDetailsScreen() {
  const { childId } = useLocalSearchParams();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [child, setChild] = useState<Child | null>(null);
  const [weekReservations, setWeekReservations] = useState<Reservation[]>([]);
  const [historyReservations, setHistoryReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    if (childId) {
      loadChildData();
    }
  }, [childId]);

  const loadChildData = async () => {
    try {
      setLoading(true);

      const { data: childData, error: childError } = await supabase
        .from('children')
        .select(`
          *,
          schools (
            name
          )
        `)
        .eq('id', childId)
        .single();

      if (childError) throw childError;
      setChild(childData);

      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay() + 1);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const { data: weekData, error: weekError } = await supabase
        .from('reservations')
        .select(`
          *,
          menus (
            id,
            name,
            description,
            price,
            date
          )
        `)
        .eq('child_id', childId)
        .gte('date', startOfWeek.toISOString())
        .lte('date', endOfWeek.toISOString())
        .order('date', { ascending: true });

      if (weekError) throw weekError;
      setWeekReservations(weekData || []);

      const { data: historyData, error: historyError } = await supabase
        .from('reservations')
        .select(`
          *,
          menus (
            id,
            name,
            description,
            price,
            date
          )
        `)
        .eq('child_id', childId)
        .lt('date', startOfWeek.toISOString())
        .order('date', { ascending: false })
        .limit(20);

      if (historyError) throw historyError;
      setHistoryReservations(historyData || []);

    } catch (error: any) {
      console.error('Error loading child data:', error);
      Alert.alert('Erreur', 'Impossible de charger les données de l\'enfant');
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (birthDate: string) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

    return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const handleEditProfile = () => {
    router.push({
      pathname: '/(parent)/edit-child',
      params: { childId: childId as string }
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </SafeAreaView>
    );
  }

  if (!child) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Enfant non trouvé</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails de l'enfant</Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={handleEditProfile}
        >
          <Edit size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.childBadge}>
          <View style={styles.avatarLarge}>
            <User size={60} color="#6B7280" />
          </View>
          <Text style={styles.childNameLarge}>{child.first_name} {child.last_name}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations du profil</Text>
          <View style={styles.profileCard}>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>École</Text>
              <Text style={styles.profileValue}>{child.schools?.name || 'Non définie'}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Classe</Text>
              <Text style={styles.profileValue}>{child.class_name || 'Non définie'}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Âge</Text>
              <Text style={styles.profileValue}>
                {child.birth_date ? `${calculateAge(child.birth_date)} ans` : 'Non défini'}
              </Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Date de naissance</Text>
              <Text style={styles.profileValue}>
                {child.birth_date ? new Date(child.birth_date).toLocaleDateString('fr-FR') : 'Non définie'}
              </Text>
            </View>
            {child.allergies && (
              <View style={[styles.profileRow, styles.allergiesRow]}>
                <AlertCircle size={20} color="#EF4444" />
                <View style={styles.allergiesContent}>
                  <Text style={styles.profileLabel}>Allergies</Text>
                  <Text style={styles.allergiesText}>{child.allergies}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Repas de la semaine</Text>
          {weekReservations.length > 0 ? (
            <View style={styles.reservationsList}>
              {weekReservations.map((reservation) => (
                <View key={reservation.id} style={styles.reservationCard}>
                  <View style={styles.reservationHeader}>
                    <View style={styles.dateIcon}>
                      <Calendar size={20} color="#6B7280" />
                    </View>
                    <View style={styles.reservationInfo}>
                      <Text style={styles.reservationDate}>
                        {formatDate(reservation.date)}
                      </Text>
                      <Text style={styles.reservationMenuName}>
                        {reservation.menus.name}
                      </Text>
                    </View>
                    <Text style={styles.reservationPrice}>
                      {reservation.menus.price.toFixed(2)}€
                    </Text>
                  </View>
                  {reservation.menus.description && (
                    <Text style={styles.reservationDescription}>
                      {reservation.menus.description}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Calendar size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>
                Aucun repas réservé cette semaine
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historique des réservations</Text>
          {historyReservations.length > 0 ? (
            <View style={styles.reservationsList}>
              {historyReservations.map((reservation) => (
                <View key={reservation.id} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <Clock size={16} color="#9CA3AF" />
                    <Text style={styles.historyDate}>
                      {formatDate(reservation.date)}
                    </Text>
                  </View>
                  <Text style={styles.historyMenuName}>
                    {reservation.menus.name}
                  </Text>
                  <Text style={styles.historyPrice}>
                    {reservation.menus.price.toFixed(2)}€
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Clock size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>
                Aucun historique de réservation
              </Text>
            </View>
          )}
        </View>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  editButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  childBadge: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  childNameLarge: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  profileLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  profileValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  allergiesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderBottomWidth: 0,
  },
  allergiesContent: {
    flex: 1,
  },
  allergiesText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '600',
    marginTop: 4,
  },
  reservationsList: {
    gap: 12,
  },
  reservationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  reservationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reservationInfo: {
    flex: 1,
  },
  reservationDate: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 2,
  },
  reservationMenuName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  reservationPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  reservationDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  historyDate: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  historyMenuName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  historyPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
    textAlign: 'center',
  },
});
