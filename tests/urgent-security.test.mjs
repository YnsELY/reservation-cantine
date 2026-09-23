import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const base = await readFile(new URL('./fixtures/pre-urgent-schema.sql',import.meta.url),'utf8');
const migrations = await Promise.all(['20260923110000_secure_roles_and_history.sql','20260923111000_private_access_codes.sql','20260923112000_notification_authorization.sql','20260923113000_checkout_recovery.sql'].map(n=>readFile(new URL('../supabase/migrations/'+n,import.meta.url),'utf8')));
async function database() {
 const db = new PGlite();
 await db.exec(base);
 for (const sql of migrations) await db.exec(sql);
 await db.exec(`
 INSERT INTO auth.users(id) VALUES('${id(101)}'),('${id(102)}'),('${id(103)}'),('${id(104)}'),('${id(105)}');
 INSERT INTO auth.sessions(id,user_id) VALUES('${id(201)}','${id(101)}'),('${id(202)}','${id(102)}'),('${id(203)}','${id(103)}');
 INSERT INTO parents(id,user_id,access_code,first_name,last_name,is_admin) VALUES
 ('${id(1)}','${id(101)}','TEST-PARENT','Test','Parent',false),('${id(2)}','${id(102)}','TEST-ADMIN','Test','Admin',true);
 INSERT INTO schools(id,name,access_code) VALUES('${id(10)}','Test School','SCHOOL-ONE'),('${id(11)}','Other School','SCHOOL-TWO');
 INSERT INTO providers(id,user_id,company_name,is_active) VALUES('${id(3)}','${id(103)}','Test Provider',true);
 INSERT INTO provider_registration_codes(code) VALUES('PROVIDER-SECRET');
 INSERT INTO school_registration_codes(code) VALUES('SCHOOL-SECRET');
 INSERT INTO parent_registration_codes(code) VALUES('PARENT-SECRET');
 INSERT INTO parent_school_affiliations(parent_id,school_id,status) VALUES('${id(1)}','${id(10)}','active');
 INSERT INTO provider_school_access(provider_id,school_id) VALUES('${id(3)}','${id(10)}');
 INSERT INTO children(id,parent_id,school_id,first_name,last_name) VALUES('${id(20)}','${id(1)}','${id(10)}','Child','One'),('${id(21)}','${id(1)}','${id(10)}','Child','Two');
 INSERT INTO menus(id,school_id,provider_id,date,meal_name,price) VALUES('${id(30)}','${id(10)}','${id(3)}','2099-10-01','Test meal',45),('${id(31)}','${id(10)}','${id(3)}','2099-10-02','Other meal',45);
 INSERT INTO parent_credits(id,parent_id,amount) VALUES('${id(50)}','${id(1)}',100);
 `);
 return db;
}
async function asUser(db,user=101) {
 await db.exec('RESET ROLE');
 await db.query("SELECT set_config('test.uid',$1,false),set_config('test.session',$2,false)",[id(user),id(user+100)]);
 await db.exec('SET ROLE authenticated');
}
async function server(db) { await db.exec('RESET ROLE'); await db.query("SELECT set_config('test.uid','',false)"); }
async function checkout(db) {
 await server(db);
 await db.exec(`INSERT INTO cart_items(id,parent_id,child_id,menu_id,date,total_price) VALUES('${id(40)}','${id(1)}','${id(20)}','${id(30)}','2099-10-01',45)`);
 return (await db.query('SELECT prepare_meal_checkout($1,$2,25,$3) AS p',[id(1),JSON.stringify([{id:id(40),child_id:id(20),menu_id:id(30),date:'2099-10-01',total_price:45}]),JSON.stringify([{credit_id:id(50),amount:20}])])).rows[0].p;
}
async function complete(db,p) {return db.query('SELECT complete_payzone_payment($1,$2) ok',[p.order_id,p.charge_id]);}
async function release(db,p,status='DECLINED') {return db.query('SELECT release_failed_checkout($1,$2,$3) ok',[p.order_id,p.charge_id,status]);}
async function balance(db) {return (await db.query(`SELECT amount::float,used_amount::float,reserved_amount::float FROM parent_credits WHERE id='${id(50)}'`)).rows[0];}

