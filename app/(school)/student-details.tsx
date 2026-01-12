import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, User, Calendar, Phone, Mail, School as SchoolIcon } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';

interface StudentDetails {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  date_of_birth: string | null;
  allergies: string[] | null;
  dietary_restrictions: string[] | null;
  schools?: {
    name: string;
  } | null;
  parents?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

interface StudentReservation {
  id: string;
  date: string;
  total_price: number | null;
  annotations: string | null;
  menus?: {
    meal_name: string;
    description: string | null;
    price: number | null;
  } | null;
}

export default function StudentDetailsScreen() {
  const { childId } = useLocalSearchParams();
  const childIdValue = Array.isArray(childId) ? childId[0] : childId;
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [reservations, setReservations] = useState<StudentReservation[]>([]);

  useEffect(() => {
    if (childIdValue) {
      loadData();
    }
  }, [childIdValue]);

  const loadData = async () => {
    try {
      setLoading(true);

      const currentSchool = await authService.getCurrentSchoolFromAuth();
      if (!currentSchool) {
        router.replace('/auth');
        return;
      }

      const { data: studentData, error: studentError } = await supabase
        .from('children')
        .select(`
          id,
          first_name,
          last_name,
          grade,
          date_of_birth,
          allergies,
          dietary_restrictions,
          schools(name),
          parents:parent_id(first_name, last_name, phone, email)
        `)
        .eq('id', childIdValue)
        .eq('school_id', currentSchool.id)
        .single();

      if (studentError) throw studentError;
      setStudent(studentData as StudentDetails);

      const { data: reservationsData, error: reservationsError } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          total_price,
          annotations,
          menus:menu_id(meal_name, description, price)
        `)
        .eq('child_id', childIdValue)
        .order('date', { ascending: false })
        .limit(30);

      if (reservationsError) throw reservationsError;
      setReservations((reservationsData || []) as StudentReservation[]);
    } catch (error) {
      console.error('Error loading student details:', error);
      setStudent(null);
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatShortDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  if (!student) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Élève introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  const allergies = Array.isArray(student.allergies) ? student.allergies : [];
  const dietaryRestrictions = Array.isArray(student.dietary_restrictions) ? student.dietary_restrictions : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails de l'élève</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <User size={32} color="#4F46E5" />
          </View>
          <Text style={styles.studentName}>{student.first_name} {student.last_name}</Text>
          {student.grade && (
            <Text style={styles.studentGrade}>Classe: {student.grade}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <SchoolIcon size={18} color="#4F46E5" />
              <Text style={styles.infoText}>{student.schools?.name || 'École non définie'}</Text>
            </View>
            {student.parents && (
              <View style={styles.infoRow}>
                <User size={18} color="#4F46E5" />
                <Text style={styles.infoText}>
                  Parent: {student.parents.first_name || ''} {student.parents.last_name || ''}
                </Text>
              </View>
            )}
            {student.parents?.phone && (
              <View style={styles.infoRow}>
                <Phone size={18} color="#4F46E5" />
                <Text style={styles.infoText}>{student.parents.phone}</Text>
              </View>
            )}
            {student.parents?.email && (
              <View style={styles.infoRow}>
                <Mail size={18} color="#4F46E5" />
                <Text style={styles.infoText}>{student.parents.email}</Text>
              </View>
            )}
            {student.date_of_birth && (
              <View style={styles.infoRow}>
                <Calendar size={18} color="#4F46E5" />
                <Text style={styles.infoText}>Né(e) le {formatDate(student.date_of_birth)}</Text>
              </View>
            )}
          </View>
        </View>

        {(allergies.length > 0 || dietaryRestrictions.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Allergies et restrictions</Text>
            <View style={styles.infoCard}>
              {allergies.length > 0 && (
                <View style={styles.badgeGroup}>
                  <Text style={styles.badgeLabel}>Allergies</Text>
                  <View style={styles.badgeRow}>
                    {allergies.map((allergy) => (
                      <View key={allergy} style={styles.badge}>
                        <Text style={styles.badgeText}>{allergy}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {dietaryRestrictions.length > 0 && (
                <View style={styles.badgeGroup}>
                  <Text style={styles.badgeLabel}>Restrictions</Text>
                  <View style={styles.badgeRow}>
                    {dietaryRestrictions.map((restriction) => (
                      <View key={restriction} style={styles.badgeAlt}>
                        <Text style={styles.badgeTextAlt}>{restriction}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historique des commandes</Text>
          {reservations.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyText}>Aucune commande enregistrée</Text>
            </View>
          ) : (
            reservations.map((reservation) => (
              <View key={reservation.id} style={styles.reservationCard}>
                <View style={styles.reservationHeader}>
                  <View>
                    <Text style={styles.reservationTitle}>{reservation.menus?.meal_name || 'Menu'}</Text>
                    <Text style={styles.reservationDate}>{formatDate(reservation.date)}</Text>
                  </View>
                  <View style={styles.priceTag}>
                    <Text style={styles.priceText}>{Number(reservation.total_price || 0).toFixed(2)} DH</Text>
                  </View>
                </View>
                {reservation.menus?.description && (
                  <Text style={styles.reservationDescription}>{reservation.menus.description}</Text>
                )}
                {reservation.annotations && (
                  <Text style={styles.reservationNote}>Note: {reservation.annotations}</Text>
                )}
                <View style={styles.reservationFooter}>
                  <Text style={styles.reservationDay}>{formatShortDate(reservation.date)}</Text>
                  <Text style={styles.reservationPriceDetail}>
                    Prix menu: {Number(reservation.menus?.price || 0).toFixed(2)} DH
                  </Text>
                </View>
              </View>
            ))
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitle: {
    marginLeft: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  studentGrade: {
    fontSize: 14,
    color: '#6B7280',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  badgeGroup: {
    marginBottom: 16,
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  badgeAlt: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeTextAlt: {
    fontSize: 12,
    color: '#1E3A8A',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyHistory: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  reservationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  reservationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  reservationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  reservationDate: {
    fontSize: 13,
    color: '#6B7280',
  },
  priceTag: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  priceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  reservationDescription: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 8,
  },
  reservationNote: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  reservationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reservationDay: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  reservationPriceDetail: {
    fontSize: 12,
    color: '#6B7280',
  },
});
