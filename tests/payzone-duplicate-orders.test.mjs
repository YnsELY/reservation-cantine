// Execute the real Edge Function handlers with isolated Supabase/HTTP boundaries.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { webcrypto, createHmac } from 'node:crypto';
import { Script } from 'node:vm';
import { test } from 'node:test';
import * as meals from '../supabase/functions/_shared/meal-orders.ts';

const item = { id: 'cart-1', child_id: 'child-1', menu_id: 'menu-1', date: '2026-10-01',
  total_price: 25, supplements: [], annotations: null,
  child: { first_name: 'Alex', last_name: 'Test' }, menu: { meal_name: 'Repas' } };
const payment = { order_id: 'order-1', parent_id: 'parent-1', cart_items: [item], applied_credits: [], charge_id: 'CHG_test', total_amount: 25, status: 'pending' };

async function handler(name, options = {}) {
  const calls = [];
  const notifications = [];
  let endpoint;
  const result = (table, operation, sourceIds) => {
    if (table === 'parents') return { data: options.noParent ? null : { id: 'parent-1', email: 'parent@example.test', first_name: 'Parent', last_name: 'Test' } };
    if (table === 'cart_items') return { data: options.cart || [item], error: options.cartError };
    if (table === 'reservations' && sourceIds) return { data: (options.reservations || []).filter(row => sourceIds.includes(row.source_cart_item_id)), error: options.lookupError };
    if (table === 'reservations') return { data: options.reservations || [], error: options.lookupError };
    if (table === 'pending_payments' && operation === 'insert') return { error: options.insertError };
    if (table === 'pending_payments' && operation === 'select') return { data: payment };
    return { data: [], error: null };
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'user-1' } } }) },
    from(table) {
      let operation = 'select';
      let sourceIds;
      const chain = {};
      for (const method of ['select', 'insert', 'update', 'eq', 'in', 'neq', 'not', 'or', 'single', 'limit']) {
        chain[method] = (...args) => {
          calls.push({ table, method, args });
          if (method === 'in' && args[0] === 'source_cart_item_id') sourceIds = args[1];
          if (['insert', 'update'].includes(method)) operation = method;
          return chain;
        };
      }
      chain.then = (yes, no) => Promise.resolve(result(table, operation, sourceIds)).then(yes, no);
      return chain;
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name === 'prepare_meal_checkout') return { data: options.payment || payment, error: options.prepareError };
      return { data: options.completedNow ?? false, error: options.completionError };
    },
  };
  const source = (await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), 'utf8'))
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\r?\n/gm, '');
  new Script(stripTypeScriptTypes(source)).runInNewContext({
    serve: callback => { endpoint = callback; }, createClient: () => supabase,
    ...meals, Request, Response, TextEncoder, crypto: webcrypto,
    Deno: { env: { get: key => key === 'PAYZONE_NOTIFICATION_KEY' ? (options.missingKey ? '' : 'test-key') : 'test-config' } },
    console: { log() {}, warn() {}, error() {} },
    fetch: async (...args) => { notifications.push(args); return new Response('{}'); },
  });
  return { calls, notifications, run: body => endpoint(new Request('https://example.test', {
    method: 'POST', headers: { authorization: options.noToken ? '' : 'Bearer test-token', 'x-callback-signature': options.badSignature ? 'invalid' : createHmac('sha256','test-key').update(JSON.stringify(body)).digest('hex') }, body: JSON.stringify(body),
  })) };
}

