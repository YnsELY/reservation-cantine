// Isolated PostgreSQL engine; no connection to Supabase or customer records.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { hasDuplicateMeals, hasReservedMeal, unconfirmedMealGroups, withDailyConfirmations } from '../supabase/functions/_shared/meal-orders.ts';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migration = (await Promise.all(['20260922140000_prevent_duplicate_meal_orders.sql', '20260922150000_confirm_additional_daily_meals.sql'].map(name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')))).join('\n');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const meal = (child = 1, menu = 10, date = '2026-10-01') => ({ child_id: id(child), menu_id: id(menu), date });
const item = (n, child = 1) => ({ id: id(n), ...meal(child), total_price: 25, supplements: [], annotations: null });

async function database(beforeMigration = '') {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE TABLE children (id uuid PRIMARY KEY);
    CREATE TABLE reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid NOT NULL,
      child_id uuid NOT NULL REFERENCES children(id), menu_id uuid NOT NULL, date date NOT NULL,
      supplements jsonb, annotations text, total_price numeric NOT NULL DEFAULT 25,
      payment_status text DEFAULT 'pending', payment_intent_id text
    );
    CREATE TABLE cart_items (
      id uuid PRIMARY KEY, parent_id uuid NOT NULL, child_id uuid NOT NULL REFERENCES children(id),
      menu_id uuid NOT NULL, date date NOT NULL
    );
    CREATE TABLE parent_credits (
      id uuid PRIMARY KEY, parent_id uuid NOT NULL, amount numeric NOT NULL,
      used_amount numeric NOT NULL DEFAULT 0, is_active boolean DEFAULT true
    );
    CREATE TABLE pending_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id text UNIQUE NOT NULL, parent_id uuid NOT NULL,
      cart_items jsonb NOT NULL, applied_credits jsonb DEFAULT '[]', status text DEFAULT 'pending',
      payzone_transaction_id text, payzone_status text, completed_at timestamptz, failure_reason text
    );
    INSERT INTO children VALUES ('${id(1)}'), ('${id(2)}');
    INSERT INTO parent_credits VALUES ('${id(30)}', '${id(20)}', 100, 0, true);
    ${beforeMigration}
  `);
  await db.exec(migration);
  return db;
}

const reserve = (n, child = 1, status = 'paid', date = '2026-10-01') =>
  `INSERT INTO reservations(id, parent_id, child_id, menu_id, date, payment_status)
   VALUES ('${id(n)}', '${id(20)}', '${id(child)}', '${id(10)}', '${date}', '${status}')`;
const addCart = (n, child = 1) =>
  `INSERT INTO cart_items(id, parent_id, child_id, menu_id, date) VALUES ('${id(n)}', '${id(20)}', '${id(child)}', '${id(10)}', '2026-10-01')`;
const duplicate = error => error.code === '23505' && /déjà/.test(error.message);
const count = async (db, table) => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
const usedCredit = async db => Number((await db.query('SELECT used_amount FROM parent_credits')).rows[0].used_amount);
async function pending(db, items, amount = 10) {
  await db.query('INSERT INTO pending_payments(order_id, parent_id, cart_items, applied_credits) VALUES ($1, $2, $3, $4)',
    ['order-1', id(20), JSON.stringify(items), JSON.stringify([{ credit_id: id(30), amount }])]);
}
async function complete(db) {
  return (await db.query("SELECT complete_payzone_payment('order-1', 'CHG_test') AS completed")).rows[0].completed;
}

test('daily checks distinguish siblings and dates, but include different menus and supplements', () => {
  assert.equal(hasDuplicateMeals([meal(), { ...meal(), supplements: ['dessert'] }]), true);
  assert.equal(hasDuplicateMeals([meal(), meal(2), meal(1, 10, '2026-10-02')]), false);
  assert.equal(hasReservedMeal([meal()], [meal()]), true);
  assert.equal(hasDuplicateMeals([meal(), meal(1, 11)]), true);
  assert.equal(hasReservedMeal([meal()], [meal(1, 11)]), true);
  assert.equal(hasReservedMeal([meal()], [meal(2), meal(1, 10, '2026-10-02')]), false);
});

test('historical duplicates survive migration; new duplicates and reactivation are blocked', async () => {
  const db = await database(`${reserve(100)}; ${reserve(101)};`);
  try {
    await db.exec(migration); // Safe to reapply, without cleaning paid data.
    assert.equal(await count(db, 'reservations'), 2);
    await assert.rejects(db.exec(reserve(102)), duplicate);
    await db.exec(`UPDATE reservations SET payment_status='paid', annotations='checked' WHERE id='${id(100)}'`);
    await db.exec(`UPDATE reservations SET payment_status='cancelled' WHERE id='${id(100)}'`);
    await assert.rejects(db.exec(addCart(40)), duplicate);
    await db.exec(`UPDATE reservations SET payment_status='cancelled' WHERE id='${id(101)}'`);
    await db.exec(addCart(40));
    await db.exec(reserve(102));
    await assert.rejects(db.exec(`UPDATE reservations SET payment_status='paid' WHERE id='${id(100)}'`), duplicate);
  } finally { await db.close(); }
});

test('cart duplicates, repeated reservations and duplicate batches are refused', async () => {
  const db = await database();
  try {
    await db.exec(addCart(40));
    await assert.rejects(db.exec(addCart(41)), duplicate);
    await db.exec(addCart(42, 2));
    await assert.rejects(db.exec(`UPDATE cart_items SET child_id='${id(1)}' WHERE id='${id(42)}'`), duplicate);
    await assert.rejects(db.exec(`INSERT INTO reservations(parent_id, child_id, menu_id, date, payment_status)
      VALUES ('${id(20)}','${id(1)}','${id(10)}','2026-10-01','paid'),
             ('${id(20)}','${id(1)}','${id(10)}','2026-10-01','paid')`), duplicate);
    assert.equal(await count(db, 'reservations'), 0);
    await db.exec(reserve(100));
    await assert.rejects(db.exec(reserve(101, 1, 'pending')), duplicate);
    await assert.rejects(db.exec(addCart(43)), duplicate);
    await db.exec(reserve(102, 2));
    await db.exec(reserve(103, 1, 'paid', '2026-10-02'));
  } finally { await db.close(); }
});

test('a CHARGED replay creates reservations and consumes credits only once', async () => {
  const db = await database();
  try {
    await db.exec(`${addCart(40)}; ${addCart(41, 2)};`);
    await pending(db, [item(40), item(41, 2)]);
    await db.exec('SET ROLE service_role');
    assert.equal(await complete(db), true);
    assert.equal(await complete(db), false);
    await db.exec('RESET ROLE');
    assert.equal(await count(db, 'reservations'), 2);
    assert.equal(await count(db, 'cart_items'), 0);
    assert.equal(await usedCredit(db), 10);
    assert.deepEqual((await db.query('SELECT status, payzone_transaction_id FROM pending_payments')).rows,
      [{ status: 'completed', payzone_transaction_id: 'CHG_test' }]);
  } finally { await db.close(); }
});

test('legacy duplicate cart snapshot rolls back the whole confirmation', async () => {
  const db = await database(`${addCart(40)}; ${addCart(41)};`);
  try {
    await pending(db, [item(40), item(41)]);
    await assert.rejects(complete(db), duplicate);
    assert.equal(await count(db, 'reservations'), 0);
    assert.equal(await count(db, 'cart_items'), 2);
    assert.equal(await usedCredit(db), 0);
    assert.equal((await db.query('SELECT status FROM pending_payments')).rows[0].status, 'pending');
  } finally { await db.close(); }
});

test('a later purchase cannot reserve the same meal again or consume additional credit', async () => {
  const db = await database(`${addCart(40)};`);
  try {
    await db.exec(reserve(100));
    await pending(db, [item(40)]);
    await assert.rejects(complete(db), duplicate);
    assert.equal(await count(db, 'reservations'), 1);
    assert.equal(await count(db, 'cart_items'), 1);
    assert.equal(await usedCredit(db), 0);
  } finally { await db.close(); }
});

test('credit failures roll back reservations and leave the cart available for review', async () => {
  const db = await database();
  try {
    await db.exec(addCart(40));
    await pending(db, [item(40)], 150);
    await assert.rejects(complete(db), /Crédit cagnotte indisponible/);
    assert.equal(await count(db, 'reservations'), 0);
    assert.equal(await count(db, 'cart_items'), 1);
    assert.equal(await usedCredit(db), 0);
  } finally { await db.close(); }
});

test('refunded payments stay refunded and clients cannot call the completion RPC', async () => {
  const db = await database();
  try {
    await pending(db, [item(40)]);
    await db.exec("UPDATE pending_payments SET status='refunded'");
    assert.equal(await complete(db), false);
    assert.equal(await count(db, 'reservations'), 0);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(complete(db), error => error.code === '42501');
      await db.exec('RESET ROLE');
    }
  } finally { await db.close(); }
});

test('the guard detects a reservation hidden by caller RLS without granting read access', async () => {
  const db = await database(`${reserve(100)};`);
  try {
    await db.exec(`
      GRANT SELECT, INSERT ON reservations TO authenticated;
      ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY no_rows ON reservations FOR SELECT TO authenticated USING(false);
      CREATE POLICY insert_rows ON reservations FOR INSERT TO authenticated WITH CHECK(true);
      SET ROLE authenticated;
    `);
    assert.equal(await count(db, 'reservations'), 0);
    await assert.rejects(db.exec(reserve(101)), duplicate);
    assert.equal(await count(db, 'reservations'), 0);
  } finally { await db.close(); }
});

test('consent applies only to the displayed child/day quantity and is required for every additional quantity', () => {
  const approved = { ...meal(), confirmed_daily_quantity: 2, repeat_order_confirmed_at: '2026-09-22T12:00:00Z' };
  assert.equal(unconfirmedMealGroups([meal(), meal()], []).length, 1);
  assert.equal(unconfirmedMealGroups([meal(), approved], []).length, 0);
  assert.equal(unconfirmedMealGroups([approved], [meal()]).length, 0);
  assert.equal(unconfirmedMealGroups([approved], [meal(), meal()]).length, 1);
  assert.equal(unconfirmedMealGroups([approved, meal(2)], [meal(2)]).length, 1);
  assert.equal(unconfirmedMealGroups([{ ...approved, repeat_order_confirmed_at: null }], [meal()]).length, 1);
  assert.ok(withDailyConfirmations([meal(), approved]).every(row => row.confirmed_daily_quantity === 2));
});

test('a parent may explicitly add another meal, including a different menu, but stale consent is refused', async () => {
  const db = await database();
  try {
    await db.exec(reserve(100));
    await assert.rejects(db.exec(`INSERT INTO cart_items(id, parent_id, child_id, menu_id, date)
      VALUES ('${id(40)}','${id(20)}','${id(1)}','${id(11)}','2026-10-01')`), duplicate);
    await db.exec(`INSERT INTO cart_items(id, parent_id, child_id, menu_id, date, confirmed_daily_quantity)
      VALUES ('${id(40)}','${id(20)}','${id(1)}','${id(11)}','2026-10-01',2)`);
    const saved = (await db.query('SELECT * FROM cart_items')).rows[0];
    assert.ok(saved.repeat_order_confirmed_at);
    await assert.rejects(db.exec(`INSERT INTO cart_items(id, parent_id, child_id, menu_id, date, confirmed_daily_quantity)
      VALUES ('${id(41)}','${id(20)}','${id(1)}','${id(10)}','2026-10-01',2)`), duplicate);
    await pending(db, [{ ...item(40), menu_id: id(11), confirmed_daily_quantity: 2, repeat_order_confirmed_at: saved.repeat_order_confirmed_at }]);
    assert.equal(await complete(db), true);
    assert.equal(await complete(db), false);
    assert.equal(await count(db, 'reservations'), 2);
    assert.equal(await usedCredit(db), 10);
  } finally { await db.close(); }
});

test('a confirmed two-meal batch is completed once, independently of row order', async () => {
  const db = await database(`${addCart(40)}; ${addCart(41)};`);
  try {
    await db.exec('UPDATE cart_items SET confirmed_daily_quantity=2');
    const cart = (await db.query('SELECT id, confirmed_daily_quantity, repeat_order_confirmed_at FROM cart_items ORDER BY id DESC')).rows;
    await pending(db, cart.map(row => ({ ...item(row.id === id(40) ? 40 : 41), ...row })));
    assert.equal(await complete(db), true);
    assert.equal(await count(db, 'reservations'), 2);
    assert.equal(await complete(db), false);
    assert.equal(await count(db, 'reservations'), 2);
    assert.equal(await usedCredit(db), 10);
    // Even a fresh payment record with a high quantity cannot reuse purchased cart ids.
    await db.exec("UPDATE pending_payments SET order_id='old-order'");
    await pending(db, cart.map(row => ({ ...item(row.id === id(40) ? 40 : 41), ...row, confirmed_daily_quantity: 10 })));
    await assert.rejects(complete(db), error => error.code === '23505' && /source_cart_item/.test(error.message));
    assert.equal(await count(db, 'reservations'), 2);
    assert.equal(await usedCredit(db), 10);
  } finally { await db.close(); }
});

test('consent is not transferred when an existing cart row is assigned to a different child', async () => {
  const db = await database(`${addCart(40)}; ${addCart(41)}; ${reserve(100, 2)};`);
  try {
    await db.exec('UPDATE cart_items SET confirmed_daily_quantity=2');
    await assert.rejects(db.exec(`UPDATE cart_items SET child_id='${id(2)}' WHERE id='${id(41)}'`), duplicate);
    assert.equal((await db.query(`SELECT child_id FROM cart_items WHERE id='${id(41)}'`)).rows[0].child_id, id(1));
  } finally { await db.close(); }
});
