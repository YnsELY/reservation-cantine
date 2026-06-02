import { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import type { ExportFormat } from '@/lib/exports';

interface Props {
  visible: boolean;
  onClose: () => void;
  format: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  onExport: () => void;
  exporting: boolean;
  title?: string;
  /** Sections de filtres additionnelles (ex: Sexe, Écoles), rendues sous le choix du format */
  children?: ReactNode;
}

const FORMATS: { key: ExportFormat; label: string }[] = [
  { key: 'xlsx', label: 'Excel' },
  { key: 'csv', label: 'CSV' },
  { key: 'pdf', label: 'PDF' },
];

const formatVerb = (f: ExportFormat) => (f === 'xlsx' ? 'Excel' : f === 'csv' ? 'CSV' : 'PDF');

/**
 * Modale d'export standard (bottom sheet) : choix du format (Excel / CSV / PDF),
 * sections de filtres optionnelles, puis bouton d'export. Memes styles que
 * l'ecran "Detail des commandes" pour un rendu coherent partout.
 */
export function ExportSheet({
  visible,
  onClose,
  format,
  onFormatChange,
  onExport,
  exporting,
  title = 'Exporter',
  children,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.exportSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>

          <Text style={styles.sheetSectionTitle}>Format du fichier</Text>
          <View style={styles.formatToggle}>
            {FORMATS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.formatOption, format === f.key && styles.formatOptionActive]}
                onPress={() => onFormatChange(f.key)}
              >
                <Text style={[styles.formatOptionText, format === f.key && styles.formatOptionTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {children}

          <TouchableOpacity
            style={[styles.sheetExportButton, exporting && styles.sheetExportButtonDisabled]}
            onPress={onExport}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.sheetExportButtonText}>Exporter en {formatVerb(format)}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