test('R02 parent profile editing cannot elevate roles or insert a second admin identity',async()=>{
 const db=await database();try {
  await asUser(db);
  await assert.rejects(db.exec(`UPDATE parents SET is_admin=true WHERE id='${id(1)}'`),/droits/);
  await assert.rejects(db.exec(`INSERT INTO parents(user_id,access_code,first_name,last_name,is_admin) VALUES('${id(101)}','EVIL','X','Y',true)`),/droits/);
  await assert.rejects(db.exec(`UPDATE parents SET user_id='${id(102)}' WHERE id='${id(1)}'`),/droits/);
  await db.exec(`UPDATE parents SET first_name='Updated' WHERE id='${id(1)}'`);
  assert.equal((await db.query('SELECT is_admin() ok')).rows[0].ok,false);
  await asUser(db,102);
  await db.exec(`UPDATE parents SET is_admin=true WHERE id='${id(1)}'`);
  await asUser(db);
  assert.equal((await db.query('SELECT is_admin() ok')).rows[0].ok,true);
 }finally{await db.close();}
});

test('R03/R04 school access requires a correct code, role and persistent attempt limit',async()=>{
 const db=await database();try {
  await asUser(db,103);
  await assert.rejects(db.exec(`INSERT INTO provider_school_access(provider_id,school_id) VALUES('${id(3)}','${id(11)}')`),e=>e.code==='42501');
  let result=(await db.query("SELECT join_school_by_code('SCHOOL-TWO','provider') j")).rows[0].j;
  assert.equal(result.school.id,id(11));assert.equal(result.school.access_code,undefined);
  for(let n=0;n<10;n++) result=(await db.query("SELECT join_school_by_code('WRONG-CODE','provider') j")).rows[0].j;
  assert.match(result.error,/tentatives/);
  result=(await db.query("SELECT join_school_by_code('SCHOOL-ONE','provider') j")).rows[0].j;
  assert.match(result.error,/tentatives/);
  await asUser(db);
  await assert.rejects(db.exec(`INSERT INTO parent_school_affiliations(parent_id,school_id) VALUES('${id(1)}','${id(11)}')`),e=>e.code==='42501');
  await assert.rejects(db.exec(`INSERT INTO children(parent_id,school_id,first_name,last_name) VALUES('${id(1)}','${id(11)}','Bypass','Test')`),/code d’accès/);
  result=(await db.query("SELECT join_school_by_code('SCHOOL-TWO','parent') j")).rows[0].j;
  assert.equal(result.school.id,id(11));
  await db.exec(`INSERT INTO children(parent_id,school_id,first_name,last_name) VALUES('${id(1)}','${id(11)}','Allowed','Test')`);
 }finally{await db.close();}
});

test('R04 anonymous/ordinary accounts cannot enumerate any registration or school access codes',async()=>{
 const db=await database();try {
  await db.exec('SET ROLE anon');
  for(const table of ['schools','provider_registration_codes','school_registration_codes','parent_registration_codes']) await assert.rejects(db.query(`SELECT * FROM ${table}`),e=>e.code==='42501');
  await asUser(db);
  assert.ok((await db.query('SELECT * FROM schools')).rows.every(s=>s.access_code===null && s.provider_registration_code===null));
  await assert.rejects(db.query('SELECT * FROM school_access_secrets'),e=>e.code==='42501');
  await assert.rejects(db.query('SELECT * FROM admin_school_access()'),e=>e.code==='42501');
  assert.equal((await db.query('SELECT id,name FROM schools')).rows.length,2);
  for(const table of ['provider_registration_codes','school_registration_codes','parent_registration_codes']) assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,0);
  await asUser(db,102);
  assert.equal((await db.query('SELECT access_code FROM admin_school_access()')).rows.length,2);
 }finally{await db.close();}
});

