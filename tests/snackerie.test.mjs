import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getMealCategory, matchesMealCategory, menuContentKey, studentHasMealCategory } from '../lib/meal-category.ts';
import { selectPreparationOrders } from '../lib/preparation.ts';
import { unconfirmedMealGroups } from '../supabase/functions/_shared/meal-orders.ts';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const date = '2099-10-01';
const base = await readFile(new URL('./fixtures/pre-urgent-schema.sql', import.meta.url), 'utf8');
const migrations = await Promise.all([
  '20260923110000_secure_roles_and_history.sql',
  '20260923111000_private_access_codes.sql',
  '20260923112000_notification_authorization.sql',
  '20260923113000_checkout_recovery.sql',
  '20260930070000_morocco_permanent_gmt.sql',
  '20261001170000_preparation_snapshot.sql',
  '20261001193000_guard_legacy_school_grades.sql',
  '20261002000000_cned_secondary_grades.sql',
  '20261003140000_meal_categories.sql',
].map(n => readFile(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')));

async function database() {
  const db = new PGlite();
  await db.exec(base);
  for (const sql of migrations) await db.exec(sql);
  await db.exec(`
    INSERT INTO auth.users(id) VALUES('${id(101)}'),('${id(102)}'),('${id(103)}');
    INSERT INTO parents(id,user_id,access_code,first_name,last_name)
      VALUES('${id(1)}','${id(101)}','TEST','Parent','Test');
    INSERT INTO providers(id,user_id,company_name) VALUES
      ('${id(2)}','${id(102)}','Provider'),('${id(3)}','${id(103)}','Other provider');
    INSERT INTO schools(id,name) VALUES('${id(10)}','Test school');
    INSERT INTO provider_school_access(provider_id,school_id) VALUES('${id(2)}','${id(10)}');
    INSERT INTO children(id,parent_id,school_id,first_name,last_name,grade,allergies) VALUES
      ('${id(20)}','${id(1)}','${id(10)}','Child','One','CE2','{Gluten}'),
      ('${id(21)}','${id(1)}','${id(10)}','Child','Two','CE2','{}');
    INSERT INTO provider_menu_library(id,provider_id,meal_name,price,meal_category) VALUES
      ('${id(30)}','${id(2)}','Tacos',30,'snack'),
      ('${id(31)}','${id(2)}','Menu',40,'classic');
    INSERT INTO menus(id,school_id,provider_id,library_menu_id,date,meal_name,price) VALUES
      ('${id(40)}','${id(10)}','${id(2)}','${id(31)}','${date}','Menu',40),
      ('${id(41)}','${id(10)}','${id(2)}','${id(30)}','${date}','Tacos',30);
    INSERT INTO menus(id,school_id,provider_id,date,meal_name,price,meal_category) VALUES
      ('${id(42)}','${id(10)}','${id(3)}','${date}','Other snack',30,'snack');
    INSERT INTO parent_credits(id,parent_id,amount) VALUES('${id(50)}','${id(1)}',200);
  `);
  return db;
}
async function asUser(db, user) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.uid',$1,false)", [id(user)]);
  await db.exec('SET ROLE authenticated');
}
async function server(db) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.uid','',false)");
}
async function add(db, cartId, menu, quantity = 1, child = 20) {
  await db.query(`INSERT INTO cart_items(id,parent_id,child_id,menu_id,date,total_price,confirmed_daily_quantity)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id(cartId), id(1), id(child), id(menu), date, menu === 40 ? 40 : 30, quantity]);
}
const item = (cartId, menu, child = 20) => ({ id: id(cartId), menu_id: id(menu), child_id: id(child), date, total_price: menu === 40 ? 40 : 30 });
async function pay(db, items, bank, credits = 0) {
  const c = credits ? [{ credit_id: id(50), amount: credits }] : [];
  return (await db.query('SELECT prepare_meal_checkout($1,$2,$3,$4) payment', [id(1), JSON.stringify(items), bank, JSON.stringify(c)])).rows[0].payment;
}

test('legacy meals remain classic; category filters and grouping cannot combine a snack with an identical classic meal', () => {
  assert.equal(getMealCategory(undefined), 'classic');
  assert.equal(matchesMealCategory(null, 'classic'), true);
  assert.equal(matchesMealCategory('snack', 'classic'), false);
  const meal = { meal_name: 'Chicken', date, price: 30, description: 'Same', image_url: null };
  assert.notEqual(menuContentKey(meal), menuContentKey({ ...meal, meal_category: 'snack' }));
  const rows = [{ id: 'classic', school_id: 'a', genre: 'fille' }, { id: 'snack', school_id: 'a', genre: 'fille', meal_category: 'snack' }];
  assert.deepEqual(selectPreparationOrders(rows, 'a', 'fille', 'snack').map(r => r.id), ['snack']);
  assert.equal(studentHasMealCategory({ child_id: 'x', classic_count: 1, snack_count: 1 }, 'classic'), true);
  assert.equal(studentHasMealCategory({ child_id: 'x', classic_count: 1, snack_count: 1 }, 'snack'), true);
  assert.equal(studentHasMealCategory(undefined, 'snack'), false);
});

test('daily consent counts classic + snack together; changing category never bypasses quantity checks', () => {
  const rows = [item(70, 40), item(71, 41)];
  assert.equal(unconfirmedMealGroups(rows, [])[0].quantity, 2);
  assert.equal(unconfirmedMealGroups([{ ...rows[1], confirmed_daily_quantity: 2, repeat_order_confirmed_at: '2026-10-03T12:00:00Z' }], [rows[0]]).length, 0);
  assert.equal(unconfirmedMealGroups([rows[0], item(71, 41, 21)], []).length, 0);
});

test('publication inherits the library category for old clients, preserves historical copies, validates categories and respects provider ownership', async () => {
  const db = await database();
  try {
    assert.equal((await db.query('SELECT meal_category FROM menus WHERE id=$1', [id(41)])).rows[0].meal_category, 'snack');
    await db.query("UPDATE provider_menu_library SET meal_category='classic' WHERE id=$1", [id(30)]);
    assert.equal((await db.query('SELECT meal_category FROM menus WHERE id=$1', [id(41)])).rows[0].meal_category, 'snack');
    await assert.rejects(db.query("UPDATE menus SET meal_category='unknown' WHERE id=$1", [id(40)]), e => e.code === '23514');
    await db.exec(migrations.at(-1));
    assert.equal((await db.query('SELECT meal_category FROM menus WHERE id=$1', [id(41)])).rows[0].meal_category, 'snack');
    await asUser(db, 103);
    await assert.rejects(db.query(`INSERT INTO menus(school_id,provider_id,library_menu_id,date,meal_name,price)
      VALUES($1,$2,$3,$4,'Forbidden',30)`, [id(10), id(3), id(30), date]), /inaccessible/);
    await asUser(db, 102);
    await db.query(`INSERT INTO menus(school_id,provider_id,library_menu_id,date,meal_name,price)
      VALUES($1,$2,$3,$4,'New classic copy',30)`, [id(10), id(2), id(30), date]);
  } finally { await db.close(); }
});

test('mixed cart needs explicit agreement, pays once with shared wallet, and preparation/student counts keep both categories', async () => {
  const db = await database();
  try {
    await asUser(db, 101);
    await add(db, 70, 40);
    await assert.rejects(add(db, 71, 41), /déjà/);
    await add(db, 71, 41, 2);
    await server(db);
    const payment = await pay(db, [item(70, 40), item(71, 41)], 50, 20);
    const complete = () => db.query('SELECT complete_payzone_payment($1,$2) ok', [payment.order_id, payment.charge_id]);
    assert.equal((await complete()).rows[0].ok, true);
    assert.equal((await complete()).rows[0].ok, false);
    assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n, 2);
    assert.equal(Number((await db.query('SELECT used_amount FROM parent_credits WHERE id=$1', [id(50)])).rows[0].used_amount), 20);
    await asUser(db, 102);
    const counts = (await db.query('SELECT get_provider_student_meal_counts($1,$2) rows', [id(2), date])).rows[0].rows;
    assert.deepEqual(counts, [{ child_id: id(20), classic_count: 1, snack_count: 1 }]);
    const snapshot = (await db.query('SELECT get_preparation_snapshot($1,$2) snapshot', [[id(40), id(41)], date])).rows[0].snapshot;
    assert.deepEqual(snapshot.orders.map(r => r.meal_category), ['classic', 'snack']);
    assert.deepEqual(snapshot.orders[1].allergies, ['Gluten']);
    await asUser(db, 103);
    assert.deepEqual((await db.query('SELECT get_provider_student_meal_counts($1,$2) rows', [id(2), date])).rows[0].rows, []);
    await server(db); await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT get_provider_student_meal_counts($1,$2)', [id(2), date]), e => e.code === '42501');
  } finally { await db.close(); }
});

test('snack alone and mixed credit-only orders keep school restrictions, availability and the shared cancellation quota', async () => {
  const db = await database();
  try {
    await add(db, 70, 40); await add(db, 71, 41, 2); await add(db, 72, 41, 1, 21);
    const payment = await pay(db, [item(70, 40), item(71, 41), item(72, 41, 21)], 0, 100);
    assert.equal(payment.status, 'completed');
    const reservations = (await db.query('SELECT id FROM reservations ORDER BY child_id, menu_id')).rows;
    await asUser(db, 101);
    for (const r of reservations.slice(0, 2)) await db.query('SELECT cancel_meal_with_credit($1)', [r.id]);
    await assert.rejects(db.query('SELECT cancel_meal_with_credit($1)', [reservations[2].id]), /2|limite|annulation/i);
    await asUser(db, 102);
    const counts = (await db.query('SELECT get_provider_student_meal_counts($1,$2) rows', [id(2), date])).rows[0].rows;
    assert.deepEqual(counts, [{ child_id: id(21), classic_count: 0, snack_count: 1 }]);
    await server(db);
    await db.query('UPDATE menus SET available=false WHERE id=$1', [id(41)]);
    await add(db, 73, 41);
    await assert.rejects(pay(db, [item(73, 41)], 30), /disponible/);
    await db.query("INSERT INTO schools(id,name) VALUES($1,'Other school')", [id(11)]);
    await db.query('UPDATE menus SET available=true, school_id=$1 WHERE id=$2', [id(11), id(41)]);
    await assert.rejects(pay(db, [item(73, 41)], 30), /disponible/);
  } finally { await db.close(); }
});

test('snack checkout closes at the same 07:00 Morocco deadline as a classic meal', async () => {
  const db = await database();
  try {
    await add(db, 70, 41);
    await db.exec(`CREATE FUNCTION public.snack_test_now() RETURNS timestamptz LANGUAGE sql STABLE AS
      'SELECT current_setting(''test.checkout_now'')::timestamptz';`);
    const source = (await db.query("SELECT pg_get_functiondef('public.prepare_meal_checkout(uuid,jsonb,numeric,jsonb)'::regprocedure) source")).rows[0].source;
    await db.exec(source.replace(/\bnow\(\)/g, 'public.snack_test_now()'));
    for (const [time, allowed] of [['06:59:59', true], ['07:00:00', false]]) {
      await db.exec('BEGIN');
      try {
        await db.query("SELECT set_config('test.checkout_now',$1,true)", [`${date}T${time}Z`]);
        if (allowed) assert.equal((await pay(db, [item(70, 41)], 30)).status, 'pending');
        else await assert.rejects(pay(db, [item(70, 41)], 30), /disponible|7 h/);
      } finally { await db.exec('ROLLBACK'); }
    }
  } finally { await db.close(); }
});
