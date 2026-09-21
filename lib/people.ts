export interface PersonName {
  first_name?: string | null;
  last_name?: string | null;
}

const compareFrenchText = (left: string, right: string) =>
  left.localeCompare(right, 'fr-FR', {
    sensitivity: 'base',
    numeric: true,
  });

const compareOptionalText = (left?: string | null, right?: string | null) => {
  const normalizedLeft = left?.trim() || '';
  const normalizedRight = right?.trim() || '';

  if (!normalizedLeft && !normalizedRight) return 0;
  if (!normalizedLeft) return 1;
  if (!normalizedRight) return -1;

  return compareFrenchText(normalizedLeft, normalizedRight);
};

export const comparePeopleByLastName = (left: PersonName, right: PersonName) =>
  compareOptionalText(left.last_name, right.last_name) ||
  compareOptionalText(left.first_name, right.first_name);

export const compareLabels = (left: string, right: string) =>
  compareOptionalText(left, right);

export const normalizeSearchText = (value?: string | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .trim();
