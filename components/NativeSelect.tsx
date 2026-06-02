import React, { useState } from 'react';
import { Platform, View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { ChevronDown, Check, X } from 'lucide-react-native';

export interface SelectOption {
  label: string;
  value: string;
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Titre affiché dans la modale (mobile natif uniquement) */
  title?: string;
  disabled?: boolean;
  /** Style du conteneur (mobile) / overrides CSS (web) */
  style?: any;
}

const CHEVRON =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")";

/**
 * Menu déroulant NATIF :
 *  - Web  : balise <select> native du navigateur (aucun pop-up).
 *  - iOS/Android : déclencheur + modale liste (comportement existant conservé,
 *    sans dépendance native supplémentaire).
 */
export function NativeSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Sélectionner',
  title,
  disabled,
  style,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) || null;

  if (Platform.OS === 'web') {
    const webStyle: any = {
      width: '100%',
      height: 48,
      paddingLeft: 16,
      paddingRight: 40,
      fontSize: 16,
      fontFamily: 'inherit',
      color: value ? '#111827' : '#9CA3AF',
      backgroundColor: disabled ? '#F3F4F6' : '#FFFFFF',
      borderWidth: 1,
      borderStyle: 'solid',
      borderColor: '#E5E7EB',
      borderRadius: 8,
      appearance: 'none',
      WebkitAppearance: 'none',
      MozAppearance: 'none',
      backgroundImage: CHEVRON,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      cursor: disabled ? 'default' : 'pointer',
      outline: 'none',
      ...(style && typeof style === 'object' ? style : {}),
    };

    const optionEls: any[] = [];
    if (placeholder) {
      optionEls.push(
        React.createElement('option', { key: '__ph', value: '', disabled: true }, placeholder)
      );
    }
    options.forEach((o) => {
      optionEls.push(React.createElement('option', { key: o.value, value: o.value }, o.label));
    });

    return React.createElement(
      'select',
      {
        value: value || '',
        disabled,
        onChange: (e: any) => onValueChange(e.target.value),
        style: webStyle,
      },
      optionEls
    );
  }

  // ---- Mobile natif : déclencheur + modale liste ----
  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, style]}
        activeOpacity={0.8}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.triggerText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={20} color="#6B7280" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title || placeholder}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <X size={24} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
              {options.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={styles.option}
                  onPress={() => {
                    onValueChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, value === o.value && styles.optionTextActive]}>
                    {o.label}
                  </Text>
                  {value === o.value && <Check size={18} color="#4F46E5" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  triggerText: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    marginRight: 8,
  },
  placeholder: {
    color: '#9CA3AF',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  sheetList: {
    marginTop: 4,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  optionText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
});
