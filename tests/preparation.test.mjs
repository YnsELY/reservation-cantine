import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fetchPreparationSnapshot, selectPreparationOrders } from '../lib/preparation.ts';

const row = (id, school = 'school-a') => ({
  id, child_id: id, child_name: `Élève ${id}`, school_id: school, school_name: school,
  parent_name: 'Parent', grade: 'CE2', genre: 'garcon', allergies: [],
  dietary_restrictions: [], supplements: [], annotations: null,
});

test('a second fetch includes arrivals since the screen opened, removes cancellations and preserves school filters', async () => {
  let rows = [row('earlier')];
  const client = { rpc: async () => ({ data: { generated_at: new Date().toISOString(), orders: rows }, error: null }) };
  const displayed = await fetchPreparationSnapshot(client, ['menu'], '2026-10-01');
  rows = [row('late-a'), row('late-b'), row('other', 'school-b')];
  const exported = await fetchPreparationSnapshot(client, ['menu'], '2026-10-01');
  assert.equal(displayed.orders.length, 1);
  assert.deepEqual(selectPreparationOrders(exported.orders, 'school-a', 'all').map(r => r.id), ['late-a', 'late-b']);
  assert.equal(selectPreparationOrders(exported.orders, 'all', 'all').length, 3);
  assert.equal(selectPreparationOrders(exported.orders, 'all', 'fille').length, 0);
});

test('network failure, unreadable identities and health data stop the export instead of dropping rows', async () => {
  const failure = { rpc: async () => ({ data: null, error: { message: 'offline' } }) };
  await assert.rejects(fetchPreparationSnapshot(failure, ['menu'], '2026-10-01'), /actualiser/);
  for (const bad of [{ ...row('a'), child_id: null }, { ...row('a'), allergies: null }, { ...row('a'), school_id: null }]) {
    const client = { rpc: async () => ({ data: { generated_at: new Date().toISOString(), orders: [bad] } }) };
    await assert.rejects(fetchPreparationSnapshot(client, ['menu'], '2026-10-01'), /inaccessibles/);
  }
});

test('the snapshot preserves more than 1000 meals and refuses duplicate rows', async () => {
  let rows = Array.from({ length: 1501 }, (_, i) => row(String(i)));
  const client = { rpc: async () => ({ data: { generated_at: new Date().toISOString(), orders: rows } }) };
  assert.equal((await fetchPreparationSnapshot(client, ['menu'], '2026-10-01')).orders.length, 1501);
  rows = [row('same'), row('same')];
  await assert.rejects(fetchPreparationSnapshot(client, ['menu'], '2026-10-01'), /inaccessibles/);
});

test('SQL snapshot respects RLS, keeps sold unavailable menus, pending school meals, and excludes cancellations', async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  const a = '00000000-0000-0000-0000-000000000001';
  const b = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE TABLE schools(id uuid PRIMARY KEY,name text);
      CREATE TABLE parents(id uuid PRIMARY KEY,first_name text,last_name text);
      CREATE TABLE children(id uuid PRIMARY KEY,first_name text,last_name text,grade text,genre text,allergies text[],dietary_restrictions text[]);
      CREATE TABLE menus(id uuid PRIMARY KEY,school_id uuid,available boolean);
      CREATE TABLE reservations(id uuid DEFAULT gen_random_uuid(),child_id uuid,parent_id uuid,menu_id uuid,date date,payment_status text,supplements jsonb,annotations text,created_at timestamptz DEFAULT now());
      INSERT INTO schools VALUES('${a}','École A'),('${b}','École B');
      INSERT INTO parents VALUES('${a}','Parent','A');
      INSERT INTO children VALUES('${a}','Élève','A','CE2','garcon','{Gluten}','{}');
      INSERT INTO menus VALUES('${a}','${a}',false),('${b}','${b}',true);
      INSERT INTO reservations(child_id,parent_id,menu_id,date,payment_status,supplements)
        SELECT '${a}','${a}','${a}','2026-10-01','paid','[]' FROM generate_series(1,1501);
      INSERT INTO reservations(child_id,parent_id,menu_id,date,payment_status) VALUES
        ('${a}','${a}','${a}','2026-10-01','cancelled'),
        ('${a}','${a}','${a}','2026-10-01','pending'),
        ('${a}','${a}','${b}','2026-10-01','paid'),
        ('${a}','${a}','${a}','2026-10-02','paid');
      GRANT USAGE ON SCHEMA public TO authenticated,anon;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
      ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY permitted_menu ON reservations TO authenticated USING (menu_id='${a}');
    `);
    const migration = await readFile(new URL('../supabase/migrations/20261001170000_preparation_snapshot.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec('SET ROLE authenticated');
    const { rows } = await db.query('SELECT public.get_preparation_snapshot($1,$2) snapshot', [[a,b], '2026-10-01']);
    assert.equal(rows[0].snapshot.orders.length, 1502);
    assert.equal(new Set(rows[0].snapshot.orders.map(r => r.school_id)).size, 1);
    assert.deepEqual(rows[0].snapshot.orders[0].allergies, ['Gluten']);
    const empty = await db.query('SELECT public.get_preparation_snapshot($1,$2) snapshot', [[a], '2026-10-03']);
    assert.deepEqual(empty.rows[0].snapshot.orders, []);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('SELECT public.get_preparation_snapshot($1,$2)', [[a], '2026-10-01']), e => e.code === '42501');
    await db.exec('RESET ROLE');
    await db.exec(migration);
  } finally { await db.close(); }
});
