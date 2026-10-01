// Keep the same grade labels as the existing child forms and database.
const GRADE_OPTIONS = [
  { section: 'Maternelle', grades: ['Petite Section', 'Moyenne Section', 'Grande Section'] },
  { section: 'Élémentaire', grades: ['CP', 'CE1', 'CE2', 'CM1', 'CM2'] },
  { section: 'Collège', grades: ['6ème', '5ème', '4ème', '3ème'] },
  { section: 'Lycée', grades: ['2nde', '1ère', 'Terminale'] },
];

type SchoolName = { name: string } | null | undefined;

export function isPrimaryOnlySchool(school: SchoolName): boolean {
  return /\bla[\s-]+vertu\b/i.test(school?.name || '');
}

export function isSecondaryOnlySchool(school: SchoolName): boolean {
  return /\bcned[\s-]+eim\b/i.test(school?.name || '');
}

export function getSchoolGradeRule(school: SchoolName): string {
  if (isPrimaryOnlySchool(school)) return 'La Vertu : maternelle et élémentaire, jusqu’au CM2.';
  if (isSecondaryOnlySchool(school)) return 'CNED EIM : collège et lycée uniquement. Sélectionnez une classe de la 6ème à la Terminale.';
  return '';
}

export function getGradeOptions(school: SchoolName) {
  if (isPrimaryOnlySchool(school)) return GRADE_OPTIONS.slice(0, 2);
  if (isSecondaryOnlySchool(school)) return GRADE_OPTIONS.slice(2);
  return GRADE_OPTIONS;
}

export function isGradeAllowed(school: SchoolName, grade: string): boolean {
  // CNED enrollment requires a secondary grade. Preserve the existing optional
  // grade at La Vertu, and custom legacy grades at other schools.
  if (!isPrimaryOnlySchool(school) && !isSecondaryOnlySchool(school)) return true;
  if (!grade.trim()) return !isSecondaryOnlySchool(school);
  return getGradeOptions(school).some(section => section.grades.includes(grade.trim()));
}
