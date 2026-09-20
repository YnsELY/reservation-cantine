// Isolated PostgreSQL engine. No connection to Supabase or real customer data.
// PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test tests/credit-reservation-rls.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('credit reservations no longer recurse; parent and school access stays isolated', async () => {
  const db = new PGlite();
  const login = async user => {
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id(user)]);
    await db.exec('SET ROLE authenticated');
  };
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE TABLE schools (id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE parents (id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE children (id uuid PRIMARY KEY, parent_id uuid, school_id uuid);
      CREATE TABLE menus (id uuid PRIMARY KEY, school_id uuid);
      CREATE TABLE reservations (id uuid PRIMARY KEY, child_id uuid, parent_id uuid, menu_id uuid, payment_status text);
      CREATE FUNCTION current_parent_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
        AS $$ SELECT id FROM public.parents WHERE user_id=auth.uid() LIMIT 1 $$;
      CREATE FUNCTION current_school_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
        AS $$ SELECT id FROM public.schools WHERE user_id=auth.uid() LIMIT 1 $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT INSERT ON reservations TO authenticated;
      ALTER TABLE children ENABLE ROW LEVEL SECURITY;
      ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY parents_select_self ON parents FOR SELECT TO authenticated USING(user_id=auth.uid());
      CREATE POLICY children_select_parent ON children FOR SELECT TO authenticated USING(parent_id=current_parent_id());
      CREATE POLICY children_select_school ON children FOR SELECT TO authenticated USING(school_id=current_school_id());
      CREATE POLICY reservations_select_parent ON reservations FOR SELECT TO authenticated USING(parent_id=current_parent_id());
      CREATE POLICY reservations_select_school ON reservations FOR SELECT TO authenticated USING(EXISTS(
        SELECT 1 FROM menus m WHERE m.id=reservations.menu_id AND m.school_id=current_school_id()
      ));
      CREATE POLICY reservations_insert_parent ON reservations FOR INSERT TO authenticated WITH CHECK(parent_id=current_parent_id());
      CREATE POLICY reservations_insert_school ON reservations FOR INSERT TO authenticated WITH CHECK(EXISTS(
        SELECT 1 FROM children c WHERE c.id=reservations.child_id AND c.school_id=current_school_id()
      ));
      CREATE POLICY children_select_school_orders ON children FOR SELECT TO authenticated USING(EXISTS(
        SELECT 1 FROM reservations r JOIN menus m ON m.id=r.menu_id
        WHERE r.child_id=children.id AND m.school_id=current_school_id()
      ));
      CREATE POLICY parents_select_school_orders ON parents FOR SELECT TO authenticated USING(EXISTS(
        SELECT 1 FROM reservations r JOIN menus m ON m.id=r.menu_id
        WHERE r.parent_id=parents.id AND m.school_id=current_school_id()
      ));
      INSERT INTO schools VALUES ('${id(1)}','${id(101)}'),('${id(2)}','${id(102)}'),('${id(3)}','${id(103)}');
      INSERT INTO parents VALUES ('${id(11)}','${id(111)}'),('${id(12)}','${id(112)}');
      INSERT INTO children VALUES ('${id(21)}','${id(11)}','${id(2)}'),('${id(22)}','${id(12)}','${id(3)}');
      INSERT INTO menus VALUES ('${id(31)}','${id(1)}'),('${id(32)}','${id(2)}'),('${id(33)}','${id(3)}');
      INSERT INTO reservations VALUES ('${id(41)}','${id(21)}','${id(11)}','${id(31)}','paid');
    `);
    await login(111);
    const reservation = `INSERT INTO reservations VALUES ('${id(42)}','${id(21)}','${id(11)}','${id(32)}','paid')`;
    await assert.rejects(db.exec(reservation), err => err.code === '42P17');
    await db.exec('RESET ROLE');
    const migration = await readFile(new URL('../supabase/migrations/20260920220000_fix_school_order_rls_recursion.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    // Reapplying the migration is safe.
    await db.exec(migration);
    await login(111);
    await db.exec(reservation);
    assert.equal((await db.query('SELECT * FROM reservations')).rows.length, 2);
    assert.equal((await db.query('SELECT * FROM children')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM parents')).rows.length, 1);
    await assert.rejects(db.exec(`INSERT INTO reservations VALUES ('${id(43)}','${id(22)}','${id(12)}','${id(33)}','paid')`), err => err.code === '42501');
    // Old school retains the historical order/identities, but cannot order for a transferred child.
    await login(101);
    assert.deepEqual((await db.query('SELECT id FROM reservations')).rows, [{ id: id(41) }]);
    assert.deepEqual((await db.query('SELECT id FROM children')).rows, [{ id: id(21) }]);
    assert.deepEqual((await db.query('SELECT id FROM parents')).rows, [{ id: id(11) }]);
    await assert.rejects(db.exec(`INSERT INTO reservations VALUES ('${id(44)}','${id(21)}','${id(11)}','${id(31)}','paid')`), err => err.code === '42501');
    // Current school sees its own order and can still create orders for its enrolled child.
    await login(102);
    assert.deepEqual((await db.query('SELECT id FROM reservations')).rows, [{ id: id(42) }]);
    await db.exec(`INSERT INTO reservations VALUES ('${id(45)}','${id(21)}','${id(11)}','${id(32)}','paid')`);
    // Unrelated school and parent gain no access to this family's orders or identities.
    await login(103);
    assert.equal((await db.query('SELECT * FROM reservations')).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM parents')).rows.length, 0);
    assert.equal((await db.query(`SELECT * FROM children WHERE id='${id(21)}'`)).rows.length, 0);
    await login(112);
    assert.equal((await db.query('SELECT * FROM reservations')).rows.length, 0);
    assert.equal((await db.query(`SELECT school_can_read_child_orders('${id(21)}') AS allowed`)).rows[0].allowed, false);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query(`SELECT school_can_read_child_orders('${id(21)}')`), err => err.code === '42501');
  } finally {
    await db.close();
  }
});
