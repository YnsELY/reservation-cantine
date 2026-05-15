import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { FileDown, FileText, FileSpreadsheet } from 'lucide-react-native';
import type { ExportFormat } from '@/lib/exports';

interface Props {
  exporting: boolean;
  onExport: (fmt: ExportFormat) => void;
  showCsv?: boolean;
}

export function ExportRow({ exporting, onExport, showCsv = true }: Props) {
  return (
    <View style={styles.exportRow}>
      <View style={styles.labelRow}>
        <FileDown size={14} color="#4F46E5" />
        <Text style={styles.exportLabel}>Exporter</Text>
      </View>
      <View style={styles.exportButtons}>
        <TouchableOpacity style={styles.exportBtn} disabled={exporting} onPress={() => onExport('xlsx')}>
          <FileSpreadsheet size={16} color="#10B981" />
          <Text style={styles.exportBtnText}>Excel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} disabled={exporting} onPress={() => onExport('pdf')}>
          <FileText size={16} color="#EF4444" />
          <Text style={styles.exportBtnText}>PDF</Text>
        </TouchableOpacity>
        {showCsv && Platform.OS === 'web' && (
          <TouchableOpacity style={styles.exportBtn} disabled={exporting} onPress={() => onExport('csv')}>
            <FileSpreadsheet size={16} color="#6B7280" />
            <Text style={styles.exportBtnText}>CSV</Text>
          </TouchableOpacity>
        )}
        {exporting && <ActivityIndicator size="small" color="#4F46E5" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  exportRow: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  exportLabel: { fontSize: 12, fontWeight: '700', color: '#4F46E5', textTransform: 'uppercase', letterSpacing: 0.5 },
  exportButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
  },
  exportBtnText: { fontSize: 13, fontWeight: '600', color: '#111827' },
});
