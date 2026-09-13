import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { publicApiConfig } from '../site-api-config.mjs';
import { deploymentConfig } from '../setup-api.mjs';

function boot({base=null,runtime='',session={},provider=null}={}){
  const calls=[],memory={...session},events=[];
  const context={URL,AbortController,AbortSignal,setTimeout,clearTimeout,location:{hostname:'artofjammin.github.io',origin:'https://artofjammin.github.io'},document:{querySelector:()=>null},
    TL:{store:{get:()=>base},session:{get:(k,fb)=>memory[k]??fb,set:(k,v)=>memory[k]=v,del:k=>delete memory[k]},emit:(...a)=>events.push(a)},
    fetch:async(url,opts)=>{calls.push({url,opts});if(url==='api-config.json')return Response.json({version:1,apiBase:runtime});if(provider)return provider(url,opts);return Response.json({ok:true,service:'toploaded-api',apiVersion:1,integrations:{square:false}});}};
  context.window=context;
  vm.runInNewContext(readFileSync(new URL('../../src/js/02-api.js',import.meta.url),'utf8'),context);
  return {api:context.TL.api,memory,calls,events};
}
test('runtime deployment setting connects after one anonymous health check, preserving only same-endpoint staff sessions',async()=>{
  const x=boot({runtime:'https://worker.test',session:{token:'private',role:'admin','auth-base':'https://worker.test'}});
  assert.equal(await x.api.ready,true);assert.equal(x.api.base,'https://worker.test');assert.equal(x.api.token,'private');
  assert.equal(x.calls.length,2);assert.equal(x.calls[1].opts.headers.Authorization,undefined);
  assert.equal(x.api.health.service,'toploaded-api');assert.equal(x.api.integrations.square,false);
  await x.api.get('/config');assert.equal(x.calls[2].opts.headers.Authorization,'Bearer private');
  assert.equal(x.calls[2].opts.redirect,'error');
  await x.api.post('/inventory/listing/123/interest',{}, {noAuth:true,keepalive:true});
  assert.equal(x.calls[3].opts.keepalive,true);assert.equal(x.calls[3].opts.headers.Authorization,undefined);
});
test('a changed API drops old staff session; probes never send credentials or alter the active connection',async()=>{
  const x=boot({base:'https://new.test',session:{token:'private',role:'admin','auth-base':'https://old.test'}});
  assert.equal(await x.api.ready,true);assert.equal(x.api.token,null);assert.equal(x.memory.token,undefined);
  await x.api.probe('https://candidate.test');assert.equal(x.api.base,'https://new.test');
  assert.equal(x.calls.every(c=>!c.opts.headers?.Authorization),true);
  for(const url of ['javascript:alert(1)','http://remote.test','https://user:pass@worker.test','https://worker.test?secret=1','https://worker.test/#/admin'])assert.throws(()=>x.api.validateBase(url));
});
test('wrong service or API version stays offline, never trusting arbitrary health JSON',async()=>{
  for(const response of [{ok:true},{ok:true,service:'something-else',apiVersion:1},{ok:true,service:'toploaded-api',apiVersion:2}]){
    const x=boot({base:'https://worker.test',provider:()=>Response.json(response)});
    assert.equal(await x.api.ready,false);assert.equal(x.api.health,null);
  }
  const noBase=boot();assert.equal(await noBase.api.ready,false);assert.equal(noBase.calls.length,1);
});
test('deployment config generates only safe public values, isolated queue names, and disabled payments',()=>{
  const c=deploymentConfig({kvId:'a'.repeat(32),apiUrl:'https://toploaded-api-sandbox.shop.workers.dev',saleChecks:true});
  assert.equal(c.vars.CLAIM_CHECKOUT_ENABLED,'false');assert.equal(c.vars.SHOP_CHECKOUT_ENABLED,'false');
  assert.equal(c.vars.SITE_ORIGIN,'https://artofjammin.github.io');assert.equal(c.vars.SQUARE_WEBHOOK_URL,'https://toploaded-api-sandbox.shop.workers.dev/square/webhook');
  assert.equal(c.queues.producers[0].queue,'toploaded-api-sandbox-sale-checks');assert.equal(c.migrations[0].new_sqlite_classes[0],'StreamClaims');
  assert.equal(c.migrations[1].new_sqlite_classes[0],'InventoryCoordinator');
  assert.equal(c.vars.INVENTORY_ALERT_EMAIL_ENABLED,'false');assert.equal(c.vars.TCG_NOTIFICATION_ENABLED,'false');
  assert.doesNotMatch(JSON.stringify(c),/TOKEN_SECRET|ACCESS_TOKEN|PIN_HASH/);
  assert.throws(()=>deploymentConfig({kvId:'placeholder',apiUrl:'https://a.b.workers.dev'}));
  assert.throws(()=>deploymentConfig({kvId:'a'.repeat(32),apiUrl:'https://a.b.workers.dev/api'}));
  for(const url of ['http://a.test','https://user:pass@a.test','https://a.test?key=x','https://localhost'])assert.throws(()=>publicApiConfig(url));
  assert.deepEqual(publicApiConfig(''),{version:1,apiBase:''});
});
test('connection controls and recovery ship without secret input fields',()=>{
  const html=readFileSync(new URL('../../src/html/18-admin.html',import.meta.url),'utf8');
  assert.match(html,/id="apiSetupConsent"/);assert.match(html,/TL_API_URL/);assert.match(html,/never take a payment/);
  assert.match(readFileSync(new URL('../../src/html/22-overlays.html',import.meta.url),'utf8'),/id="apiResetOverride"/);
  assert.match(readFileSync(new URL('../../.github/workflows/pages.yml',import.meta.url),'utf8'),/vars.TL_API_URL/);
});
