import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const base = await readFile(new URL('./fixtures/pre-urgent-schema.sql', import.meta.url), 'utf8');
const migrations = await Promise.all([
  '20260923110000_secure_roles_and_history.sql',
  '20260923111000_private_access_codes.sql',
  '20260923112000_notification_authorization.sql',
  '20260923113000_checkout_recovery.sql',
  '20260930070000_morocco_permanent_gmt.sql',
].map(n => readFile(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')));
const guard = await readFile(new URL('../supabase/migrations/20261001193000_guard_legacy_school_grades.sql', import.meta.url), 'utf8');

async function database() {
  const db = new PGlite();
  await db.exec(base);
  for (const sql of migrations) await db.exec(sql);
  await db.exec(`
    INSERT INTO auth.users(id) VALUES('${id(101)}');
    INSERT INTO parents(id,user_id,access_code,first_name,last_name)
      VALUES('${id(1)}','${id(101)}','TEST','Test','Parent');
    INSERT INTO schools(id,name,access_code) VALUES
      ('${id(10)}','ÉCOLE DE LA VERTU','PRIMARY'),('${id(11)}','CNED EIM','CNED');
    INSERT INTO parent_school_affiliations(parent_id,school_id,status)
      VALUES('${id(1)}','${id(10)}','active'),('${id(1)}','${id(11)}','active');
    -- Reproduce a pre-rule record, without changing the existing enrollment rule.
    ALTER TABLE children DISABLE TRIGGER validate_child_school_change;
    INSERT INTO children(id,parent_id,school_id,first_name,last_name,grade) VALUES
      ('${id(20)}','${id(1)}','${id(10)}','Legacy','Child','6ème'),
      ('${id(21)}','${id(1)}','${id(10)}','Primary','Child','CM2'),
      ('${id(22)}','${id(1)}','${id(11)}','Cned','Child','Moyenne Section'),
      ('${id(23)}','${id(1)}','${id(10)}','Optional','Grade',null);
    ALTER TABLE children ENABLE TRIGGER validate_child_school_change;
    INSERT INTO menus(id,school_id,date,meal_name,price) VALUES
      ('${id(30)}','${id(10)}','2099-10-01','Primary meal',45),
      ('${id(31)}','${id(11)}','2099-10-01','Cned meal',45);
    INSERT INTO parent_credits(id,parent_id,amount) VALUES('${id(50)}','${id(1)}',100);
  `);
  return db;
}

function cart(db, child = 20, menu = 30, row = 40) {
  return db.query('INSERT INTO cart_items(id,parent_id,child_id,menu_id,date,total_price) VALUES($1,$2,$3,$4,\'2099-10-01\',45)',
    [id(row), id(1), id(child), id(menu)]);
}
async function checkout(db, child = 20, menu = 30, row = 40, bank = 25) {
  const items = [{ id: id(row), child_id: id(child), menu_id: id(menu), date: '2099-10-01', total_price: 45 }];
  return (await db.query('SELECT prepare_meal_checkout($1,$2,$3,$4) payment', [id(1), JSON.stringify(items), bank,
    JSON.stringify([{ credit_id: id(50), amount: 45 - bank }])])).rows[0].payment;
}
async function counts(db) {
  return (await db.query(`SELECT
    (SELECT count(*)::int FROM pending_payments) payments,
    (SELECT count(*)::int FROM meal_payment_holds) holds,
    (SELECT count(*)::int FROM reservations) reservations,
    (SELECT reserved_amount::float FROM parent_credits WHERE id='${id(50)}') reserved,
    (SELECT used_amount::float FROM parent_credits WHERE id='${id(50)}') used`)).rows[0];
}

test('legacy invalid class: existing basket is refused before bank or credit payment, with no monetary changes', async () => {
  const db = await database();
  try {
    await cart(db);
    // Confirm the reported gap against the previous implementation, then undo it.
    await db.exec('BEGIN');
    assert.equal((await checkout(db)).status, 'pending');
    await db.exec('ROLLBACK');
    await db.exec(guard);
    for (const bank of [25, 0]) await assert.rejects(checkout(db, 20, 30, 40, bank), /La classe.*La Vertu/);
    assert.deepEqual(await counts(db), { payments: 0, holds: 0, reservations: 0, reserved: 0, used: 0 });
    assert.equal((await db.query('SELECT * FROM cart_items')).rows.length, 1);
    assert.equal((await db.query('SELECT grade FROM children WHERE id=$1', [id(20)])).rows[0].grade, '6ème');
  } finally { await db.close(); }
});

test('new baskets and school-created meals reject legacy invalid classes and tell the parent how to fix it', async () => {
  const db = await database();
  try {
    await db.exec(guard);
    await db.query("SELECT set_config('test.uid',$1,false)", [id(101)]);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(cart(db), /Vérifiez sa fiche et son école/);
    await cart(db, 21);
    await assert.rejects(db.query('UPDATE cart_items SET child_id=$1 WHERE id=$2', [id(20), id(40)]), /La classe/);
    await assert.rejects(db.query('SELECT assert_child_grade_for_order($1)', [id(20)]), e => e.code === '42501');
    await db.exec('RESET ROLE');
    await db.query("SELECT set_config('test.uid','',false)");
    await assert.rejects(db.query(`INSERT INTO reservations(parent_id,child_id,menu_id,date,total_price,payment_status,created_by_school,school_payment_pending)
      VALUES($1,$2,$3,'2099-10-01',45,'pending',true,true)`, [id(1), id(20), id(30)]), /La classe/);
  } finally { await db.close(); }
});

test('allowed primary grades, optional grades and CNED primary children can still order', async () => {
  const db = await database();
  try {
    await db.exec(guard);
    for (const [child, menu, row] of [[21, 30, 40], [22, 31, 41], [23, 30, 42]]) {
      await cart(db, child, menu, row);
      const payment = await checkout(db, child, menu, row);
      await db.query('SELECT complete_payzone_payment($1,$2)', [payment.order_id, payment.charge_id]);
    }
    assert.deepEqual(await counts(db), { payments: 3, holds: 0, reservations: 3, reserved: 0, used: 60 });
  } finally { await db.close(); }
});

test('already initiated payments still recover and complete exactly once after the grade guard', async () => {
  const db = await database();
  try {
    await cart(db);
    const payment = await checkout(db);
    await db.exec(guard);
    const resumed = (await db.query('SELECT resume_meal_checkout($1,$2) payment', [id(1), payment.order_id])).rows[0].payment;
    assert.equal(resumed.charge_id, payment.charge_id);
    assert.equal((await checkout(db)).order_id, payment.order_id);
    for (const expected of [true, false]) {
      assert.equal((await db.query('SELECT complete_payzone_payment($1,$2) completed', [payment.order_id, payment.charge_id])).rows[0].completed, expected);
    }
    assert.deepEqual(await counts(db), { payments: 1, holds: 0, reservations: 1, reserved: 0, used: 20 });
    await db.exec(guard);
    assert.deepEqual(await counts(db), { payments: 1, holds: 0, reservations: 1, reserved: 0, used: 20 });
    assert.equal((await checkout(db)).status, 'completed');
    const acl = (await db.query(`SELECT
      has_function_privilege('authenticated','public.prepare_meal_checkout(uuid,jsonb,numeric,jsonb)','EXECUTE') client,
      has_function_privilege('service_role','public.prepare_meal_checkout(uuid,jsonb,numeric,jsonb)','EXECUTE') server,
      strpos(pg_get_functiondef('public.prepare_meal_checkout(uuid,jsonb,numeric,jsonb)'::regprocedure),'public.morocco_local_time(now())') > 0 cutoff`)).rows[0];
    assert.deepEqual(acl, { client: false, server: true, cutoff: true });
  } finally { await db.close(); }
});
