// Run with PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/child-school-changes.test.mjs
// Uses an isolated PostgreSQL engine; never connects to the application database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('school changes enforce access/grades atomically and preserve paid meals and siblings', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION public.current_school_id() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.school_id', true) $$;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT 'user-1'::text $$;
      CREATE TABLE schools (id text PRIMARY KEY, name text);
      CREATE TABLE parents (id text PRIMARY KEY, user_id text);
      CREATE TABLE parent_school_affiliations (parent_id text, school_id text, status text);
      CREATE TABLE children (id text PRIMARY KEY, parent_id text, school_id text, grade text, first_name text);
      CREATE TABLE cart_items (id text PRIMARY KEY, child_id text);
      CREATE TABLE menus (id text PRIMARY KEY, school_id text);
      CREATE TABLE reservations (id text PRIMARY KEY, child_id text, menu_id text, parent_id text);
      CREATE POLICY reservations_select_school ON reservations FOR SELECT TO authenticated USING (true);
      CREATE POLICY reservations_update_school ON reservations FOR UPDATE TO authenticated USING (true);
      CREATE POLICY children_select_school ON children FOR SELECT TO authenticated USING (school_id = public.current_school_id());
      ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE children ENABLE ROW LEVEL SECURITY;
      ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT UPDATE ON reservations TO authenticated;
      INSERT INTO schools VALUES ('primary', 'École La Vertu'), ('secondary', 'Autre école'), ('forbidden', 'École sans accès');
      INSERT INTO parents VALUES ('parent-1', 'user-1');
      INSERT INTO parent_school_affiliations VALUES ('parent-1', 'primary', 'active'), ('parent-1', 'secondary', 'active'), ('parent-1', 'forbidden', 'inactive');
      INSERT INTO children VALUES ('child-1', 'parent-1', 'secondary', '6ème', 'Alice'), ('child-2', 'parent-1', 'primary', 'CM1', 'Bob');
      INSERT INTO cart_items VALUES ('cart-1', 'child-1'), ('cart-2', 'child-2');
      INSERT INTO menus VALUES ('old-menu', 'secondary');
      INSERT INTO reservations VALUES ('paid-1', 'child-1', 'old-menu', 'parent-1');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20260918120000_child_school_changes.sql', import.meta.url), 'utf8'));
    for (const grade of ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale']) {
      await assert.rejects(db.query('INSERT INTO children VALUES ($1, $2, $3, $4, $5)', ['invalid', 'parent-1', 'primary', grade, 'Test']), /CM2/);
    }
    await assert.rejects(db.exec("UPDATE children SET school_id = 'primary' WHERE id = 'child-1'"), /CM2/);
    await assert.rejects(db.exec("UPDATE children SET school_id = 'forbidden' WHERE id = 'child-1'"), /code d’accès/);
    assert.equal((await db.query('SELECT * FROM cart_items')).rows.length, 2);
    assert.equal((await db.query("SELECT school_id FROM children WHERE id = 'child-1'")).rows[0].school_id, 'secondary');
    await db.exec("UPDATE children SET grade = '5ème' WHERE id = 'child-1'");
    assert.equal((await db.query('SELECT * FROM cart_items')).rows.length, 2);
    await db.exec("UPDATE children SET school_id = 'primary', grade = 'CM2' WHERE id = 'child-1'");
    assert.deepEqual((await db.query('SELECT * FROM cart_items')).rows, [{ id: 'cart-2', child_id: 'child-2' }]);
    assert.deepEqual((await db.query('SELECT * FROM reservations')).rows, [{ id: 'paid-1', child_id: 'child-1', menu_id: 'old-menu', parent_id: 'parent-1' }]);
    assert.equal((await db.query("SELECT school_id FROM children WHERE id = 'child-2'")).rows[0].school_id, 'primary');
    // Old school retains its orders and their identities; new school gets no old orders.
    await db.exec("SET ROLE authenticated; SET test.school_id = 'secondary'");
    assert.equal((await db.query('SELECT * FROM reservations')).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM children WHERE id = 'child-1'")).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM parents')).rows.length, 1);
    await db.exec("SET test.school_id = 'primary'");
    assert.equal((await db.query('SELECT * FROM reservations')).rows.length, 0);
    assert.equal((await db.query("UPDATE reservations SET id = 'should-not-change' RETURNING id")).rows.length, 0);
    await db.exec("SET test.school_id = 'forbidden'");
    assert.equal((await db.query('SELECT * FROM children')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM parents')).rows.length, 0);
    await db.exec('RESET ROLE');
    // Unrelated profile edits and saving the unchanged school leave the cart alone.
    await db.exec("UPDATE children SET first_name = 'Robert', school_id = 'primary', grade = 'CM1' WHERE id = 'child-2'");
    assert.equal((await db.query('SELECT * FROM cart_items')).rows.length, 1);
    await db.exec("UPDATE children SET school_id = 'secondary', grade = '6ème' WHERE id = 'child-1'");
    await db.exec("INSERT INTO children VALUES ('optional-grade', 'parent-1', 'primary', NULL, 'Test')");
    await db.exec("INSERT INTO children VALUES ('maternelle', 'parent-1', 'primary', 'Petite Section', 'Test')");
  } finally {
    await db.close();
  }
});
