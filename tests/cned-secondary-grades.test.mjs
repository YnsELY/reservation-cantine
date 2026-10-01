import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { isGradeAllowed } from '../lib/school-grades.ts';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const base = await readFile(new URL('./fixtures/pre-urgent-schema.sql', import.meta.url), 'utf8');
const migrations = await Promise.all([
  '20260923110000_secure_roles_and_history.sql',
  '20260923111000_private_access_codes.sql',
  '20260923112000_notification_authorization.sql',
  '20260923113000_checkout_recovery.sql',
  '20260930070000_morocco_permanent_gmt.sql',
  '20261001170000_preparation_snapshot.sql',
  '20261001193000_guard_legacy_school_grades.sql',
].map(n => readFile(new URL('../supabase/migrations/' + n, import.meta.url), 'utf8')));
const cnedRule = await readFile(new URL('../supabase/migrations/20261002000000_cned_secondary_grades.sql', import.meta.url), 'utf8');
const primary = ['Petite Section', 'Moyenne Section', 'Grande Section', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
const secondary = ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'];

async function database() {
  const db = new PGlite();
  await db.exec(base);
  for (const sql of migrations) await db.exec(sql);
  await db.exec(`
    INSERT INTO auth.users(id) VALUES('${id(101)}');
    INSERT INTO parents(id,user_id,access_code,first_name,last_name)
      VALUES('${id(1)}','${id(101)}','PARENT','Test','Parent');
    INSERT INTO schools(id,name,access_code) VALUES
      ('${id(10)}','ÉCOLE DE LA VERTU','PRIMARY'),('${id(11)}','CNED EIM','CNED');
    INSERT INTO parent_school_affiliations(parent_id,school_id,status)
      VALUES('${id(1)}','${id(11)}','active');
    INSERT INTO children(id,parent_id,school_id,first_name,last_name,grade,allergies) VALUES
      ('${id(20)}','${id(1)}','${id(11)}','Legacy','Primary','CE2','{Gluten}'),
      ('${id(21)}','${id(1)}','${id(11)}','Valid','Secondary','6ème','{}');
    INSERT INTO menus(id,school_id,date,meal_name,price) VALUES
      ('${id(30)}','${id(11)}','2099-10-01','Cned meal',45),
      ('${id(31)}','${id(10)}','2099-10-01','Primary meal',45),
      ('${id(32)}','${id(11)}','2026-09-10','Historical meal',45);
    INSERT INTO parent_credits(id,parent_id,amount) VALUES('${id(50)}','${id(1)}',100);
  `);
  return db;
}

async function asParent(db) {
  await db.query("SELECT set_config('test.uid',$1,false)", [id(101)]);
  await db.exec('SET ROLE authenticated');
}
async function server(db) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('test.uid','',false)");
}
async function checkout(db) {
  const items = [{ id: id(40), child_id: id(20), menu_id: id(30), date: '2099-10-01', total_price: 45 }];
  return (await db.query('SELECT prepare_meal_checkout($1,$2,25,$3) payment', [id(1), JSON.stringify(items), JSON.stringify([{ credit_id: id(50), amount: 20 }])])).rows[0].payment;
}

test('UI and database agree: CNED only secondary, La Vertu primary, other schools unchanged', async () => {
  const db = await database();
  try {
    await db.exec(cnedRule);
    for (const name of ['CNED EIM', 'École cned-eim', 'CNED EIME', 'La Vertu', 'ÉCOLE LA-VERTU', 'Autre école']) {
      for (const grade of [...primary, ...secondary, '', null, '  ', ' 6ème ', 'Classe personnalisée']) {
        const result = await db.query('SELECT is_school_grade_allowed($1,$2) ok', [name, grade]);
        assert.equal(result.rows[0].ok, isGradeAllowed({ name }, grade || ''), `${name}: ${grade}`);
      }
    }
    await asParent(db);
    for (const grade of [...primary, '', null, 'Classe personnalisée']) {
      await assert.rejects(db.query(`INSERT INTO children(parent_id,school_id,first_name,last_name,grade)
        VALUES($1,$2,'Refused','Child',$3)`, [id(1), id(11), grade]), /CNED EIM.*collège et le lycée/);
    }
    for (const grade of secondary) {
      await db.query(`INSERT INTO children(parent_id,school_id,first_name,last_name,grade)
        VALUES($1,$2,'Allowed','Child',$3)`, [id(1), id(11), grade]);
    }
    await assert.rejects(db.query('UPDATE children SET grade=$1 WHERE id=$2', ['CM2', id(21)]), /CNED EIM/);
    await assert.rejects(db.query('UPDATE children SET grade=NULL WHERE id=$1', [id(21)]), /CNED EIM/);
    // Unrelated profile edits remain possible on a legacy record awaiting transfer.
    await db.query("UPDATE children SET first_name='Legacy updated' WHERE id=$1", [id(20)]);
    await server(db);
    await db.exec(cnedRule); // Idempotent migration.
  } finally { await db.close(); }
});

