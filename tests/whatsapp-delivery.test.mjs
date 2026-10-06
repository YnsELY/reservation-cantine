import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createHmac, webcrypto } from 'node:crypto';
import { Script } from 'node:vm';

async function setup(name, options={}) {
  let endpoint;const updates=[],network=[],claims=[];
  const receipt={order_id:'CRD_test',parent_name:'Parent Test',order_total:45,wallet_used:45,wallet_remaining:55,items:[{date:'2099-10-01',child:{first_name:'Enfant'},meal:'Repas',amount:45}]};
  const job={id:'job-test',order_id:'CRD_test',recipient_user_id:'parent-test',recipient_role:'parent',phone:'+212600000001',claim_token:'claim-test',receipt};
  const config={WHATSAPP_WORKER_SECRET:'worker-secret',WHATSAPP_ACCESS_TOKEN:'access-test',WHATSAPP_PHONE_NUMBER_ID:'12345',WHATSAPP_GRAPH_VERSION:'v25.0',WHATSAPP_PARENT_TEMPLATE:'parent_receipt',WHATSAPP_PROVIDER_TEMPLATE:'provider_receipt',WHATSAPP_APP_SECRET:'app-secret',WHATSAPP_WEBHOOK_VERIFY_TOKEN:'verify-secret',SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'service-test'};
  const db={
    rpc:async(name,args)=>{claims.push({name,args});return {data:claims.length===1?[job]:[],error:null}},
    from(table){
      const filters=[];const chain={};let update;
      chain.update=data=>{update=data;updates.push({table,data,filters});return chain;};
      for(const method of ['eq','or'])chain[method]=(...args)=>{filters.push([method,...args]);return chain;};
      for(const method of ['select','single','maybeSingle'])chain[method]=()=>chain;
      chain.then=(resolve,reject)=>Promise.resolve({error:null,data:update?null:table==='whatsapp_preferences'?{phone:job.phone,enabled:!options.optout}:table==='pending_payments'?{status:options.refund?'refunded':'completed'}:{delivery_enabled:true}}).then(resolve,reject);
      return chain;
    }
  };
  const source=(await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
  const templateSource=(await readFile(new URL('../supabase/functions/_shared/wallet-whatsapp.ts',import.meta.url),'utf8')).replace(/^export /gm,'');
  new Script(stripTypeScriptTypes(templateSource+'\n'+source)).runInNewContext({
    createClient:()=>db,Request,Response,URL,TextEncoder,AbortSignal,crypto:webcrypto,
    Deno:{serve:fn=>{endpoint=fn},env:{get:key=>key===options.missing?undefined:config[key]}},
    fetch:async(url,init)=>{network.push({url,init});if(options.timeout)throw new Error('timeout');return new Response(JSON.stringify(options.http?{error:{code:131026}}:{messages:[{id:'wamid.test'}]}),{status:options.http||200});}
  });
  return {updates,network,claims,run:(body={},headers={})=>endpoint(new Request('https://example.test',{method:'POST',headers,body:JSON.stringify(body)})),get:url=>endpoint(new Request(url))};
}
test('worker rejects client calls and unconfigured API without claiming or sending',async()=>{
  const worker=await setup('send-wallet-whatsapp');assert.equal((await worker.run()).status,401);assert.equal(worker.claims.length,0);
  const missing=await setup('send-wallet-whatsapp',{missing:'WHATSAPP_ACCESS_TOKEN'});assert.equal((await missing.run({}, {'x-whatsapp-worker-secret':'worker-secret'})).status,503);assert.equal(missing.claims.length,0);
});
test('worker submits server-built WhatsApp receipt once and records acceptance',async()=>{
  const worker=await setup('send-wallet-whatsapp');const headers={'x-whatsapp-worker-secret':'worker-secret'};
  assert.equal((await worker.run({to:'untrusted-number'},headers)).status,200);await worker.run({},headers);
  assert.equal(worker.network.length,1);const body=JSON.parse(worker.network[0].init.body);assert.equal(body.to,'212600000001');assert.equal(body.template.components[0].parameters[5].text,'55,00 DH');
  assert.equal(worker.updates[0].data.status,'accepted');assert.equal(worker.updates[0].data.message_id,'wamid.test');
});
test('consent withdrawal or refund cancels a claimed message before network delivery',async()=>{
  for(const options of [{optout:true},{refund:true}]){const worker=await setup('send-wallet-whatsapp',options);await worker.run({}, {'x-whatsapp-worker-secret':'worker-secret'});assert.equal(worker.network.length,0);assert.equal(worker.updates[0].data.status,'cancelled');}
});
test('ambiguous network results are not retried; explicit provider rejection is failed',async()=>{
  for(const options of [{timeout:true},{http:500},{http:400}]){const worker=await setup('send-wallet-whatsapp',options);await worker.run({}, {'x-whatsapp-worker-secret':'worker-secret'});assert.equal(worker.network.length,1);assert.equal(worker.updates[0].data.status,options.http===400?'failed':'unknown');}
});
const event=(phoneId='12345')=>({object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:phoneId},messages:[{from:'212600000001',text:{body:'ARRÊT'}}],statuses:[{id:'wamid.test',status:'delivered'}]}}]}]});
const signature=body=>({'x-hub-signature-256':'sha256='+createHmac('sha256','app-secret').update(JSON.stringify(body)).digest('hex')});
test('webhook requires valid Meta signature and correct sending account',async()=>{
  const webhook=await setup('whatsapp-webhook');assert.equal((await webhook.run(event())).status,401);assert.equal(webhook.updates.length,0);
  const foreign=event('999');await webhook.run(foreign,signature(foreign));assert.equal(webhook.updates.length,0);
  const body=event();assert.equal((await webhook.run(body,signature(body))).status,200);
  assert.equal(webhook.updates[0].table,'whatsapp_preferences');assert.equal(webhook.updates[0].data.enabled,false);
  assert.deepEqual(JSON.parse(JSON.stringify(webhook.updates[0].filters)),[['eq','phone','+212600000001']]);
  assert.equal(webhook.updates[1].data.delivery_status,'delivered');
});
test('webhook subscription requires its verification token',async()=>{
  const webhook=await setup('whatsapp-webhook');assert.equal((await webhook.get('https://example.test?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status,403);
  const response=await webhook.get('https://example.test?hub.mode=subscribe&hub.verify_token=verify-secret&hub.challenge=123');assert.equal(response.status,200);assert.equal(await response.text(),'123');
});
