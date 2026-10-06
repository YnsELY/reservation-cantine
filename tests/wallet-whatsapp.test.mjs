import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const { default: ts } = await import(process.env.TYPESCRIPT_MODULE || 'typescript');
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const migration = await readFile(new URL('../supabase/migrations/20261005200000_wallet_whatsapp_notifications.sql', import.meta.url), 'utf8');
const checkoutMigrations = await Promise.all(['20260922140000_prevent_duplicate_meal_orders.sql','20260922150000_confirm_additional_daily_meals.sql','20260923090000_atomic_checkout_and_credit_ledger.sql'].map(name => readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8')));
async function database({ active = true, parentOptIn = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.uid'',true),'''')::uuid';
    GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    CREATE TABLE parents(id uuid PRIMARY KEY,user_id uuid,first_name text,last_name text,is_admin boolean DEFAULT false);
    CREATE FUNCTION current_parent_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS 'SELECT id FROM public.parents WHERE user_id=auth.uid()';
    CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'SELECT coalesce(bool_or(is_admin),false) FROM public.parents WHERE user_id=auth.uid()';
    CREATE TABLE providers(id uuid PRIMARY KEY,user_id uuid,is_active boolean DEFAULT true);
    CREATE TABLE children(id uuid PRIMARY KEY,parent_id uuid,school_id uuid,first_name text,last_name text);
    CREATE TABLE menus(id uuid PRIMARY KEY,school_id uuid,provider_id uuid,date date,available boolean DEFAULT true,price numeric,meal_name text,supplements uuid[] DEFAULT '{}');
    CREATE TABLE provider_supplements(id uuid PRIMARY KEY,menu_id uuid,price numeric,available boolean DEFAULT true);
    CREATE TABLE cart_items(id uuid PRIMARY KEY,parent_id uuid,child_id uuid,menu_id uuid,date date,total_price numeric,supplements jsonb,annotations text);
    CREATE TABLE reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parent_id uuid,child_id uuid,menu_id uuid,date date,total_price numeric,supplements jsonb,annotations text,payment_status text,payment_intent_id text,created_by_school boolean DEFAULT false,school_payment_pending boolean DEFAULT false,cancelled_at timestamptz);
    CREATE TABLE parent_credits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parent_id uuid,amount numeric,used_amount numeric DEFAULT 0,is_active boolean DEFAULT true,source_reservation_id uuid UNIQUE,meal_week_start_date date,created_at timestamptz DEFAULT now());
    CREATE TABLE pending_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id text UNIQUE,charge_id text,parent_id uuid,cart_items jsonb,applied_credits jsonb DEFAULT '[]',total_amount numeric,status text DEFAULT 'pending',payzone_transaction_id text,payzone_status text,completed_at timestamptz,failure_reason text,created_at timestamptz DEFAULT now(),expires_at timestamptz,refunded_at timestamptz);
    INSERT INTO parents VALUES('${id(20)}','${id(21)}','Parent','Test',false),('${id(22)}','${id(23)}','Autre','Famille',false);
    INSERT INTO providers VALUES('${id(60)}','${id(61)}',true),('${id(62)}','${id(63)}',true);
    INSERT INTO children VALUES('${id(1)}','${id(20)}','${id(30)}','Enfant','Un'),('${id(2)}','${id(20)}','${id(30)}','Enfant','Deux');
    INSERT INTO menus(id,school_id,provider_id,date,price,meal_name) VALUES('${id(10)}','${id(30)}','${id(60)}','2099-10-01',45,'Repas');
    INSERT INTO parent_credits(id,parent_id,amount) VALUES('${id(50)}','${id(20)}',100);
  `);
  for (const sql of checkoutMigrations) await db.exec(sql);
  await db.exec(migration);
  await db.exec(`UPDATE whatsapp_notification_settings SET delivery_enabled=${active};`);
  for (const [user,role,phone,enabled] of [[21,'parent','+212600000001',parentOptIn],[61,'provider','+212600000002',true],[63,'provider','+212600000003',true]]) {
    await db.query("SELECT set_config('test.uid',$1,false)",[id(user)]);
    await db.query('SELECT set_whatsapp_preferences($1,$2,$3)',[role,phone,enabled]);
  }
  return db;
}
async function prepare(db, bank = 0) {
  await db.exec(`INSERT INTO cart_items(id,parent_id,child_id,menu_id,date,total_price,confirmed_daily_quantity) VALUES('${id(40)}','${id(20)}','${id(1)}','${id(10)}','2099-10-01',45,1);`);
  const item={id:id(40),child_id:id(1),menu_id:id(10),date:'2099-10-01',total_price:45};
  return (await db.query('SELECT prepare_meal_checkout($1,$2,$3,$4) p',[id(20),JSON.stringify([item]),bank,JSON.stringify(bank===45?[]:[{credit_id:id(50),amount:45-bank}])])).rows[0].p;
}
const outbox = async db => (await db.query('SELECT * FROM wallet_whatsapp_outbox ORDER BY recipient_role')).rows;
const complete = (db,p) => db.query('SELECT complete_payzone_payment($1,$2)',[p.order_id,p.charge_id]);

test('wallet completion queues one receipt each, accurate balance, and no unrelated provider',async()=>{
  const db=await database();try {
    await db.exec(`INSERT INTO parent_credits(parent_id,amount,used_amount,reserved_amount) VALUES('${id(20)}',80,10,20); INSERT INTO parent_credits(parent_id,amount,is_active) VALUES('${id(20)}',999,false);`);
    const p=await prepare(db);const jobs=await outbox(db);
    assert.equal(jobs.length,2);assert.deepEqual(jobs.map(j=>j.recipient_user_id),[id(21),id(61)]);
    assert.equal(jobs[0].receipt.wallet_used,45);assert.equal(jobs[0].receipt.wallet_remaining,105);
    assert.equal(jobs[0].receipt.items[0].meal,'Repas');assert.equal(jobs[0].receipt.order_total,45);
    await complete(db,p);await db.query("UPDATE pending_payments SET status='completed' WHERE order_id=$1",[p.order_id]);
    assert.equal((await outbox(db)).length,2);
  }finally{await db.close();}
});
test('mixed payment queues only after bank success; card-only never queues',async()=>{
  for(const bank of [25,45]) {const db=await database();try {
    const p=await prepare(db,bank);assert.equal((await outbox(db)).length,0);
    await complete(db,p);const jobs=await outbox(db);assert.equal(jobs.length,bank===45?0:2);
    if(jobs.length){assert.equal(jobs[0].receipt.wallet_used,20);assert.equal(jobs[0].receipt.wallet_remaining,80);}
  }finally{await db.close();}}
});
test('no parent opt-in still notifies provider; disabled service never backfills old orders',async()=>{
  for(const active of [true,false]) {const db=await database({active,parentOptIn:false});try {
    const p=await prepare(db);assert.equal((await outbox(db)).length,active?1:0);
    await db.exec('UPDATE whatsapp_notification_settings SET delivery_enabled=true');await complete(db,p);
    assert.equal((await outbox(db)).length,active?1:0);
  }finally{await db.close();}}
});
test('rollback removes receipts together with credit consumption and reservations',async()=>{
  const db=await database();try {
    await db.exec('BEGIN');await prepare(db);assert.equal((await outbox(db)).length,2);await db.exec('ROLLBACK');
    assert.equal((await outbox(db)).length,0);assert.equal((await db.query('SELECT used_amount FROM parent_credits')).rows[0].used_amount,'0');
  }finally{await db.close();}
});
test('claim is exclusive and checks current consent, phone, refunds and provider deactivation',async()=>{
  for(const change of ['optout','phone','refund','inactive','none']) {const db=await database();try {
    await prepare(db);
    if(change==='optout') await db.exec("UPDATE whatsapp_preferences SET enabled=false WHERE recipient_role='parent'");
    if(change==='phone') await db.exec("UPDATE whatsapp_preferences SET phone='+212600000009' WHERE recipient_role='parent'");
    if(change==='refund') await db.exec("UPDATE pending_payments SET status='refunded'");
    if(change==='inactive') await db.exec('UPDATE providers SET is_active=false');
    const claimed=(await db.query('SELECT * FROM claim_wallet_whatsapp_receipts(10)')).rows;
    assert.equal(claimed.length,change==='refund'?0:change==='none'?2:1);
    assert.equal((await db.query('SELECT * FROM claim_wallet_whatsapp_receipts(10)')).rows.length,0);
    if(claimed.length){await db.exec("UPDATE wallet_whatsapp_outbox SET attempted_at=now()-interval '11 minutes' WHERE status='sending'");await db.query('SELECT * FROM claim_wallet_whatsapp_receipts(10)');assert.equal((await outbox(db)).filter(j=>j.status==='unknown').length,claimed.length);}
  }finally{await db.close();}}
});
test('preferences use authenticated identity; clients cannot read receipts or activate delivery',async()=>{
  const db=await database();try {
    await db.query("SELECT set_config('test.uid',$1,false)",[id(21)]);await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_whatsapp_preferences('parent','+212600000004',true)");
    assert.equal((await db.query("SELECT get_whatsapp_preferences('parent') p")).rows[0].p.phone,'+212600000004');
    await assert.rejects(db.query("SELECT set_whatsapp_preferences('provider','+212600000004',true)"),/Compte introuvable/);
    await assert.rejects(db.query("SELECT set_whatsapp_preferences('parent','0600000000',true)"),/invalide/);
    for(const query of ['SELECT * FROM wallet_whatsapp_outbox','SELECT * FROM whatsapp_preferences','UPDATE whatsapp_notification_settings SET delivery_enabled=true','SELECT * FROM claim_wallet_whatsapp_receipts(10)']) await assert.rejects(db.query(query),e=>e.code==='42501');
  }finally{await db.close();}
});
async function tsModule(path) {
  const src=await readFile(new URL(path,import.meta.url),'utf8');
  return import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
}
test('phone normalization and provider template preserve amounts without SMS or secrets',async()=>{
  const {normalizeWhatsAppPhone}=await tsModule('../lib/whatsapp.ts');
  assert.equal(normalizeWhatsAppPhone('06 12 34 56 78'),'+212612345678');
  assert.equal(normalizeWhatsAppPhone('0033 6 12 34 56 78'),'+33612345678');
  assert.equal(normalizeWhatsAppPhone('123'),null);assert.equal(normalizeWhatsAppPhone('0612345678ext9'),null);
  const {walletTemplatePayload}=await tsModule('../supabase/functions/_shared/wallet-whatsapp.ts');
  const payload=walletTemplatePayload('+212612345678','wallet_receipt','fr',{order_id:'CRD_test',parent_name:'Parent\nTest',wallet_used:45,wallet_remaining:105,order_total:45,items:[{date:'2099-10-01',child:{first_name:'Enfant'},meal:'Repas',amount:45}]});
  assert.equal(payload.messaging_product,'whatsapp');assert.equal(payload.to,'212612345678');
  assert.equal(payload.template.components[0].parameters[5].text,'105,00 DH');
  assert.equal(payload.template.components[0].parameters[0].text,'Parent Test');
});
