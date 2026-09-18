import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGradeOptions, isGradeAllowed, isPrimaryOnlySchool } from '../lib/school-grades.ts';

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