test('initialization requires a valid session and ownership of the parent account', async () => {
  for (const [option,status] of [['noToken',401],['noUser',401],['noParent',403]]) {
    const fn=await handler('payzone-init',{[option]:true});
    assert.equal((await fn.run({parentId:'parent-1',cartItems:[item],totalAmount:25})).status,status);
    assert.equal(fn.calls.some(c=>c.rpc),false);
  }
});
test('initialization uses only the validated server checkout and preserves bank references',async()=>{
  const fn=await handler('payzone-init');
  const response=await fn.run({parentId:'parent-1',cartItems:[item],totalAmount:99});
  assert.equal(response.status,200);const payload=JSON.parse((await response.json()).payload);
  assert.equal(payload.price,'25');assert.equal(payload.chargeId,'CHG_test');assert.equal(payload.orderId,'order-1');
  assert.equal(fn.calls.filter(c=>c.rpc==='prepare_meal_checkout').length,1);
  assert.equal(fn.calls.some(c=>c.method==='insert'),false);
});
test('database refusal cannot open a payable form',async()=>{
  const fn=await handler('payzone-init',{prepareError:{message:'Un repas est déjà commandé'}});
  const response=await fn.run({parentId:'parent-1',cartItems:[item],totalAmount:25});
  assert.equal(response.status,409);assert.equal((await response.json()).payload,undefined);
});
test('completed wallet order and paid-but-incomplete order cannot open another bank form',async()=>{
  for(const p of [{...payment,status:'completed',total_amount:0},{...payment,payzone_status:'CHARGED'}]) {
    const fn=await handler('payzone-init',{payment:p});
    const response=await fn.run({parentId:'parent-1',cartItems:[item],totalAmount:0});
    assert.equal(response.status,p.status==='completed'?200:409);
    const body=await response.json();assert.equal(body.payload,undefined);
    if(p.status==='completed') assert.equal(body.completed,true);
  }
});
test('callback requires a configured key and a valid signature',async()=>{
  for(const [option,status] of [['missingKey',503],['badSignature',403]]) {
    const fn=await handler('payzone-callback',{[option]:true});
    assert.equal((await fn.run({orderId:'order-1',id:'CHG_test',status:'CHARGED'})).status,status);
    assert.equal(fn.calls.length,0);
  }
});

test('callback replay acknowledges the RPC result without sending confirmations again', async () => {
  const fn = await handler('payzone-callback', { completedNow: false });
  const response = await fn.run({ orderId: 'order-1', id: 'CHG_test', status: 'CHARGED' });
  assert.equal(response.status, 200);
  assert.equal(fn.calls.filter(call => call.rpc === 'complete_payzone_payment').length, 1);
  assert.equal(fn.calls.some(call => call.method === 'insert'), false);
  assert.equal(fn.notifications.length, 0);
});

test('successful completion sends confirmation only after the atomic RPC succeeds', async () => {
  const fn = await handler('payzone-callback', { completedNow: true });
  assert.equal((await fn.run({ orderId: 'order-1', id: 'CHG_test', status: 'CHARGED' })).status, 200);
  assert.equal(fn.notifications.length, 2); // Confirmation email and parent push.
});

test('a paid order conflict remains visible as CHARGED and is retried, not marked declined', async () => {
  const fn = await handler('payzone-callback', { completionError: { message: 'Ce repas est déjà réservé' } });
  const response = await fn.run({ orderId: 'order-1', id: 'CHG_test', status: 'CHARGED' });
  assert.equal(response.status, 500);
  const update = fn.calls.find(call => call.method === 'update').args[0];
  assert.equal(update.payzone_status, 'CHARGED');
  assert.equal(update.status, undefined);
  assert.match(update.failure_reason, /déjà réservé/);
  assert.equal(fn.notifications.length, 0);
});

test('a late DECLINED notification cannot report a completed order as failed', async () => {
  const fn = await handler('payzone-callback');
  assert.equal((await fn.run({ orderId: 'order-1', id: 'CHG_test', status: 'DECLINED' })).status, 200);
  assert.equal(fn.notifications.length, 0);
  assert.ok(fn.calls.some(call => call.method === 'in' && call.args[0] === 'status'
    && !call.args[1].includes('completed') && !call.args[1].includes('refunded')));
});

test('refund processing uses the atomic RPC and exposes reconciliation failures',async()=>{
 const fn=await handler('payzone-callback');
 assert.equal((await fn.run({orderId:'order-1',id:'CHG_test',status:'REFUNDED'})).status,200);
 assert.ok(fn.calls.some(c=>c.rpc==='refund_payzone_payment'));
 const blocked=await handler('payzone-callback',{completionError:{message:'Un avoir existe déjà'}});
 assert.equal((await blocked.run({orderId:'order-1',id:'CHG_test',status:'REFUNDED'})).status,500);
 const update=blocked.calls.find(c=>c.method==='update').args[0];
 assert.equal(update.payzone_status,'REFUNDED');assert.match(update.failure_reason,/avoir existe déjà/);
});
