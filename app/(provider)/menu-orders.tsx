import { useCallback, useEffect, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Platform } from 'react-native';
import { showAlert } from '@/lib/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { safeBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import {
  aggregateOrderSupplements,
  formatSupplementAggregate,
  OrderSupplement,
  parseOrderSupplements,
} from '@/lib/order-supplements';
import { AlertTriangle, ArrowLeft, Check, FileDown, Users as UsersIcon } from 'lucide-react-native';

type ExportFormat = 'csv' | 'xlsx';

interface OrderDetail {
  id: string;
  child_name: string;
  child_initial: string;
  parent_name: string;
  school_id: string;
  school_name: string;
  grade: string | null;
  genre: string | null;
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
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx');
  const [exportGenre, setExportGenre] = useState<'all' | 'fille' | 'garcon'>('all');
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

      if (!date || menuIds.length === 0) {
        setOrders([]);
        return;
      }

      let reservationsQuery = supabase
        .from('reservations')
        .select('id, child_id, parent_id, supplements')
        .eq('date', date)
        .neq('payment_status', 'cancelled')
        .order('created_at', { ascending: true });

      reservationsQuery = menuIds.length === 1
        ? reservationsQuery.eq('menu_id', menuIds[0])
        : reservationsQuery.in('menu_id', menuIds);

      const { data: reservationsData, error: reservationsError } = await reservationsQuery;

      if (reservationsError) {
        throw reservationsError;
      }

      const reservations = reservationsData || [];

      if (reservations.length === 0) {
        setOrders([]);
        return;
      }

      const childIds = Array.from(new Set(reservations.map((r: any) => r.child_id).filter(Boolean)));
      const parentIds = Array.from(new Set(reservations.map((r: any) => r.parent_id).filter(Boolean)));

