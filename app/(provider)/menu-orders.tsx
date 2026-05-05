import { useCallback, useEffect, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  aggregateOrderSupplements,
  formatSupplementAggregate,
  OrderSupplement,
  parseOrderSupplements,
} from '@/lib/order-supplements';
import { AlertTriangle, ArrowLeft, Check, FileDown, Users as UsersIcon } from 'lucide-react-native';

interface OrderDetail {
  id: string;
  child_name: string;
  child_initial: string;
  parent_name: string;
  school_id: string;
  school_name: string;
  grade: string | null;
  allergies: string[];
  dietary_restrictions: string[];
  supplements: OrderSupplement[];
}

interface SchoolFilter {
  id: string;
  name: string;
  count: number;
}

type SchoolScope = 'all' | string;

const getParamValue = (value: string | string[] | undefined) => (
  Array.isArray(value) ? value[0] : value || ''
);

const parseMenuIds = (rawMenuIds: string, fallbackMenuId: string) => {
  if (!rawMenuIds) {
    return fallbackMenuId ? [fallbackMenuId] : [];
  }

  const decoded = (() => {
    try {
      return decodeURIComponent(rawMenuIds);
    } catch {
      return rawMenuIds;
    }
  })();

  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
  } catch {
    return decoded.split(',').map(id => id.trim()).filter(Boolean);
  }

  return fallbackMenuId ? [fallbackMenuId] : [];
};