test('legacy CNED primary children cannot add baskets, pay old baskets or create school orders', async () => {
  const db = await database();
  try {
    await db.query(`INSERT INTO cart_items(id,parent_id,child_id,menu_id,date,total_price)
      VALUES($1,$2,$3,$4,'2099-10-01',45)`, [id(40), id(1), id(20), id(30)]);
    await db.exec(cnedRule);
    await assert.rejects(checkout(db), /CNED EIM.*collège et le lycée/);
    await asParent(db);
    await assert.rejects(db.query(`INSERT INTO cart_items(parent_id,child_id,menu_id,date,total_price)
      VALUES($1,$2,$3,'2099-10-01',45)`, [id(1), id(20), id(30)]), /CNED EIM/);
    await server(db);
    await assert.rejects(db.query(`INSERT INTO reservations(parent_id,child_id,menu_id,date,total_price,payment_status,created_by_school,school_payment_pending)
      VALUES($1,$2,$3,'2099-10-01',45,'pending',true,true)`, [id(1), id(20), id(30)]), /CNED EIM/);
    const state = (await db.query(`SELECT
      (SELECT count(*)::int FROM pending_payments) payments,
      (SELECT count(*)::int FROM reservations) reservations,
      (SELECT reserved_amount::float FROM parent_credits WHERE id='${id(50)}') reserved`)).rows[0];
    assert.deepEqual(state, { payments: 0, reservations: 0, reserved: 0 });
  } finally { await db.close(); }
});

test('transfer keeps identity, health data and history; parents can access La Vertu and cannot switch back with a primary grade', async () => {
  const db = await database();
  try {
    await db.query(`INSERT INTO reservations(parent_id,child_id,menu_id,date,total_price,payment_status)
      VALUES($1,$2,$3,'2026-09-10',45,'paid')`, [id(1), id(20), id(32)]);
    await db.exec(cnedRule);
    const before = (await db.query('SELECT * FROM children WHERE id=$1', [id(20)])).rows[0];
    await db.exec('BEGIN');
    await db.query(`INSERT INTO parent_school_affiliations(parent_id,school_id,status) VALUES($1,$2,'active')
      ON CONFLICT(parent_id,school_id) DO UPDATE SET status='active'`, [id(1), id(10)]);
    await db.query('UPDATE children SET school_id=$1 WHERE id=$2', [id(10), id(20)]);
    await db.exec('COMMIT');
    const after = (await db.query('SELECT * FROM children WHERE id=$1', [id(20)])).rows[0];
    assert.deepEqual(after, { ...before, school_id: id(10) });
    assert.equal((await db.query('SELECT school_id FROM children WHERE id=$1', [id(21)])).rows[0].school_id, id(11));
    const history = (await db.query('SELECT get_preparation_snapshot($1,$2) snapshot', [[id(32)], '2026-09-10'])).rows[0].snapshot;
    assert.equal(history.orders.length, 1);
    assert.equal(history.orders[0].school_name, 'CNED EIM');
    assert.deepEqual(history.orders[0].allergies, ['Gluten']);
    await asParent(db);
    const affiliations = (await db.query('SELECT school_id FROM parent_school_affiliations')).rows;
    assert.ok(affiliations.some(a => a.school_id === id(10)));
    await db.query(`INSERT INTO cart_items(parent_id,child_id,menu_id,date,total_price)
      VALUES($1,$2,$3,'2099-10-01',45)`, [id(1), id(20), id(31)]);
    await assert.rejects(db.query('UPDATE children SET school_id=$1 WHERE id=$2', [id(11), id(20)]), /CNED EIM/);
    assert.equal((await db.query('SELECT count(*)::int n FROM cart_items')).rows[0].n, 1);
  } finally { await db.close(); }
});

test('CNED restriction does not strand a bank payment already initiated under the old rule', async () => {
  const db = await database();
  try {
    await db.query(`INSERT INTO cart_items(id,parent_id,child_id,menu_id,date,total_price)
      VALUES($1,$2,$3,$4,'2099-10-01',45)`, [id(40), id(1), id(20), id(30)]);
    const payment = await checkout(db);
    await db.exec(cnedRule);
    const resumed = (await db.query('SELECT resume_meal_checkout($1,$2) p', [id(1), payment.order_id])).rows[0].p;
    assert.equal(resumed.charge_id, payment.charge_id);
    for (const expected of [true, false]) {
      assert.equal((await db.query('SELECT complete_payzone_payment($1,$2) ok', [payment.order_id, payment.charge_id])).rows[0].ok, expected);
    }
    assert.equal((await db.query('SELECT count(*)::int n FROM reservations')).rows[0].n, 1);
    assert.equal((await db.query('SELECT used_amount::float n FROM parent_credits')).rows[0].n, 20);
  } finally { await db.close(); }
});
