import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, client } from './helpers.mjs';
import { setupReport, shopCheckoutStatus, webhookConfigured } from '../src/lib/readiness.js';
import { squareConfigured } from '../src/lib/square.js';

test('setup report is admin-only and never returns secret values', async () => {
  const env=makeEnv({SQUARE_ACCESS_TOKEN:'SECRET-SQUARE',GITHUB_TOKEN:'SECRET-GITHUB',GOOGLE_PLACES_API_KEY:'SECRET-GOOGLE'}),c=client(env);
  for(const path of ['/setup/status','/setup/verify']){
    const method=path.endsWith('verify')?'post':'get';
    const request=opts=>method==='post'?c.post(path,{},opts):c.get(path,opts);
    assert.equal((await request()).status,401);
    assert.equal((await request({token:await c.login('staff')})).status,403);
  }
  const r=await c.get('/setup/status',{token:await c.login('admin')});
  assert.equal(r.status,200);assert.equal(r.data.version,1);
  assert.equal(JSON.stringify(r.data).includes('SECRET-'),false);
  assert.equal(r.data.checks.find(x=>x.id==='claims').state,'disabled');
  assert.equal(r.data.checks.find(x=>x.id==='tcg-write').state,'manual');
});
test('readiness distinguishes absent, unsafe and configured settings',()=>{
  const env=makeEnv({SITE_ORIGIN:'*',SQUARE_WEBHOOK_SIGNATURE_KEY:'key',SQUARE_WEBHOOK_URL:'https://api.test/square/webhook'});
  assert.equal(webhookConfigured(env),true);
  for(const value of ['http://api.test/square/webhook','https://api.test/wrong','https://user:password@api.test/square/webhook','https://api.test/square/webhook?secret=x','https://toploaded-api.REPLACE.workers.dev/square/webhook'])assert.equal(webhookConfigured({...env,SQUARE_WEBHOOK_URL:value}),false);
  const report=setupReport(env);
  assert.ok(report.checks.find(x=>x.id==='site').missing.includes('SITE_ORIGIN'));
  assert.ok(report.checks.find(x=>x.id==='auth').missing.includes('TOKEN_SECRET'));
  assert.ok(report.checks.find(x=>x.id==='email').missing.includes('EMAIL_FROM'));
  assert.ok(report.checks.find(x=>x.id==='google').missing.includes('reviews.googlePlaceId'));
  assert.equal(squareConfigured({...env,SQUARE_ENV:'typo',SQUARE_ACCESS_TOKEN:'token',SQUARE_LOCATION_ID:'LOC'}),false);
});
test('read-only setup probes only the expected provider read endpoints and redact provider data',async()=>{
  const env=makeEnv({SQUARE_ACCESS_TOKEN:'secret-token',SQUARE_LOCATION_ID:'LOC',GITHUB_TOKEN:'secret-gh',GITHUB_REPO:'ArtofJammin/TopLoaded'}),c=client(env),token=await c.login('admin');
  const real=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,opts)=>{
    calls.push([String(url),opts]);
    if(String(url).endsWith('/locations/LOC'))return Response.json({location:{id:'LOC',status:'ACTIVE',currency:'USD',address:'PRIVATE ADDRESS'}});
    if(String(url).includes('/catalog/list'))return Response.json({objects:[{id:'PRIVATE SKU'}]});
    if(String(url).includes('api.github.com'))return Response.json({state:'active',private:'SENSITIVE'});
    throw new Error('unexpected provider');
  };
  try{
    const r=await c.post('/setup/verify',{}, {token});assert.equal(r.status,200);
    assert.deepEqual(r.data.probes.map(p=>p.ok),[true,true]);assert.equal(calls.length,3);
    assert.equal(calls.every(([,o])=>!o.method||o.method==='GET'),true);
    assert.doesNotMatch(JSON.stringify(r.data),/PRIVATE|SENSITIVE|secret-token|secret-gh/);
    assert.equal((await c.get('/health')).data.integrations.shopCheckout,false);
    globalThis.fetch=async()=>Response.json({location:{id:'LOC',status:'ACTIVE',currency:'CAD'},errors:[{detail:'LEAKED PROVIDER BODY'}]});
    const failed=await c.post('/setup/verify',{}, {token});assert.equal(failed.data.probes.every(p=>!p.ok),true);assert.doesNotMatch(JSON.stringify(failed.data),/LEAKED PROVIDER BODY/);
    await c.post('/setup/verify',{}, {token});
    assert.equal((await c.post('/setup/verify',{}, {token})).status,429);
  }finally{globalThis.fetch=real;}
});
test('adding Square keys cannot activate ordinary checkout; production remains gated even with the sandbox switch',async()=>{
  const real=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('No provider call allowed');};
  try{
    for(const extra of [{},{SHOP_CHECKOUT_ENABLED:'true',SQUARE_ENV:'production'},{SHOP_CHECKOUT_ENABLED:'true',SQUARE_ENV:'typo'}]){
      const env=makeEnv({SQUARE_ACCESS_TOKEN:'test',SQUARE_LOCATION_ID:'LOC',...extra});
      assert.equal(shopCheckoutStatus(env).ready,false);
      const c=client(env),r=await c.post('/checkout',{lines:[{id:'tcg-123',name:'Card',price:10,qty:1}]});
      assert.equal(r.status,503);assert.equal((await env.KV.list({prefix:'order:'})).keys.length,0);
    }
  }finally{globalThis.fetch=real;}
});