const formatDate = (dateStr: string) => {
  if (!dateStr) {
    return '';
  }

  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const sanitizeFileName = (value: string) => (
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'commandes'
);

export default function MenuOrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState<SchoolScope>('all');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportSchoolId, setExportSchoolId] = useState<SchoolScope>('all');
  const [exporting, setExporting] = useState(false);

  const menuName = getParamValue(params.menuName as string | string[] | undefined);
  const date = getParamValue(params.date as string | string[] | undefined);
  const menuId = getParamValue(params.menuId as string | string[] | undefined);
  const rawMenuIds = getParamValue(params.menuIds as string | string[] | undefined);

  const menuIds = useMemo(() => parseMenuIds(rawMenuIds, menuId), [rawMenuIds, menuId]);

  const schoolFilters = useMemo<SchoolFilter[]>(() => {
    const schoolsMap = new Map<string, SchoolFilter>();

    orders.forEach((order) => {
      const existing = schoolsMap.get(order.school_id);
      if (existing) {
        existing.count += 1;
        return;
      }

      schoolsMap.set(order.school_id, {
        id: order.school_id,
        name: order.school_name,
        count: 1,
      });
    });

    return Array.from(schoolsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'fr-FR'));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (selectedSchoolId === 'all') {
      return orders;
    }

    return orders.filter(order => order.school_id === selectedSchoolId);
  }, [orders, selectedSchoolId]);

  useEffect(() => {
    if (selectedSchoolId !== 'all' && !schoolFilters.some(school => school.id === selectedSchoolId)) {
      setSelectedSchoolId('all');
    }
  }, [schoolFilters, selectedSchoolId]);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('reservations')
        .select(`
          id,
          supplements,
          children!inner(
            id,
            first_name,
            last_name,
            grade,
            allergies,
            dietary_restrictions,
            parent_id,
            school_id,
            school:schools(id, name)
          ),
          parent:parents(
            id,
            first_name,
            last_name
          )
        `)
        .eq('date', date)
        .neq('payment_status', 'cancelled')
        .order('created_at', { ascending: true });

      query = menuIds.length === 1
        ? query.eq('menu_id', menuIds[0])
        : query.in('menu_id', menuIds);

      const { data: reservationsData, error } = await query;

      if (error) {
        throw error;
      }

      const formattedOrders: OrderDetail[] = (reservationsData || []).map((reservation: any) => {
        const child = Array.isArray(reservation.children) ? reservation.children[0] : reservation.children;
        const parent = Array.isArray(reservation.parent) ? reservation.parent[0] : reservation.parent;
        const school = Array.isArray(child?.school) ? child.school[0] : child?.school;
        const childName = `${child?.first_name || ''} ${child?.last_name || ''}`.trim() || 'Élève';
        const parentName = `${parent?.first_name || ''} ${parent?.last_name || ''}`.trim() || 'Parent non renseigné';
        const schoolId = child?.school_id || 'unknown';

        return {
          id: reservation.id,
          child_name: childName,
          child_initial: childName.charAt(0).toUpperCase() || '?',
          parent_name: parentName,
          school_id: schoolId,
          school_name: school?.name || 'École non renseignée',
          grade: child?.grade || null,
          allergies: Array.isArray(child?.allergies) ? child.allergies : [],
          dietary_restrictions: Array.isArray(child?.dietary_restrictions) ? child.dietary_restrictions : [],
          supplements: parseOrderSupplements(reservation.supplements),
        };
      });

      setOrders(formattedOrders);
    } catch (err) {
      console.error('Error loading orders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, menuIds]);

  useEffect(() => {
    if (menuIds.length > 0 && date) {
      loadOrders();
      return;
    }

    setLoading(false);
  }, [date, loadOrders, menuIds.length]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const getOrdersForExport = () => {
    if (exportSchoolId === 'all') {
      return orders;
    }

    return orders.filter(order => order.school_id === exportSchoolId);
  };

  const handleOpenExport = () => {
    setExportSchoolId(selectedSchoolId);
    setShowExportModal(true);
  };

  const exportToCSV = async () => {
    const ordersToExport = getOrdersForExport();
    if (ordersToExport.length === 0) {
      Alert.alert('Export impossible', 'Aucune commande à exporter pour cette sélection.');
      return;
    }

    setExporting(true);
    try {
      const groupedBySchool = new Map<string, { schoolName: string; orders: OrderDetail[] }>();

      ordersToExport.forEach((order) => {
        const existing = groupedBySchool.get(order.school_id);
        if (existing) {
          existing.orders.push(order);
          return;
        }

        groupedBySchool.set(order.school_id, {
          schoolName: order.school_name,
          orders: [order],
        });
      });

      const header = ['École', 'Jour', 'Menu', 'Quantité', 'Suppléments + quantités'];
      const rows = Array.from(groupedBySchool.values())
        .sort((a, b) => a.schoolName.localeCompare(b.schoolName, 'fr-FR'))
        .map((schoolGroup) => {
          const supplements = aggregateOrderSupplements(
            schoolGroup.orders.map(order => order.supplements)
          );
          const supplementSummary = supplements.length > 0
            ? supplements.map(formatSupplementAggregate).join(' | ')
            : 'Aucun';

          return [
            schoolGroup.schoolName,
            formatDate(date),
            menuName,
            schoolGroup.orders.length,
            supplementSummary,
          ];
        });

      const csvContent = [
        header.map(csvEscape).join(';'),
        ...rows.map(row => row.map(csvEscape).join(';')),
      ].join('\n');

      const scopeLabel = exportSchoolId === 'all'
        ? 'toutes-ecoles'
        : sanitizeFileName(schoolFilters.find(school => school.id === exportSchoolId)?.name || 'ecole');
      const fileName = `commandes-${sanitizeFileName(menuName)}-${date}-${scopeLabel}.csv`;
      const fileUri = `${(FileSystem as any).documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, `\uFEFF${csvContent}`, {
        encoding: (FileSystem as any).EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Exporter les commandes',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Export prêt', `Le fichier CSV a été généré : ${fileName}`);
      }

      setShowExportModal(false);
    } catch (error) {
      console.error('Error exporting orders:', error);
      Alert.alert('Erreur', 'Impossible de générer le fichier CSV.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#111827" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails des commandes</Text>
        <TouchableOpacity
          style={[styles.exportButton, orders.length === 0 && styles.exportButtonDisabled]}
          onPress={handleOpenExport}
          disabled={orders.length === 0}
        >
          <FileDown size={17} color="#FFFFFF" />
          <Text style={styles.exportButtonText}>Exporter</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoCard}>
          <Text style={styles.menuName}>{menuName}</Text>
          <Text style={styles.dateText}>{formatDate(date)}</Text>
          <View style={styles.totalBadge}>
            <UsersIcon size={18} color="#FFFFFF" />
            <Text style={styles.totalText}>
              {filteredOrders.length} commande{filteredOrders.length > 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
          style={styles.filtersScroll}
        >
          <TouchableOpacity
            style={[styles.filterPill, selectedSchoolId === 'all' && styles.filterPillActive]}
            onPress={() => setSelectedSchoolId('all')}
          >
            <Text style={[styles.filterText, selectedSchoolId === 'all' && styles.filterTextActive]}>
              Toutes ({orders.length})
            </Text>
          </TouchableOpacity>
          {schoolFilters.map((school) => (
            <TouchableOpacity
              key={school.id}
              style={[styles.filterPill, selectedSchoolId === school.id && styles.filterPillActive]}
              onPress={() => setSelectedSchoolId(school.id)}
            >
              <Text style={[styles.filterText, selectedSchoolId === school.id && styles.filterTextActive]}>
                {school.name} ({school.count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredOrders.length === 0 ? (
          <View style={styles.emptyContainer}>
            <UsersIcon size={46} color="#9CA3AF" />
            <Text style={styles.emptyText}>Aucune commande pour cette sélection</Text>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {filteredOrders.map((order) => {
              const hasHealthInfo = order.allergies.length > 0 || order.dietary_restrictions.length > 0;

              return (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderTopRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{order.child_initial}</Text>
                    </View>
                    <View style={styles.orderIdentity}>
                      <Text style={styles.childName}>{order.child_name}</Text>
                      <Text style={styles.parentName}>Parent : {order.parent_name}</Text>
                    </View>
                    {order.grade && (
                      <View style={styles.gradePill}>
                        <Text style={styles.gradeText}>{order.grade}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.schoolBadge}>
                    <Text style={styles.schoolBadgeText}>{order.school_name}</Text>
                  </View>

                  {hasHealthInfo && (
                    <View style={styles.alertBanner}>
                      <AlertTriangle size={17} color="#B91C1C" />
                      <View style={styles.alertTextContainer}>
                        {order.allergies.length > 0 && (
                          <Text style={styles.alertText}>
                            <Text style={styles.alertTextStrong}>Allergies </Text>
                            {order.allergies.join(', ')}
                          </Text>
                        )}
                        {order.dietary_restrictions.length > 0 && (
                          <Text style={styles.alertText}>
                            <Text style={styles.alertTextStrong}>Restrictions </Text>
                            {order.dietary_restrictions.join(', ')}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {order.supplements.length > 0 && (
                    <View style={styles.orderSupplements}>
                      <Text style={styles.orderSupplementsTitle}>Suppléments</Text>
                      {aggregateOrderSupplements([order.supplements]).map((supplement) => (
                        <Text key={`${order.id}-${supplement.name}`} style={styles.orderSupplementLine}>
                          {formatSupplementAggregate(supplement)}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showExportModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportModal(false)}
      >
        <View style={styles.modalRoot}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowExportModal(false)}
          />
          <View style={styles.exportSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Exporter les commandes</Text>
            <Text style={styles.sheetSubtitle}>Sélectionner les écoles à inclure</Text>

            <View style={styles.exportOptions}>
              <TouchableOpacity
                style={styles.exportOption}
                onPress={() => setExportSchoolId('all')}
              >
                <View style={[styles.checkbox, exportSchoolId === 'all' && styles.checkboxActive]}>
                  {exportSchoolId === 'all' && <Check size={15} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <View style={styles.exportOptionTextContainer}>
                  <Text style={styles.exportOptionTitle}>Toutes les écoles</Text>
                  <Text style={styles.exportOptionSubtitle}>
                    {orders.length} commande{orders.length > 1 ? 's' : ''}
                  </Text>
                </View>
              </TouchableOpacity>

              {schoolFilters.map((school) => (
                <TouchableOpacity
                  key={school.id}
                  style={styles.exportOption}
                  onPress={() => setExportSchoolId(school.id)}
                >
                  <View style={[styles.checkbox, exportSchoolId === school.id && styles.checkboxActive]}>
                    {exportSchoolId === school.id && <Check size={15} color="#FFFFFF" strokeWidth={3} />}
                  </View>
                  <View style={styles.exportOptionTextContainer}>
                    <Text style={styles.exportOptionTitle}>{school.name}</Text>
                    <Text style={styles.exportOptionSubtitle}>
                      {school.count} commande{school.count > 1 ? 's' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.sheetExportButton, exporting && styles.sheetExportButtonDisabled]}
              onPress={exportToCSV}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sheetExportButtonText}>Exporter en CSV</Text>
              )}
            </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 96,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#16A34A',
  },
  exportButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  exportButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: '#111827',
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 16,
    borderRadius: 20,
    padding: 22,
  },
  menuName: {
    fontSize: 23,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 18,
    textTransform: 'capitalize',
  },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  totalText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  filtersScroll: {
    marginBottom: 16,
  },
  filtersContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#EEF0F3',
  },
  filterPillActive: {
    backgroundColor: '#111827',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  emptyContainer: {
    paddingVertical: 64,
    paddingHorizontal: 36,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  ordersList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEF0F3',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  orderIdentity: {
    flex: 1,
  },
  childName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  parentName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  gradePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  gradeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  schoolBadge: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
  },
  schoolBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  alertTextContainer: {
    flex: 1,
    gap: 3,
  },
  alertText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#991B1B',
  },
  alertTextStrong: {
    fontWeight: '900',
    color: '#B91C1C',
  },
  orderSupplements: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    gap: 4,
  },
  orderSupplementsTitle: {
    marginBottom: 2,
    fontSize: 12,
    fontWeight: '800',
    color: '#4B5563',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  orderSupplementLine: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#111827',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
  },
  exportSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 18,
  },
  exportOptions: {
    gap: 10,
    marginBottom: 22,
  },
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    backgroundColor: '#111827',
  },
  exportOptionTextContainer: {
    flex: 1,
  },
  exportOptionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  exportOptionSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  sheetExportButton: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetExportButtonDisabled: {
    opacity: 0.65,
  },
  sheetExportButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