      const [childrenResult, parentsResult] = await Promise.all([
        childIds.length > 0
          ? supabase
              .from('children')
              .select('id, first_name, last_name, grade, allergies, dietary_restrictions, school_id, genre')
              .in('id', childIds)
          : Promise.resolve({ data: [], error: null }),
        parentIds.length > 0
          ? supabase
              .from('parents')
              .select('id, first_name, last_name')
              .in('id', parentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (childrenResult.error) throw childrenResult.error;
      if (parentsResult.error) throw parentsResult.error;

      const childrenList = (childrenResult.data || []) as any[];
      const parentsList = (parentsResult.data || []) as any[];

      const schoolIds = Array.from(new Set(childrenList.map((c: any) => c.school_id).filter(Boolean)));
      let schoolsList: any[] = [];
      if (schoolIds.length > 0) {
        const { data: schoolsData, error: schoolsError } = await supabase
          .from('schools')
          .select('id, name')
          .in('id', schoolIds);
        if (schoolsError) throw schoolsError;
        schoolsList = schoolsData || [];
      }

      const childrenById = new Map(childrenList.map((c: any) => [c.id, c]));
      const parentsById = new Map(parentsList.map((p: any) => [p.id, p]));
      const schoolsById = new Map(schoolsList.map((s: any) => [s.id, s]));

      const formattedOrders: OrderDetail[] = reservations.map((reservation: any) => {
        const child = childrenById.get(reservation.child_id);
        const parent = parentsById.get(reservation.parent_id);
        const school = child ? schoolsById.get(child.school_id) : null;

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
          genre: child?.genre || null,
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
    return orders.filter(order =>
      (exportSchoolId === 'all' || order.school_id === exportSchoolId) &&
      (exportGenre === 'all' || order.genre === exportGenre)
    );
  };

  const handleOpenExport = () => {
    setExportSchoolId(selectedSchoolId);
    setShowExportModal(true);
  };

  const buildExportRows = (ordersToExport: OrderDetail[]) => {
    return [...ordersToExport]
      .sort((a, b) => {
        const schoolCompare = a.school_name.localeCompare(b.school_name, 'fr-FR');
        if (schoolCompare !== 0) return schoolCompare;
        return a.child_name.localeCompare(b.child_name, 'fr-FR');
      })
      .map((order) => {
        const supplementAggregates = aggregateOrderSupplements([order.supplements]);
        const supplementSummary = supplementAggregates.length > 0
          ? supplementAggregates.map(formatSupplementAggregate).join(' | ')
          : 'Aucun';
        const allergies = order.allergies.length > 0 ? order.allergies.join(', ') : 'Aucune';
        const dietaryRestrictions = order.dietary_restrictions.length > 0
          ? order.dietary_restrictions.join(', ')
          : 'Aucune';

        return [
          order.school_name,
          order.child_name,
          order.genre === 'fille' ? 'Fille' : order.genre === 'garcon' ? 'Garçon' : '',
          order.grade || '',
          order.parent_name,
          allergies,
          dietaryRestrictions,
          supplementSummary,
        ] as (string | number)[];
      });
  };

  const handleExport = async () => {
    const ordersToExport = getOrdersForExport();
    if (ordersToExport.length === 0) {
      showAlert('Export impossible', 'Aucune commande à exporter pour cette sélection.');
      return;
    }

    setExporting(true);
    try {
      const header = ['École', 'Élève', 'Sexe', 'Classe', 'Parent', 'Allergies', 'Restrictions alimentaires', 'Suppléments'];
      const rows = buildExportRows(ordersToExport);

      const scopeLabel = exportSchoolId === 'all'
        ? 'toutes-ecoles'
        : sanitizeFileName(schoolFilters.find(school => school.id === exportSchoolId)?.name || 'ecole');
      const baseFileName = `commandes-${sanitizeFileName(menuName)}-${date}-${scopeLabel}`;

      const isWeb = Platform.OS === 'web';

      if (exportFormat === 'xlsx') {
        const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
        worksheet['!cols'] = [
          { wch: 24 },
          { wch: 28 },
          { wch: 10 },
          { wch: 14 },
          { wch: 26 },
          { wch: 28 },
          { wch: 28 },
          { wch: 36 },
        ];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Commandes');
        const fileName = `${baseFileName}.xlsx`;

        if (isWeb) {
          XLSX.writeFile(workbook, fileName);
        } else {
          const base64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;

          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              dialogTitle: 'Exporter les commandes',
              UTI: 'org.openxmlformats.spreadsheetml.sheet',
            });
          } else {
            showAlert('Export prêt', `Le fichier Excel a été généré : ${fileName}`);
          }
        }
      } else {
        const csvContent = [
          header.map(csvEscape).join(';'),
          ...rows.map(row => row.map(csvEscape).join(';')),
        ].join('\n');

        const fileName = `${baseFileName}.csv`;

        if (isWeb) {
          const blob = new Blob([`﻿${csvContent}`], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } else {
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;

          await FileSystem.writeAsStringAsync(fileUri, `﻿${csvContent}`, {
            encoding: FileSystem.EncodingType.UTF8,
          });

          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'text/csv',
              dialogTitle: 'Exporter les commandes',
              UTI: 'public.comma-separated-values-text',
            });
          } else {
            showAlert('Export prêt', `Le fichier CSV a été généré : ${fileName}`);
          }
        }
      }

      setShowExportModal(false);
    } catch (error) {
      console.error('Error exporting orders:', error);
      showAlert('Erreur', 'Impossible de générer le fichier.');
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
        <TouchableOpacity style={styles.backButton} onPress={() => safeBack('/(provider)')}>
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

            <Text style={styles.sheetSectionTitle}>Format du fichier</Text>
            <View style={styles.formatToggle}>
              <TouchableOpacity
                style={[styles.formatOption, exportFormat === 'xlsx' && styles.formatOptionActive]}
                onPress={() => setExportFormat('xlsx')}
              >
                <Text style={[styles.formatOptionText, exportFormat === 'xlsx' && styles.formatOptionTextActive]}>
                  Excel (.xlsx)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formatOption, exportFormat === 'csv' && styles.formatOptionActive]}
                onPress={() => setExportFormat('csv')}
              >
                <Text style={[styles.formatOptionText, exportFormat === 'csv' && styles.formatOptionTextActive]}>
                  CSV (.csv)
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sheetSectionTitle}>Sexe à inclure</Text>
            <View style={styles.formatToggle}>
              <TouchableOpacity
                style={[styles.formatOption, exportGenre === 'all' && styles.formatOptionActive]}
                onPress={() => setExportGenre('all')}
              >
                <Text style={[styles.formatOptionText, exportGenre === 'all' && styles.formatOptionTextActive]}>Tous</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formatOption, exportGenre === 'fille' && styles.formatOptionActive]}
                onPress={() => setExportGenre('fille')}
              >
                <Text style={[styles.formatOptionText, exportGenre === 'fille' && styles.formatOptionTextActive]}>Filles</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formatOption, exportGenre === 'garcon' && styles.formatOptionActive]}
                onPress={() => setExportGenre('garcon')}
              >
                <Text style={[styles.formatOptionText, exportGenre === 'garcon' && styles.formatOptionTextActive]}>Garçons</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sheetSectionTitle}>Écoles à inclure</Text>

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
              onPress={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sheetExportButtonText}>
                  {exportFormat === 'xlsx' ? 'Exporter en Excel' : 'Exporter en CSV'}
                </Text>
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
    marginBottom: 18,
  },
  sheetSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  formatToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 4,
    marginBottom: 22,
  },
  formatOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatOptionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  formatOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  formatOptionTextActive: {
    color: '#111827',
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
