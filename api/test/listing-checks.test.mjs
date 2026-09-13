import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeEnv, client } from './helpers.mjs';
import { memoryObject } from '../src/lib/memory-object.js';
import { InventoryCoordinator } from '../src/lib/inventory-coordinator.js';
import { inventoryCoordinator } from '../src/lib/inventory-check-client.js';
import { resetInventoryCache } from '../src/routes/price.js';
import { signWebhook } from '../src/lib/square.js';

const FRESH = 900000;
function setup(extra={}) {
  const env=makeEnv({LISTING_CHECKS_ENABLED:'true',...extra});
  env.INVENTORY_COORDINATOR=memoryObject(InventoryCoordinator,env);
  return {env,object:env.INVENTORY_COORDINATOR.get('shop'),c:client(env)};
}
const reply=id=>new Response(JSON.stringify({results:[{totalResults:1,results:[{productId:Number(id),listings:[{sellerKey:'5c356cdf',quantity:2}]}]}]}));
function clock(t){let now=1800000000000;t.mock.method(Date,'now',()=>now);return ms=>{now+=ms;return now;};}
function remote(t){
  resetInventoryCache(); let listingCalls=0;
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    if(String(url).endsWith('/inventory.json'))return new Response(JSON.stringify({generated:new Date().toISOString(),items:[{id:123,name:'Card',listings:[{qty:2,price:10}]}]}));
    listingCalls++;return reply(JSON.parse(init.body).filters.term.productId[0]);
  });
  return ()=>listingCalls;
}
test('public listing route accepts only a known numeric product; anonymous shared cache leaves inventory unchanged',async t=>{
  const calls=remote(t),{c,env}=setup();
  assert.equal((await c.get('/inventory/listing/javascript:foo')).status,400);
  assert.equal((await c.get('/inventory/listing/999')).status,404);
  const [a,b]=await Promise.all([c.get('/inventory/listing/123'),c.get('/inventory/listing/123')]);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(calls(),1);
  assert.equal((await c.get('/inventory/listing/123')).data.status,'listed');
  assert.equal(calls(),1);assert.equal(await env.KV.get('inventory:overrides'),null);assert.equal(await env.KV.get('alerts'),null);
});
test('first concurrent check reserves one persisted lease; cache expires at fifteen minutes',async t=>{
  const advance=clock(t),{object}=setup();let calls=0,release;
  t.mock.method(globalThis,'fetch',async()=>{calls++;await new Promise(r=>{release=r;});return reply('123');});
  const first=object.check('123');
  while(!release)await new Promise(r=>setImmediate(r));
  assert.equal((await object.check('123')).reason,'checking');assert.equal(calls,1);
  release();const a=await first;
  assert.equal(a.status,'listed');advance(FRESH-1);assert.equal((await object.check('123')).checkedAt,a.checkedAt);
  advance(1);t.mock.method(globalThis,'fetch',async()=>{calls++;return reply('123');});
  assert.notEqual((await object.check('123')).checkedAt,a.checkedAt);assert.equal(calls,2);
});
test('403 and 429 pause all products; failure retains last observation but never returns sold-out or stale quantity',async t=>{
  const advance=clock(t),{object}=setup();let fail=0,calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return fail?new Response('',{status:fail}):reply('123');});
  const good=await object.check('123');advance(FRESH);fail=403;
  const bad=await object.check('123');assert.equal(bad.status,'unknown');assert.equal(bad.quantityShown,undefined);
  assert.equal(bad.lastKnown.status,'listed');assert.equal(bad.lastKnown.checkedAt,good.checkedAt);
  assert.equal((await object.check('124')).reason,'paused');assert.equal(calls,2);
  advance(FRESH);fail=429;await object.check('123');assert.equal((await object.check('124')).reason,'paused');assert.equal(calls,3);
});
test('all visitors share the twelve/minute and six-hundred/day upstream limits',async t=>{
  const advance=clock(t),{object}=setup();let calls=0;
  t.mock.method(globalThis,'fetch',async(url,init)=>{calls++;return reply(JSON.parse(init.body).filters.term.productId[0]);});
  for(let i=1;i<=12;i++)assert.equal((await object.check(String(i))).status,'listed');
  assert.equal((await object.check('13')).reason,'paused');assert.equal(calls,12);
  // Exercise the daily limit without making hundreds of fake upstream requests.
  await object.change(s=>{s.dayCount=600;});advance(60000);
  assert.equal((await object.check('13')).reason,'paused');assert.equal(calls,12);
});
test('outbound interest is coalesced and delayed; alarm survives object recreation, stops when done, makes no sale',async t=>{
  const advance=clock(t),{object,env}=setup();let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return reply('123');});
  const first=await object.interest('123');advance(60000);
  assert.equal((await object.interest('123')).notBefore,first.notBefore);
  await object.alarm();assert.equal(calls,0);
  advance(FRESH);
  const restarted=new InventoryCoordinator({storage:object.storage},env);
  await restarted.alarm();assert.equal(calls,1);
  assert.equal(await object.storage.get('__alarm'),undefined);assert.equal(await env.KV.get('alerts'),null);
  assert.equal((await object.storage.get('state')).notices.length,0);
});
test('rejected delayed check leaves no infinite retry alarm or fabricated sold-out stock',async t=>{
  const advance=clock(t),{object}=setup();
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:403}));
  await object.interest('123');advance(FRESH);await object.alarm();
  assert.equal(await object.storage.get('__alarm'),undefined);
  assert.equal((await object.check('123')).status,'unknown');
});
function signed(secret,body,eventId='mail_1',timestamp=String(Math.floor(Date.now()/1000))){
  const raw=JSON.stringify(body),sig=createHmac('sha256',secret).update(timestamp+'.'+eventId+'.'+raw).digest('hex');
  return {raw,headers:{'x-tl-timestamp':timestamp,'x-tl-event-id':eventId,'x-tl-signature':sig}};
}
test('mail bridge is disabled until opted in; rejects forged/stale/untrusted content and dedupes signed hints',async t=>{
  clock(t);remote(t);const secret='test-bridge-secret-'.repeat(3),{c,env,object}=setup({TCG_NOTIFICATION_SECRET:secret});
  const body={type:'order-notification',productIds:['123']},url='/inventory/notifications/tcgplayer';
  assert.equal((await c.post(url,undefined,signed(secret,body))).status,503);
  env.TCG_NOTIFICATION_ENABLED='true';
  assert.equal((await c.post(url,undefined,signed('wrong',body))).status,401);
  assert.equal((await c.post(url,undefined,signed(secret,body,'old',String(Math.floor(Date.now()/1000)-301)))).status,401);
  assert.equal((await c.post(url,undefined,signed(secret,{...body,from:'orders@tcgplayer.com'}))).status,400);
  assert.equal((await c.post(url,undefined,signed(secret,{...body,productIds:['999']}))).status,404);
  const first=await c.post(url,undefined,signed(secret,body));assert.equal(first.status,202);assert.equal(first.data.duplicate,false);
  assert.equal((await c.post(url,undefined,signed(secret,body))).data.duplicate,true);
  assert.ok((await object.storage.get('state')).hintDue);
  assert.equal(await env.KV.get('alerts'),null); // processed by alarm, no unverified stock mutation
});
test('trusted hints coalesce a full import and staff review; no customer content or stock writes',async t=>{
  const advance=clock(t),{object,env}=setup({GITHUB_TOKEN:'test'});let dispatches=0;
  t.mock.method(globalThis,'fetch',async(url,init)=>{assert.match(String(url),/api.github.com.*dispatches$/);assert.equal(init.method,'POST');dispatches++;return new Response(null,{status:204});});
  await object.notice('mail1','tcg-notification');await object.notice('mail2','tcg-notification');advance(1000);await object.alarm();
  assert.equal(dispatches,1);assert.match((await env.KV.get('alerts','json'))[0].msg,/Verify the order/);
  await object.notice('mail3','tcg-notification');advance(60000);await object.alarm();assert.equal(dispatches,1);
  advance(FRESH);await object.alarm();assert.equal(dispatches,2);assert.equal(await env.KV.get('inventory:overrides'),null);
});
test('email digests are opt-in, coalesced, deduped and bounded; retries keep the same provider idempotency key',async t=>{
  const advance=clock(t),{env,object}=setup({RESEND_API_KEY:'test',EMAIL_FROM:'Shop <site@example.com>',NOTIFY_EMAIL:'staff@example.com'});
  let sends=0,fail=true;const keys=[];
  t.mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');sends++;keys.push(init.headers['Idempotency-Key']);return new Response(JSON.stringify({id:'msg'}),{status:fail?503:200});});
  await object.notice('p0','square-payment');await object.alarm();assert.equal(sends,0);
  env.INVENTORY_ALERT_EMAIL_ENABLED='true';
  await object.notice('p1','square-payment');await object.notice('p1','square-payment');advance(1000);await object.alarm();assert.equal(sends,1);
  await object.notice('p2','square-payment');advance(1000);await object.alarm();assert.equal(sends,1);
  // Waiting digest + new notices must not schedule a one-second alarm loop.
  assert.ok((await object.storage.get('__alarm'))>=Date.now()+800000);
  advance(FRESH);fail=false;await object.alarm();assert.equal(sends,2);assert.equal(keys[0],keys[1]);
  advance(FRESH);await object.alarm();assert.equal(sends,3);assert.notEqual(keys[1],keys[2]);
  assert.equal(await object.storage.get('__alarm'),undefined);
});
test('only signed completed Square payments queue email review, not pending payments or clicks; duplicate payments coalesce',async t=>{
  clock(t);const {c,env,object}=setup({INVENTORY_ALERT_EMAIL_ENABLED:'true',RESEND_API_KEY:'test',EMAIL_FROM:'staff@example.com',NOTIFY_EMAIL:'staff@example.com',SQUARE_WEBHOOK_SIGNATURE_KEY:'key',SQUARE_WEBHOOK_URL:'https://api.test/square/webhook'});
  async function payment(status,eventId,valid=true){const raw=JSON.stringify({event_id:eventId,type:'payment.updated',data:{object:{payment:{id:'PAY1',status}}}});return c.post('/square/webhook',undefined,{raw,headers:{'x-square-hmacsha256-signature':valid?await signWebhook('key',env.SQUARE_WEBHOOK_URL,raw):'bad'}});}
  assert.equal((await payment('COMPLETED','bad',false)).status,401);
  assert.equal((await payment('PENDING','pending')).status,200);assert.equal(await object.storage.get('state'),undefined);
  assert.equal((await payment('COMPLETED','done1')).status,200);assert.equal((await payment('COMPLETED','done2')).status,200);
  assert.equal((await object.storage.get('state')).notices.length,1);
  assert.match((await env.KV.get('alerts','json'))[0].msg,/payment.*completed/);
});
test('public and internal checks fail closed when disabled',async t=>{
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('must not call upstream');});
  const {env,c}=setup({LISTING_CHECKS_ENABLED:'false'});
  assert.equal((await c.get('/inventory/listing/123')).data.reason,'disabled');
  assert.equal((await inventoryCoordinator(env,'interest',{id:'123'})).queued,false);
});
