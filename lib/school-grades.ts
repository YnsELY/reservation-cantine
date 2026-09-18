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

export function getGradeOptions(school: SchoolName) {
  return isPrimaryOnlySchool(school) ? GRADE_OPTIONS.slice(0, 2) : GRADE_OPTIONS;
}

export function isGradeAllowed(school: SchoolName, grade: string): boolean {
  // Preserve legacy grades at other schools; grade remains optional.
  return !isPrimaryOnlySchool(school) || !grade.trim() || getGradeOptions(school).some(section => section.grades.includes(grade.trim()));
}
