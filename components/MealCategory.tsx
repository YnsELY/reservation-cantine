import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MEAL_CATEGORIES, mealCategoryLabel, type MealCategoryFilter } from '@/lib/meal-category';

export function MealCategoryBadge({ category }: { category?: unknown }) {
  return <View style={styles.badge}><Text style={styles.badgeText}>{mealCategoryLabel(category)}</Text></View>;
}

export function MealCategoryTabs({ value, onChange, includeAll = true }: {
  value: MealCategoryFilter;
  onChange: (value: MealCategoryFilter) => void;
  includeAll?: boolean;
}) {
  const options: { value: MealCategoryFilter; label: string }[] = [
    ...(includeAll ? [{ value: 'all' as const, label: 'Tout' }] : []), ...MEAL_CATEGORIES,
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.scroll}>
      {options.map(option => (
        <TouchableOpacity key={option.value} onPress={() => onChange(option.value)}
          accessibilityRole="tab" aria-selected={value === option.value} accessibilityState={{ selected: value === option.value }}
          style={[styles.tab, value === option.value && styles.selected]}>
          <Text style={[styles.tabText, value === option.value && styles.selectedText]}>{option.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  selected: { backgroundColor: '#0E5FC0', borderColor: '#0E5FC0' },
  tabText: { color: '#6B7280', fontSize: 13, fontWeight: '600' },
  selectedText: { color: '#FFFFFF' },
  badge: { alignSelf: 'flex-start', backgroundColor: '#EAF4FC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginVertical: 5 },
  badgeText: { color: '#0B3D91', fontSize: 11, fontWeight: '600' },
});
