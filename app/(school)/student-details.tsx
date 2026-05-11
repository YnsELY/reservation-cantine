import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { ArrowLeft, User } from 'lucide-react-native';
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
  payment_status: string | null;
  menus?: {
    meal_name: string;
    description: string | null;
    price: number | null;
  } | null;
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const formatLongDate = (dateString: string) => {
  const date = new Date(dateString + 'T12:00:00');
  return capitalize(date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }));
};

const formatBirthDate = (dateString: string) => {
  const date = new Date(dateString + 'T12:00:00');
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const computeAge = (dateString: string | null): number | null => {
  if (!dateString) return null;
  const birth = new Date(dateString + 'T12:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
};

const todayString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStatusLabel = (status: string | null): string => {
  switch (status) {
    case 'paid': return 'Payée';
    case 'pending': return 'En attente';
    case 'cancelled': return 'Annulée';
    default: return 'Non défini';
  }
};

export default function StudentDetailsScreen() {
  const params = useLocalSearchParams();
  const childIdValue = Array.isArray(params.childId) ? params.childId[0] : params.childId;
  const reservationIdValue = Array.isArray(params.reservationId) ? params.reservationId[0] : params.reservationId;

  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [reservations, setReservations] = useState<StudentReservation[]>([]);

  useEffect(() => {
    if (childIdValue) {
      loadData();
    } else {
      setLoading(false);
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
          schools:school_id(name),
          parents:parent_id(first_name, last_name, phone, email)
        `)
        .eq('id', childIdValue)
        .eq('school_id', currentSchool.id)
        .maybeSingle();

      if (studentError) throw studentError;
      if (!studentData) {
        setStudent(null);
        return;
      }
      setStudent(studentData as StudentDetails);

      const { data: reservationsData, error: reservationsError } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          total_price,
          annotations,
          payment_status,
          menus:menu_id(meal_name, description, price)
        `)
        .eq('child_id', childIdValue)
        .order('date', { ascending: false })
        .limit(50);

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

  const selectedReservation = useMemo(() => {
    if (reservationIdValue) {
      const found = reservations.find(r => r.id === reservationIdValue);
      if (found) return found;
    }
    const today = todayString();
    const upcoming = reservations
      .filter(r => r.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (upcoming.length > 0) return upcoming[0];
    return reservations[0] || null;
  }, [reservations, reservationIdValue]);

  const otherUpcomingReservations = useMemo(() => {
    if (!selectedReservation) return [];
    const today = todayString();
    return reservations
      .filter(r => r.id !== selectedReservation.id && r.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [reservations, selectedReservation]);

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
  const age = computeAge(student.date_of_birth);
  const parentName = student.parents
    ? `${student.parents.first_name || ''} ${student.parents.last_name || ''}`.trim()
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => safeBack('/(school)/students')}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails de l'élève</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {selectedReservation && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Détail de la commande</Text>
            <View style={styles.reservationCard}>
              <View style={styles.datePill}>
                <Text style={styles.datePillText}>{formatLongDate(selectedReservation.date)}</Text>
              </View>
              <Text style={styles.menuName}>{selectedReservation.menus?.meal_name || 'Menu'}</Text>
              {selectedReservation.menus?.description && (
                <Text style={styles.menuDescription}>{selectedReservation.menus.description}</Text>
              )}

              <View style={styles.reservationDivider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Statut</Text>
                <Text style={styles.infoValue}>{getStatusLabel(selectedReservation.payment_status)}</Text>
              </View>
              <View style={styles.reservationRowDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Prix menu</Text>
                <Text style={styles.infoValue}>
                  {Number(selectedReservation.menus?.price ?? 0).toFixed(2)} DH
                </Text>
              </View>
              <View style={styles.reservationRowDivider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Total commande</Text>
                <Text style={styles.infoValueStrong}>
                  {Number(selectedReservation.total_price ?? 0).toFixed(2)} DH
                </Text>
              </View>

              {selectedReservation.annotations && (
                <Text style={styles.reservationNote}>Note: {selectedReservation.annotations}</Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Allergies et restrictions</Text>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Allergies</Text>
            {allergies.length > 0 ? (
              <View style={styles.pillRow}>
                {allergies.map(allergy => (
                  <View key={allergy} style={styles.allergyPill}>
                    <Text style={styles.allergyPillText}>{allergy}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.mutedText}>Aucune allergie</Text>
            )}

            <View style={styles.cardSpacer} />

            {dietaryRestrictions.length > 0 ? (
              <>
                <Text style={styles.cardLabel}>Restrictions</Text>
                <View style={styles.pillRow}>
                  {dietaryRestrictions.map(restriction => (
                    <View key={restriction} style={styles.restrictionPill}>
                      <Text style={styles.restrictionPillText}>{restriction}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.mutedText}>Aucune restriction alimentaire</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fiche profil</Text>
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <User size={48} color="#9CA3AF" />
            </View>
            <Text style={styles.studentName}>{student.first_name} {student.last_name}</Text>
          </View>

          <View style={styles.infoTable}>
            <InfoTableRow label="École" value={student.schools?.name || 'Non définie'} />
            <InfoTableRow label="Classe" value={student.grade || 'Non définie'} />
            <InfoTableRow label="Parent" value={parentName || 'Non défini'} />
            <InfoTableRow label="Téléphone parent" value={student.parents?.phone || 'Non défini'} />
            <InfoTableRow label="Email parent" value={student.parents?.email || 'Non défini'} />
            <InfoTableRow label="Âge" value={age !== null ? `${age} ans` : 'Non défini'} />
            <InfoTableRow
              label="Date de naissance"
              value={student.date_of_birth ? formatBirthDate(student.date_of_birth) : 'Non définie'}
              isLast
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Autres commandes à venir</Text>
          {otherUpcomingReservations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.mutedText}>Aucune autre commande à venir</Text>
            </View>
          ) : (
            otherUpcomingReservations.map(reservation => (
              <TouchableOpacity
                key={reservation.id}
                style={styles.upcomingCard}
                activeOpacity={0.8}
                onPress={() => router.push(`/(school)/student-details?childId=${student.id}&reservationId=${reservation.id}`)}
              >
                <View style={styles.upcomingHeader}>
                  <View style={styles.upcomingDatePill}>
                    <Text style={styles.upcomingDatePillText}>{formatLongDate(reservation.date)}</Text>
                  </View>
                  <Text style={styles.upcomingPrice}>
                    {Number(reservation.total_price ?? 0).toFixed(2)} DH
                  </Text>
                </View>
                <Text style={styles.upcomingMeal}>{reservation.menus?.meal_name || 'Menu'}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoTableRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View style={[styles.tableRow, !isLast && styles.tableRowBorder]}>
      <Text style={styles.tableLabel}>{label}</Text>
      <Text style={styles.tableValue}>{value}</Text>
    </View>
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
    fontSize: 20,
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  reservationCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4F46E5',
    borderRadius: 16,
    padding: 20,
  },
  datePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  datePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4F46E5',
  },
  menuName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  reservationDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  reservationRowDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  infoValueStrong: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  reservationNote: {
    marginTop: 12,
    fontSize: 13,
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 10,
  },
  cardSpacer: {
    height: 12,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  allergyPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  allergyPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  restrictionPill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  restrictionPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  mutedText: {
    fontSize: 14,
    color: '#6B7280',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  studentName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  infoTable: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tableLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  tableValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 16,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  upcomingCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  upcomingDatePill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  upcomingDatePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  upcomingPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  upcomingMeal: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
});
