import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const item = (n=40,child=1,date='2099-10-01') => ({id:id(n),child_id:id(child),menu_id:id(10),date,total_price:45});
const applied = (amount=20) => [{credit_id:id(50),amount}];
const migrations = await Promise.all(['20260922140000_prevent_duplicate_meal_orders.sql','20260922150000_confirm_additional_daily_meals.sql','20260923090000_atomic_checkout_and_credit_ledger.sql'].map(n=>readFile(new URL('../supabase/migrations/'+n,import.meta.url),'utf8')));
async function database() {
 const db=new PGlite();
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''test.uid'',true),'''')::uuid';
 CREATE TABLE parents(id uuid PRIMARY KEY,user_id uuid,is_admin boolean DEFAULT false);
 CREATE FUNCTION current_parent_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER AS 'SELECT id FROM public.parents WHERE user_id=auth.uid()';
 CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'SELECT coalesce(bool_or(is_admin),false) FROM public.parents WHERE user_id=auth.uid()';
 CREATE TABLE children(id uuid PRIMARY KEY,parent_id uuid,school_id uuid,first_name text,last_name text);
 CREATE TABLE menus(id uuid PRIMARY KEY,school_id uuid,date date,available boolean DEFAULT true,price numeric,meal_name text,supplements uuid[] DEFAULT '{}');
 CREATE TABLE provider_supplements(id uuid PRIMARY KEY,menu_id uuid,price numeric,available boolean DEFAULT true);
 CREATE TABLE cart_items(id uuid PRIMARY KEY,parent_id uuid,child_id uuid,menu_id uuid,date date,total_price numeric,supplements jsonb,annotations text);
 CREATE TABLE reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parent_id uuid,child_id uuid,menu_id uuid,date date,total_price numeric,supplements jsonb,annotations text,payment_status text,payment_intent_id text,created_by_school boolean DEFAULT false,school_payment_pending boolean DEFAULT false,cancelled_at timestamptz);
 CREATE TABLE parent_credits(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),parent_id uuid,amount numeric,used_amount numeric DEFAULT 0,is_active boolean DEFAULT true,source_reservation_id uuid UNIQUE,meal_week_start_date date,created_at timestamptz DEFAULT now());
 CREATE TABLE pending_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id text UNIQUE,charge_id text,parent_id uuid,cart_items jsonb,applied_credits jsonb DEFAULT '[]',total_amount numeric,status text DEFAULT 'pending',payzone_transaction_id text,payzone_status text,completed_at timestamptz,failure_reason text,created_at timestamptz DEFAULT now(),expires_at timestamptz);
 INSERT INTO parents VALUES('${id(20)}','${id(21)}',false),('${id(22)}','${id(23)}',false);
 INSERT INTO children VALUES('${id(1)}','${id(20)}','${id(30)}','Test','One'),('${id(2)}','${id(20)}','${id(30)}','Test','Two');
 INSERT INTO menus(id,school_id,date,price,meal_name) VALUES('${id(10)}','${id(30)}','2099-10-01',45,'Menu');
 INSERT INTO parent_credits(id,parent_id,amount) VALUES('${id(50)}','${id(20)}',100);
 `);
 for (const sql of migrations) await db.exec(sql);
 return db;
}
async function cart(db,n=40,child=1,confirmed=1) {
 return db.query('INSERT INTO cart_items(id,parent_id,child_id,menu_id,date,total_price,confirmed_daily_quantity) VALUES($1,$2,$3,$4,$5,45,$6)',[id(n),id(20),id(child),id(10),'2099-10-01',confirmed]);
}
async function prepare(db,items=[item()],bank=25,credits=applied()) {
 return (await db.query('SELECT prepare_meal_checkout($1,$2,$3,$4) AS p',[id(20),JSON.stringify(items),bank,JSON.stringify(credits)])).rows[0].p;
}
async function complete(db,p,reference=p.charge_id) {
 return (await db.query('SELECT complete_payzone_payment($1,$2) AS ok',[p.order_id,reference])).rows[0].ok;
}
async function numbers(db) {
 return (await db.query(`SELECT (SELECT count(*)::int FROM reservations) reservations,(SELECT count(*)::int FROM meal_payment_holds) holds,(SELECT used_amount::float FROM parent_credits WHERE id='${id(50)}') used,(SELECT reserved_amount::float FROM parent_credits WHERE id='${id(50)}') reserved`)).rows[0];
}

test('bank checkout reserves credit, reuses its reference and completes once',async()=>{
 const db=await database();try {
  await cart(db);const p=await prepare(db);const again=await prepare(db);
  assert.equal(p.order_id,again.order_id);assert.equal(again.reused,true);
  assert.deepEqual(await numbers(db),{reservations:0,holds:1,used:0,reserved:20});
  assert.equal(await complete(db,p),true);assert.equal(await complete(db,p),false);
  assert.deepEqual(await numbers(db),{reservations:1,holds:0,used:20,reserved:0});
  assert.equal((await prepare(db)).status,'completed');
  assert.equal((await db.query('SELECT count(*)::int n FROM credit_movements')).rows[0].n,2);
 }finally{await db.close();}
});
test('credit-only checkout consumes and creates reservations atomically, including retries',async()=>{
 const db=await database();try {
  await cart(db);const p=await prepare(db,[item()],0,applied(45));assert.equal(p.status,'completed');assert.match(p.charge_id,/^CRD_/);
  assert.equal((await prepare(db,[item()],0,applied(45))).order_id,p.order_id);
  assert.deepEqual(await numbers(db),{reservations:1,holds:0,used:45,reserved:0});
 }finally{await db.close();}
});
test('insufficient credit rolls back the whole checkout',async()=>{
 const db=await database();try {
  await cart(db);await db.exec('UPDATE parent_credits SET used_amount=90');
  await assert.rejects(prepare(db),/Crédit cagnotte indisponible/);
  assert.equal((await db.query('SELECT count(*)::int n FROM pending_payments')).rows[0].n,0);
  assert.deepEqual(await numbers(db),{reservations:0,holds:0,used:90,reserved:0});
 }finally{await db.close();}
});
test('unconfirmed duplicates, changed prices, foreign children and repeated cart ids cannot open payment',async()=>{
 for(const variant of ['unconfirmed','price','foreign','repeat']) {
  const db=await database();try {
   await cart(db);
   if(variant==='unconfirmed') await db.exec(`ALTER TABLE cart_items DISABLE TRIGGER guard_duplicate_cart_meal; INSERT INTO cart_items SELECT '${id(41)}',parent_id,child_id,menu_id,date,total_price,supplements,annotations,confirmed_daily_quantity,repeat_order_confirmed_at FROM cart_items; ALTER TABLE cart_items ENABLE TRIGGER guard_duplicate_cart_meal;`);
   if(variant==='price') await db.exec('UPDATE menus SET price=50');
   if(variant==='foreign') await db.exec(`UPDATE children SET parent_id='${id(22)}' WHERE id='${id(1)}'`);
   const items=variant==='unconfirmed'?[item(),item(41)]:variant==='repeat'?[item(),item()]:[item()];
   await assert.rejects(prepare(db,items,45*items.length,[]),new RegExp({unconfirmed:'déjà commandé',price:'prix du repas',foreign:'plus disponible',repeat:'ligne répétée'}[variant]));
   assert.equal((await db.query('SELECT count(*)::int n FROM pending_payments')).rows[0].n,0);
  }finally{await db.close();}
 }
});
test('another checkout or school insertion cannot overtake an in-flight payment',async()=>{
 const db=await database();try {
  await cart(db);const p=await prepare(db);await cart(db,41,1,2);
  await assert.rejects(prepare(db,[item(41)],45,[]),/paiement est déjà en cours/);
  await assert.rejects(db.exec(`INSERT INTO reservations(parent_id,child_id,menu_id,date,total_price,payment_status) VALUES('${id(20)}','${id(1)}','${id(10)}','2099-10-01',45,'paid')`),/paiement est déjà en cours/);
  await assert.rejects(db.exec(`DELETE FROM cart_items WHERE id='${id(40)}'`),/paiement est déjà en cours/);
  await complete(db,p);
 }finally{await db.close();}
});
test('another credit order cannot consume a balance held by bank payment',async()=>{
 const db=await database();try {
  await db.exec('UPDATE parent_credits SET amount=50');await cart(db);await prepare(db,[item()],5,applied(40));await cart(db,41,2);
  await assert.rejects(prepare(db,[item(41,2)],0,applied(45)),/Crédit cagnotte indisponible/);
  assert.deepEqual(await numbers(db),{reservations:0,holds:1,used:0,reserved:40});
 }finally{await db.close();}
});
test('explicit consent permits one extra checkout after the first completes',async()=>{
 const db=await database();try {
  await cart(db);await prepare(db,[item()],0,applied(45));await cart(db,41,1,2);
  const p=await prepare(db,[item(41)],45,[]);await complete(db,p);
  assert.equal((await numbers(db)).reservations,2);
 }finally{await db.close();}
});
test('wrong bank reference and completion failure do not consume or partially create',async()=>{
 const db=await database();try {
  await cart(db);const p=await prepare(db);await assert.rejects(complete(db,p,'CHG_wrong'),/incohérente/);
  assert.deepEqual(await numbers(db),{reservations:0,holds:1,used:0,reserved:20});
  await db.exec(`CREATE FUNCTION fail_reservation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated failure'; END $$; CREATE TRIGGER fail_reservation BEFORE INSERT ON reservations FOR EACH ROW EXECUTE FUNCTION fail_reservation();`);
  await assert.rejects(complete(db,p),/simulated failure/);
  assert.deepEqual(await numbers(db),{reservations:0,holds:1,used:0,reserved:20});
 }finally{await db.close();}
});
test('bank RPCs cannot be invoked by anonymous or parent clients',async()=>{
 const db=await database();try {
  await cart(db);for(const role of ['anon','authenticated']) {
   await db.exec(`SET ROLE ${role}`);await assert.rejects(prepare(db),e=>e.code==='42501');await db.exec('RESET ROLE');
  }
 }finally{await db.close();}
});
test('cancellation returns one credit once and is limited to the authenticated family',async()=>{
 const db=await database();try {
  await cart(db);await prepare(db,[item()],45,[]).then(p=>complete(db,p));
  const r=(await db.query('SELECT id FROM reservations')).rows[0].id;
  await db.query("SELECT set_config('test.uid',$1,false)",[id(23)]);
  await assert.rejects(db.query('SELECT cancel_meal_with_credit($1)',[r]),/introuvable/);
  await db.query("SELECT set_config('test.uid',$1,false)",[id(21)]);
  const a=(await db.query('SELECT cancel_meal_with_credit($1) id',[r])).rows[0].id;
  const b=(await db.query('SELECT cancel_meal_with_credit($1) id',[r])).rows[0].id;
  assert.equal(a,b);assert.equal((await db.query('SELECT count(*)::int n FROM parent_credits')).rows[0].n,2);
 }finally{await db.close();}
});
test('migration can be reapplied without altering recorded balances or orders',async()=>{
 const db=await database();try {await cart(db);await prepare(db,[item()],0,applied(45));await db.exec(migrations[2]);assert.equal((await numbers(db)).used,45);}finally{await db.close();}
});

test('an old paywall is resumed with the same charge, and overlapping old baskets are blocked',async()=>{
 const db=await database();try {
  await cart(db);
  await db.query("INSERT INTO pending_payments(order_id,charge_id,parent_id,cart_items,total_amount,applied_credits) VALUES('legacy','CHG_legacy',$1,$2,45,'[]')",[id(20),JSON.stringify([item()])]);
  const p=await prepare(db,[item()],45,[]);assert.equal(p.order_id,'legacy');assert.equal(p.charge_id,'CHG_legacy');assert.ok(p.checkout_key);
  await complete(db,p);assert.equal((await numbers(db)).reservations,1);
 }finally{await db.close();}
 const blocked=await database();try {
  await cart(blocked);await blocked.query("INSERT INTO pending_payments(order_id,charge_id,parent_id,cart_items,total_amount) VALUES('legacy','CHG_legacy',$1,$2,45)",[id(20),JSON.stringify([item(99)])]);
  await assert.rejects(prepare(blocked,[item()],45,[]),/ancien paiement doit être vérifié/);
 }finally{await blocked.close();}
});
test('supplement prices are checked on the server against the selected menu',async()=>{
 const db=await database();try {
  await cart(db);await db.exec(`INSERT INTO provider_supplements(id,menu_id,price) VALUES('${id(60)}','${id(10)}',5); UPDATE cart_items SET supplements='[{"id":"${id(60)}","price":5}]',total_price=50;`);
  await prepare(db,[{...item(),total_price:50}],50,[]).then(p=>complete(db,p));
  assert.equal((await numbers(db)).reservations,1);
 }finally{await db.close();}
});