test('R05 deactivation is atomic and cannot be reversed by a provider session or old policies',async()=>{
 const db=await database();try {
  await asUser(db,102);await db.query('SELECT set_provider_active($1,false)',[id(3)]);
  await server(db);assert.equal((await db.query('SELECT * FROM provider_school_access')).rows.length,0);
  await asUser(db,103);
  assert.equal((await db.query('SELECT current_provider_id() id')).rows[0].id,null);
  assert.equal((await db.query('SELECT id FROM menus')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM get_provider_school_students()')).rows.length,0);
  await assert.rejects(db.exec(`UPDATE providers SET is_active=true WHERE id='${id(3)}'`),e=>e.code==='42501');
  await assert.rejects(db.exec(`INSERT INTO provider_menu_library(provider_id,meal_name) VALUES('${id(3)}','Bypass')`),e=>e.code==='42501');
  await assert.rejects(db.query('SELECT set_provider_active($1,true)',[id(3)]),e=>e.code==='42501');
 }finally{await db.close();}
});

test('R07 deleting a child cannot erase an in-flight payment or paid history',async()=>{
 const db=await database();try {
  const p=await checkout(db);await asUser(db);
  await assert.rejects(db.query('DELETE FROM children WHERE id=$1',[id(20)]),/historique/);
  await server(db);await complete(db,p);await asUser(db);
  await assert.rejects(db.query('DELETE FROM children WHERE id=$1',[id(20)]),/historique/);
  assert.equal((await db.query('SELECT * FROM reservations')).rows.length,1);
  await db.query('DELETE FROM children WHERE id=$1',[id(21)]);
  assert.equal((await db.query('SELECT * FROM children')).rows.length,1);
 }finally{await db.close();}
});

test('R08 reserved credit cannot be deleted, altered or disabled while the bank payment completes',async()=>{
 const db=await database();try {
  const p=await checkout(db);await asUser(db,102);
  await assert.rejects(db.query('DELETE FROM parent_credits WHERE id=$1',[id(50)]),/supprimée/);
  await assert.rejects(db.query('UPDATE parent_credits SET is_active=false WHERE id=$1',[id(50)]),/paiement utilise/);
  await assert.rejects(db.query('UPDATE parent_credits SET reserved_amount=0 WHERE id=$1',[id(50)]),/consommation/);
  await server(db);await complete(db,p);
  assert.deepEqual(await balance(db),{amount:100,used_amount:20,reserved_amount:0});
  await asUser(db,102);await db.query('UPDATE parent_credits SET is_active=false WHERE id=$1',[id(50)]);
  await server(db);await db.query('SELECT refund_payzone_payment($1,$2)',[p.order_id,p.charge_id]);
  assert.deepEqual(await balance(db),{amount:100,used_amount:0,reserved_amount:0});
 }finally{await db.close();}
});

test('R09 terminal failure releases only its own holds and credit once; a retry gets a fresh charge',async()=>{
 const db=await database();try {
  const p=await checkout(db);
  await assert.rejects(release(db,p,'CHARGE_PENDING'),/définitivement/);
  assert.equal((await release(db,p)).rows[0].ok,true);
  assert.equal((await release(db,p)).rows[0].ok,false);
  assert.deepEqual(await balance(db),{amount:100,used_amount:0,reserved_amount:0});
  assert.equal((await db.query('SELECT * FROM meal_payment_holds')).rows.length,0);
  const fresh=(await db.query('SELECT prepare_meal_checkout($1,$2,45,\'[]\') p',[id(1),JSON.stringify([{id:id(40),child_id:id(20),menu_id:id(30),date:'2099-10-01',total_price:45}])])).rows[0].p;
  assert.notEqual(fresh.charge_id,p.charge_id);
  await assert.rejects(complete(db,p),/après libération/);
  await complete(db,fresh);assert.equal((await release(db,fresh)).rows[0].ok,false);
  assert.equal((await db.query('SELECT * FROM reservations')).rows.length,1);
 }finally{await db.close();}
});

test('R09 original payment resumes independently of additional basket items; past-cutoff retry is blocked',async()=>{
 const db=await database();try {
  const p=await checkout(db);
  await db.exec(`INSERT INTO cart_items(parent_id,child_id,menu_id,date,total_price) VALUES('${id(1)}','${id(21)}','${id(30)}','2099-10-01',45)`);
  const resumed=(await db.query('SELECT resume_meal_checkout($1,$2) p',[id(1),p.order_id])).rows[0].p;
  assert.equal(resumed.charge_id,p.charge_id);assert.equal(resumed.cart_items.length,1);assert.equal(Number(resumed.total_amount),25);
  await assert.rejects(db.query('SELECT resume_meal_checkout($1,$2)',[id(2),p.order_id]),/introuvable/);
  await db.query("UPDATE pending_payments SET cart_items=jsonb_set(cart_items,'{0,date}','\"2020-01-01\"') WHERE order_id=$1",[p.order_id]);
  await assert.rejects(db.query('SELECT resume_meal_checkout($1,$2)',[id(1),p.order_id]),/clôturée/);
 }finally{await db.close();}
});

test('R12 plaintext password storage is forbidden even through server writes',async()=>{
 const db=await database();try {
  await assert.rejects(db.query("INSERT INTO managed_account_passwords(user_id,account_type,temp_password) VALUES($1,'provider','fake-test-password')",[id(103)]),/interdit/);
  await asUser(db,102);await assert.rejects(db.query('SELECT * FROM managed_account_passwords'),e=>e.code==='42501');
 }finally{await db.close();}
});

test('R42 push tokens follow a verified session, logout revokes and account switching atomically replaces ownership',async()=>{
 const db=await database();try {
  const token='ExpoPushToken[test_device]';await asUser(db);
  await assert.rejects(db.query("SELECT register_session_push_token($1,$2,'provider','ios')",[token,id(3)]),e=>e.code==='42501');
  await db.query("SELECT register_session_push_token($1,$2,'parent','ios')",[token,id(1)]);
  await server(db);assert.equal((await db.query("SELECT * FROM active_push_recipients($1,'parent')",[[id(1)]])).rows.length,1);
  await asUser(db);await db.query('SELECT revoke_session_push_tokens()');
  await server(db);assert.equal((await db.query("SELECT * FROM active_push_recipients($1,'parent')",[[id(1)]])).rows.length,0);
  await asUser(db,103);await db.query("SELECT register_session_push_token($1,$2,'provider','ios')",[token,id(3)]);
  await server(db);const rows=(await db.query('SELECT user_id,is_active FROM user_push_tokens')).rows;
  assert.deepEqual(rows,[{user_id:id(3),is_active:true}]);
  await db.query('DELETE FROM auth.sessions WHERE id=$1',[id(203)]);
  assert.equal((await db.query("SELECT * FROM active_push_recipients($1,'provider')",[[id(3)]])).rows.length,0);
 }finally{await db.close();}
});

test('R06 notifications are bound to actual menu deletion, caller and a single claim',async()=>{
 const db=await database();try {
  await asUser(db,103);await db.query('DELETE FROM menus WHERE id=$1',[id(31)]);
  await assert.rejects(db.query('SELECT * FROM claim_menu_notification_events($1,$2)',[[id(31)],id(103)]),e=>e.code==='42501');
  await server(db);
  assert.equal((await db.query('SELECT * FROM claim_menu_notification_events($1,$2)',[[id(31)],id(101)])).rows.length,0);
  const rows=(await db.query('SELECT * FROM claim_menu_notification_events($1,$2)',[[id(31)],id(103)])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].school_id,id(10));assert.match(rows[0].body,/Other meal/);
  assert.equal((await db.query('SELECT * FROM claim_menu_notification_events($1,$2)',[[id(31)],id(103)])).rows.length,0);
 }finally{await db.close();}
});
