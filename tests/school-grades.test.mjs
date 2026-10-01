import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGradeOptions, getSchoolGradeRule, isGradeAllowed, isPrimaryOnlySchool, isSecondaryOnlySchool } from '../lib/school-grades.ts';

test('La Vertu accepts every primary grade, including CM2, and no secondary grade', () => {
  const school = { name: 'La Vertu' };
  assert.deepEqual(getGradeOptions(school).flatMap(s => s.grades), [
    'Petite Section', 'Moyenne Section', 'Grande Section', 'CP', 'CE1', 'CE2', 'CM1', 'CM2',
  ]);
  for (const grade of ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale']) {
    assert.equal(isGradeAllowed(school, grade), false, grade);
  }
  assert.equal(isGradeAllowed(school, 'CM2'), true);
  assert.equal(isGradeAllowed(school, ''), true);
});

test('school names tolerate case, prefixes and separators without matching another name', () => {
  for (const name of ['LA VERTU', 'École La Vertu', ' La  Vertu ', 'La-Vertu']) {
    assert.equal(isPrimaryOnlySchool({ name }), true, name);
  }
  for (const name of ['Autre école', 'La Vertueuse']) {
    assert.equal(isPrimaryOnlySchool({ name }), false, name);
  }
});

test('transfers preserve compatible grades and require resetting an incompatible grade', () => {
  const primary = { name: 'La Vertu' };
  const secondary = { name: 'Autre école' };
  assert.equal(isGradeAllowed(secondary, '6ème'), true);
  assert.equal(isGradeAllowed(primary, '6ème'), false);
  assert.equal(isGradeAllowed(primary, 'CM1'), true);
  assert.equal(isGradeAllowed(secondary, 'CM1'), true);
  assert.equal(isGradeAllowed(secondary, 'Terminale'), true);
  assert.equal(getGradeOptions(null).length, 4);
  assert.equal(isGradeAllowed(secondary, 'Ancienne classe personnalisée'), true);
});

test('CNED EIM offers only collège/lycée and requires a secondary grade', () => {
  const school = { name: 'CNED EIM' };
  const allowed = ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'];
  assert.deepEqual(getGradeOptions(school).map(s => s.section), ['Collège', 'Lycée']);
  assert.deepEqual(getGradeOptions(school).flatMap(s => s.grades), allowed);
  for (const grade of allowed) assert.equal(isGradeAllowed(school, grade), true, grade);
  for (const grade of ['Petite Section', 'Moyenne Section', 'Grande Section', 'CP', 'CE1', 'CE2', 'CM1', 'CM2', '', '  ', 'Classe personnalisée']) {
    assert.equal(isGradeAllowed(school, grade), false, grade);
  }
  assert.equal(isGradeAllowed(school, ' 6ème '), true);
  assert.match(getSchoolGradeRule(school), /collège et lycée uniquement/);
  assert.equal(isGradeAllowed({ name: 'La Vertu' }, 'CE2'), true);
  assert.equal(isGradeAllowed(school, 'CE2'), false); // Switching to CNED clears this selection in both forms.
});

test('CNED matching accepts capitalization and separators without restricting unrelated schools', () => {
  for (const name of ['CNED EIM', 'École CNED EIM', ' cned  eim ', 'CNED-EIM']) {
    assert.equal(isSecondaryOnlySchool({ name }), true, name);
  }
  for (const name of ['Autre école', 'CNED EIME', 'CNED Autre', 'AutreCNED EIM']) {
    assert.equal(isSecondaryOnlySchool({ name }), false, name);
    assert.equal(isGradeAllowed({ name }, 'CE2'), true, name);
  }
});
