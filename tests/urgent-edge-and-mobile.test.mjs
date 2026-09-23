import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { Script } from 'node:vm';
import { webcrypto, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const id='00000000-0000-0000-0000-000000000001';
const payment={order_id:'order-1',charge_id:'CHG_test',parent_id:id,total_amount:45,status:'pending',payzone_status:null,released_at:null};
async function edge(name,options={}) {
 const calls=[]; const requests=[]; let endpoint;
 const db={
  auth:{getUser:async()=>({data:{user:options.noUser?null:{id:'auth-user'}}}),admin:{
   generateLink:async args=>{calls.push({kind:'invite',args});return {data:{user:{id:'new-user'},properties:{action_link:'https://example.test/one-time-link'}}};},
   deleteUser:async uid=>{calls.push({kind:'cleanup',uid});return {};},
  }},
  from(table) {
   let operation='select';const chain={};
   for(const method of ['select','update','insert','eq','single','maybeSingle']) chain[method]=(...args)=>{calls.push({table,method,args});if(['insert','update'].includes(method))operation=method;return chain;};
   chain.then=(yes,no)=>Promise.resolve(table==='parents'?{data:{id,is_admin:!!options.admin}}:
    table==='providers'&&operation==='select'?{data:options.provider?{is_active:options.active!==false}:null}:
    table==='pending_payments'?{data:options.payment||payment}:
    {data:null,error:options.profileError&&operation==='insert'?{message:'insert failed'}:null}).then(yes,no);
   return chain;
  },
  rpc:async(name,args)=>{calls.push({rpc:name,args});return {data:name==='active_push_recipients'?[{push_token:'ExpoPushToken[test]',user_id:id}]:name==='claim_menu_notification_events'?options.events||[]:true};},
 };
 const source=(await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8')).replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\r?\n/gm,'');
 const env={SUPABASE_URL:'https://supabase.example.test',SUPABASE_SERVICE_ROLE_KEY:'server-secret',PAYZONE_MERCHANT_ACCOUNT:'test-merchant',PAYZONE_URL:'https://payment-sandbox.payzone.ma/pwthree/launch',PAYZONE_NOTIFICATION_KEY:'notification-secret',...(options.api?{PAYZONE_API_CALLER_NAME:'caller',PAYZONE_API_CALLER_PASSWORD:'caller-secret'}:{})};
 new Script(stripTypeScriptTypes(source)).runInNewContext({serve:cb=>endpoint=cb,createClient:()=>db,Request,Response,URL,TextEncoder,AbortSignal,crypto:webcrypto,Deno:{env:{get:k=>env[k]}},console:{log(){},error(){}},fetch:async(url,init)=>{
  requests.push({url,init});
  if(url.includes('/api/v3/charges/'))return new Response(JSON.stringify(options.charge||{id:payment.charge_id,merchantAccount:'test-merchant',lineItem:{currency:'MAD',amount:45},status:'DECLINED'}),{status:options.apiStatus||200});
  return new Response(JSON.stringify({data:[{status:'ok'}]}));
 }});
 return {calls,requests,run:(body,token='user-token')=>endpoint(new Request('https://example.test',{method:'POST',headers:{authorization:token?'Bearer '+token:'','Content-Type':'application/json'},body:JSON.stringify(body)}))};
}

test('R06 arbitrary recipients/content/tokens are rejected for user JWTs before sending any push',async()=>{
 for(const body of [{userId:id,title:'Forged payment',body:'Pay me',notificationType:'payment_confirmed'},{tokens:['ExpoPushToken[stolen]'],title:'X',body:'Y',notificationType:'x'}]) {
  const fn=await edge('send-notification',{provider:true});assert.equal((await fn.run(body)).status,403);assert.equal(fn.requests.length,0);
 }
 const anon=await edge('send-notification',{noUser:true});assert.equal((await anon.run({menuIds:[id]})).status,401);
 const disabled=await edge('send-notification',{provider:true,active:false});assert.equal((await disabled.run({menuIds:[id]})).status,403);
});

test('R06 a recorded menu event derives recipient and content on the server; server payment notifications still work',async()=>{
 const event={id:'event-1',school_id:id,title:'Actual menu deleted',body:'Actual database event',data:{}};
 const fn=await edge('send-notification',{provider:true,events:[event]});assert.equal((await fn.run({menuIds:[id]})).status,200);
 const push=JSON.parse(fn.requests[0].init.body)[0];assert.equal(push.title,event.title);assert.equal(push.body,event.body);
 assert.equal(fn.calls.find(c=>c.rpc==='active_push_recipients').args.p_user_ids[0],id);
 const server=await edge('send-notification');assert.equal((await server.run({userId:id,userType:'parent',title:'Payment confirmed',body:'Test',notificationType:'payment_confirmed'},'server-secret')).status,200);
});

test('R12 only an admin can create managed accounts; invitations contain no stored or generated application password',async()=>{
 const denied=await edge('create-managed-account');assert.equal((await denied.run({accountType:'school',name:'Test',email:'test@example.test'})).status,403);assert.equal(denied.calls.some(c=>c.kind==='invite'),false);
 const fn=await edge('create-managed-account',{admin:true});const response=await fn.run({accountType:'provider',name:'Test',email:'test@example.test',pin:'1234'});assert.equal(response.status,200);
 assert.equal((await response.json()).activationLink,'https://example.test/one-time-link');assert.equal(fn.calls.find(c=>c.kind==='invite').args.type,'invite');
 assert.equal(fn.calls.some(c=>c.table==='managed_account_passwords'),false);assert.equal(JSON.stringify(fn.calls).includes('temp_password'),false);assert.equal(fn.requests.length,0);
 const failed=await edge('create-managed-account',{admin:true,profileError:true});assert.equal((await failed.run({accountType:'school',name:'Test',email:'test@example.test'})).status,500);assert.ok(failed.calls.some(c=>c.kind==='cleanup'));
});

test('R09 status reconciliation requires ownership and never releases an unknown, absent or mismatched bank payment',async()=>{
 const foreign=await edge('payzone-status',{payment:{...payment,parent_id:'other'}});assert.equal((await foreign.run({orderId:'order-1'})).status,404);assert.equal(foreign.requests.length,0);
 const unavailable=await edge('payzone-status');const response=await unavailable.run({orderId:'order-1'});assert.equal(response.status,200);assert.equal((await response.json()).checked,false);assert.equal(unavailable.calls.some(c=>c.rpc),false);
 const absent=await edge('payzone-status',{api:true,apiStatus:404});assert.equal((await absent.run({orderId:'order-1'})).status,200);assert.equal(absent.calls.some(c=>c.rpc),false);assert.equal(absent.requests.length,1);
 const mismatch=await edge('payzone-status',{api:true,charge:{id:'wrong'}});assert.equal((await mismatch.run({orderId:'order-1'})).status,409);assert.equal(mismatch.requests.length,1);
});

test('R09 reconciliation signs the documented PayZone GET and forwards only a verified bank result',async()=>{
 const fn=await edge('payzone-status',{api:true});assert.equal((await fn.run({orderId:'order-1'})).status,200);
 assert.equal(fn.requests.length,2);const bank=fn.requests[0];const timestamp=bank.init.headers['X-HMAC-Timestamp'];
 assert.equal(bank.init.headers['X-HMAC-Signature'],createHmac('sha256','caller-secret').update('caller'+'test-merchant'+timestamp+'/api/v3/charges/CHG_test').digest('hex'));
 const callback=fn.requests[1];assert.equal(callback.init.headers['x-callback-signature'],createHmac('sha256','notification-secret').update(callback.init.body).digest('hex'));
 assert.equal(JSON.parse(callback.init.body).orderId,payment.order_id);
});

test('R11 school civil dates and Moroccan cutoff are independent of the phone timezone',()=>{
 const source=new URL('../lib/dates.ts',import.meta.url).href;
 for(const tz of ['Africa/Casablanca','Europe/Paris','UTC','America/Los_Angeles','Pacific/Auckland']) {
  const result=execFileSync(process.execPath,['--input-type=module','-e',`import {formatYmd,isMealPastCutoff} from ${JSON.stringify(source)};console.log(JSON.stringify([formatYmd(new Date(2026,8,23,0,0)),isMealPastCutoff('2026-09-23',new Date('2026-09-23T05:59:59Z')),isMealPastCutoff('2026-09-23',new Date('2026-09-23T06:00:00Z'))]));`],{env:{...process.env,TZ:tz},encoding:'utf8'});
  assert.deepEqual(JSON.parse(result),['2026-09-23',false,true],tz);
 }
});

test('R42 actual logout revokes the authenticated session before sign-out and stops on network failure',async()=>{
 const source=(await readFile(new URL('../lib/auth.ts',import.meta.url),'utf8')).replace(/^import.*\n/gm,'').replace(/export /g,'');
 for(const fail of [false,true]) {
  const calls=[];const context={supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'real-auth-user'}}}}),signOut:async()=>{calls.push('signOut');return {};}}},notificationService:{unregisterToken:async()=>{calls.push('revoke');if(fail)throw new Error('offline');}},AsyncStorage:{removeItem:async()=>calls.push('clear')},console};
  new Script(stripTypeScriptTypes(source)+';globalThis.service=authService').runInNewContext(context);
  if(fail) {await assert.rejects(context.service.logout(),/offline/);assert.deepEqual(calls,['revoke']);}
  else {await context.service.logout();assert.deepEqual(calls.slice(0,2),['revoke','signOut']);assert.ok(calls.includes('clear'));}
 }
});
