import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { ArrowLeft, Calendar, User, ShoppingBag, Phone, Mail, Undo2, CheckCircle2 } from 'lucide-react-native';

interface RefundData {
  id: string;
  date: string;
  total_price: number;
  cancelled_at: string;
  child: {
    first_name: string;
    last_name: string;
    school: {
      id: string;
      name: string;
    };
  };
  parent: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
  menu: {
    id: string;
    meal_name: string;
    provider: {
      id: string;
      company_name: string;
    } | null;
  };
}

export default function AdminRefundsScreen() {
  const [refunds, setRefunds] = useState<RefundData[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentParent = await authService.getCurrentParentFromAuth();
      if (!currentParent || !currentParent.is_admin) {
        router.replace('/auth');
        return;
      }
      setAdminId(currentParent.id);

      const { data: reservationsRaw } = await supabase
        .from('reservations')
        .select(`
          id,
          date,
          total_price,
          cancelled_at,
          parent_id,
          child:children!child_id(
            first_name,
            last_name,
            school:schools(id, name)
          ),
          menu:menus(
            id,
            meal_name,
            provider:providers(id, company_name)
          )
        `)
        .eq('payment_status', 'cancelled')
        .eq('refund_status', 'pending')
        .order('cancelled_at', { ascending: false });

      const parentIds = Array.from(new Set((reservationsRaw || []).map((r: any) => r.parent_id).filter(Boolean)));
      let parentsById = new Map<string, any>();
      if (parentIds.length > 0) {
        const { data: parentsData } = await supabase
          .from('parents')
          .select('id, first_name, last_name, email, phone')
          .in('id', parentIds);
        parentsById = new Map((parentsData || []).map((p: any) => [p.id, p]));
      }

      if (reservationsRaw) {
        const formatted: RefundData[] = reservationsRaw.map((r: any) => ({
          id: r.id,
          date: r.date,
          total_price: r.total_price,
          cancelled_at: r.cancelled_at,
          child: r.child,
          parent: parentsById.get(r.parent_id) || { first_name: '', last_name: '', email: null, phone: null },
          menu: r.menu,
        }));
        setRefunds(formatted);
      }
    } catch (err) {
      console.error('Error loading refunds:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRefunded = (refund: RefundData) => {
    showAlert(
      'Marquer comme remboursée',
      `Confirmez-vous avoir effectué le remboursement de ${Number(refund.total_price).toFixed(2)} DH à ${refund.parent.first_name} ${refund.parent.last_name} via le dashboard PayZone ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'default',
          onPress: async () => {
            setProcessingId(refund.id);
            try {
              const { error } = await supabase
                .from('reservations')
                .update({
                  refund_status: 'refunded',
                  refunded_at: new Date().toISOString(),
                  refunded_by: adminId,
                })
                .eq('id', refund.id);

              if (error) throw error;

              setRefunds((prev) => prev.filter((r) => r.id !== refund.id));
            } catch (err) {
              console.error('Error marking refunded:', err);
              showAlert('Erreur', "Le remboursement n'a pas pu être marqué comme effectué.");
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </SafeAreaView>
    );
  }

  const totalToRefund = refunds.reduce((sum, r) => sum + Number(r.total_price), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topSection}>
        <TouchableOpacity style={styles.backButton} onPress={() => safeBack('/(admin)')}>
          <ArrowLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Commandes à rembourser</Text>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Undo2 size={32} color="#EF4444" />
          <Text style={styles.statValue}>{refunds.length}</Text>
          <Text style={styles.statLabel}>En attente</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statCurrency}>DH</Text>
          <Text style={styles.statValue}>{totalToRefund.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Total à rembourser</Text>
        </View>
      </View>

      {refunds.length === 0 ? (
        <View style={styles.emptyContainer}>
          <CheckCircle2 size={64} color="#10B981" />
          <Text style={styles.emptyTitle}>Aucun remboursement en attente</Text>
          <Text style={styles.emptyDescription}>
            Toutes les commandes annulées ont été remboursées.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {refunds.map((refund) => (
            <View key={refund.id} style={styles.refundCard}>
              <View style={styles.refundHeader}>
                <View style={styles.schoolBadge}>
                  <Text style={styles.schoolBadgeText}>{refund.child.school.name}</Text>
                </View>
                <Text style={styles.refundPrice}>{Number(refund.total_price).toFixed(2)} DH</Text>
              </View>

              <View style={styles.refundBody}>
                <View style={styles.refundRow}>
                  <View style={styles.iconContainer}>
                    <Calendar size={18} color="#6B7280" />
                  </View>
                  <View style={styles.refundRowContent}>
                    <Text style={styles.refundRowLabel}>Repas du</Text>
                    <Text style={styles.refundRowValue}>{formatDate(refund.date)}</Text>
                  </View>
                </View>

                <View style={styles.refundRow}>
                  <View style={styles.iconContainer}>
                    <ShoppingBag size={18} color="#6B7280" />
                  </View>
                  <View style={styles.refundRowContent}>
                    <Text style={styles.refundRowLabel}>Menu</Text>
                    <Text style={styles.refundRowValue}>{refund.menu.meal_name}</Text>
                    {refund.menu.provider && (
                      <Text style={styles.refundRowSubValue}>{refund.menu.provider.company_name}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.refundRow}>
                  <View style={styles.iconContainer}>
                    <User size={18} color="#6B7280" />
                  </View>
                  <View style={styles.refundRowContent}>
                    <Text style={styles.refundRowLabel}>Élève</Text>
                    <Text style={styles.refundRowValue}>
                      {refund.child.first_name} {refund.child.last_name}
                    </Text>
                  </View>
                </View>

                <View style={styles.refundRow}>
                  <View style={styles.iconContainer}>
                    <User size={18} color="#6B7280" />
                  </View>
                  <View style={styles.refundRowContent}>
                    <Text style={styles.refundRowLabel}>Parent</Text>
                    <Text style={styles.refundRowValue}>
                      {refund.parent.first_name} {refund.parent.last_name}
                    </Text>
                  </View>
                </View>

                {refund.parent.email && (
                  <View style={styles.refundRow}>
                    <View style={styles.iconContainer}>
                      <Mail size={18} color="#6B7280" />
                    </View>
                    <View style={styles.refundRowContent}>
                      <Text style={styles.refundRowLabel}>Email</Text>
                      <Text style={styles.refundRowValue}>{refund.parent.email}</Text>
                    </View>
                  </View>
                )}

                {refund.parent.phone && (
                  <View style={styles.refundRow}>
                    <View style={styles.iconContainer}>
                      <Phone size={18} color="#6B7280" />
                    </View>
                    <View style={styles.refundRowContent}>
                      <Text style={styles.refundRowLabel}>Téléphone</Text>
                      <Text style={styles.refundRowValue}>{refund.parent.phone}</Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.refundFooter}>
                <Text style={styles.refundDate}>
                  Annulée le {formatDateTime(refund.cancelled_at)}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.markRefundedButton,
                    processingId === refund.id && styles.markRefundedButtonDisabled,
                  ]}
                  onPress={() => handleMarkRefunded(refund)}
                  disabled={processingId === refund.id}
                >
                  {processingId === refund.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <CheckCircle2 size={18} color="#FFFFFF" />
                      <Text style={styles.markRefundedButtonText}>Marquer remboursée</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
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
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  statCurrency: {
    fontSize: 32,
    fontWeight: '700',
    color: '#EF4444',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  refundCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    overflow: 'hidden',
  },
  refundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  schoolBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  schoolBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
  },
  refundPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#EF4444',
  },
  refundBody: {
    padding: 16,
    gap: 12,
  },
  refundRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  refundRowContent: {
    flex: 1,
  },
  refundRowLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  refundRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  refundRowSubValue: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  refundFooter: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  refundDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  markRefundedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
  },
  markRefundedButtonDisabled: {
    opacity: 0.6,
  },
  markRefundedButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
});
