import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const source=read('src/js/35-cart.js');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const id='12345678-1234-1234-1234-123456789abc',token='a'.repeat(64);
function fn(name){const start=source.indexOf('  function '+name+'(');return source.slice(start,source.indexOf('\n  }',start)+4);}
function context(){
  const events={},clicks=[],session={},params=[],nodes={streamCartNotice:{}},c={URL,Date,Promise,esc,money:n=>'$'+n.toFixed(2),
    $:s=>nodes[s.slice(1)]||{},document:{hidden:false,addEventListener:(n,f)=>{if(n==='click')clicks.push(f);}},window:{location:{href:'https://site.test/#/live'}},
    cartCommit(){},cartThumb:()=>'',toast(){},
    TL:{production:true,GAMES:{pk:'Pokémon'},store:{get:()=>null},session:{get:(k,fb)=>session[k]||fb,set:(k,v)=>{session[k]=v;}},on:(n,f)=>events[n]=f,
      api:{base:'https://api.test',online:true,ready:Promise.resolve(true)},setParams:p=>params.push(p)}};
  vm.createContext(c);vm.runInContext(source.slice(0,source.indexOf('  /* ---- storage ---- */')),c);
  c.cartLines=()=>Object.values(c.cart).map(e=>({item:e.item,qty:e.qty}));
  c.TL.cart={lines:c.cartLines,has:id=>!!c.cart[id],render(){},open(){},add(snap){c.cart[snap.id]={item:snap,qty:1};}};
  return {c,events,clicks,session,params,nodes};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('mixed cart groups and totals are separate; stream quantities are one and payment secrets are not snapshotted',()=>{
  const {c}=context();
  const tcg=c.cartSnap({id:'tcg-123',name:'TCG card',stock:3,price:10,tcg:true});
  const stream=c.cartSnap({id:'stream-claim-'+id,name:'Stream card',stock:5,price:12.5,live:true,tcg:true,claimStatus:'claimed',url:'https://square.link/u/private',access:token,paymentUrl:'https://square.link/u/private'});
  const groups=c.cartGroups([{item:tcg,qty:2},{item:stream,qty:1}]);
  assert.equal(groups.tcg.length,1);assert.equal(groups.stream.length,1);
  assert.equal(c.cartGroupSubtotal(groups.tcg),20);assert.equal(c.cartGroupSubtotal(groups.stream),12.5);
  assert.equal(c.cartMax(stream),1);assert.equal(c.cartMax(tcg),3);
  assert.equal(stream.claimId,id);assert.ok(!JSON.stringify(stream).includes(token));assert.ok(!JSON.stringify(stream).includes('square.link'));
  stream.claimStatus='paid';assert.equal(c.cartGroupSubtotal(groups.stream),0);
  vm.runInContext(fn('cartCheckout'),c);let error;
  c.cartBusy=false;c.cartSquareLive=()=>true;c.cartError=s=>error=s;c.cart['tcg-123']={item:tcg,qty:2};
  c.cartCheckout();assert.match(error,/cannot be combined/);
});

test('private claim handoff imports only server details, strips the URL token, and keeps the marketplace cart',async()=>{
  const x=context(),{c}=x;const tcg=c.cartSnap({id:'tcg-123',name:'TCG card',stock:1,price:10,tcg:true});c.cart[tcg.id]={item:tcg,qty:1};
  let calls=0;
  c.TL.api.post=async(path,b,opts)=>{calls++;assert.equal(path,'/live/claims/'+id+'/payment');assert.equal(b.access,token);assert.equal(opts.noAuth,true);return {id,card:'Server card',price:12.5,qty:1,status:'claimed',fulfillment:'ship',shippingCents:499,mode:'production',url:'https://square.link/u/verified'};};
  vm.runInContext(read('src/js/37-stream-cart.js'),c);
  x.events['view:change']({params:{claim:id,access:token}});await flush();await flush();
  assert.equal(calls,1);assert.equal(x.params[0].access,undefined);assert.equal(x.params[0].claim,undefined);
  assert.equal(c.cart['stream-claim-'+id].item.name,'Server card');assert.ok(c.cart['tcg-123']);
  assert.ok(!JSON.stringify(c.cart).includes(token));assert.ok(!JSON.stringify(c.cart).includes('square.link'));
  assert.equal(x.session['claim-access'][id].base,'https://api.test');
  assert.match(c.TL.streamCart.action(c.cart['stream-claim-'+id].item),/Pay stream claim/);
  c.TL.api.base='https://other-api.test';assert.match(c.TL.streamCart.action(c.cart['stream-claim-'+id].item),/Open the host/);
});

test('payment rechecks server state and never clears a mixed cart or treats opening checkout as payment',async()=>{
  const x=context(),{c}=x;let state='claimed',calls=0;
  c.cart['tcg-123']={item:c.cartSnap({id:'tcg-123',name:'TCG card',stock:1,price:10}),qty:1};
  c.TL.api.post=async()=>{calls++;return {id,card:'Stream card',price:12.5,qty:1,status:state,fulfillment:'pickup',shippingCents:0,mode:'production',url:state==='claimed'?'https://square.link/u/verified':null};};
  vm.runInContext(read('src/js/37-stream-cart.js'),c);x.events['view:change']({params:{claim:id,access:token}});await flush();await flush();
  const click=()=>x.clicks[0]({target:{closest:()=>({dataset:{streamPay:id}})}});
  click();await flush();assert.equal(calls,2);assert.equal(c.window.location.href,'https://square.link/u/verified');assert.equal(Object.keys(c.cart).length,2);
  assert.equal(c.cart['stream-claim-'+id].item.claimStatus,'claimed');
  c.window.location.href='https://site.test/';state='paid';click();await flush();
  assert.equal(calls,3);assert.equal(c.window.location.href,'https://site.test/');assert.equal(Object.keys(c.cart).length,2);
  assert.match(c.TL.streamCart.action(c.cart['stream-claim-'+id].item),/Paid — confirmed by Square/);
});

test('sandbox, unlinked and offline stream items cannot present real checkout and unsafe destinations are refused',async()=>{
  const x=context(),{c}=x;
  c.TL.api.post=async()=>({id,card:'Sandbox card',price:12.5,qty:1,status:'claimed',mode:'sandbox',url:'https://sandbox.square.link/u/test'});
  vm.runInContext(read('src/js/37-stream-cart.js'),c);x.events['view:change']({params:{claim:id,access:token}});await flush();await flush();
  const it=c.cart['stream-claim-'+id].item;assert.match(c.TL.streamCart.action(it),/real payment is not available/);
  x.clicks[0]({target:{closest:()=>({dataset:{streamPay:id}})}});await flush();assert.equal(c.window.location.href,'https://site.test/#/live');
  c.TL.api.online=false;assert.match(c.TL.streamCart.action(it),/unavailable/);
  assert.match(c.TL.streamCart.action({id:'live-spot-1',live:true}),/no verified payment link/);
  for(const url of ['javascript:alert(1)','http://square.link/x','https://square.link.evil.test/x','https://user@ square.link/x','https://user@square.link/x','https://square.link:8443/x'])assert.equal(c.TL.streamCart.safeUrl(url),null);
  assert.equal(c.TL.streamCart.safeUrl('https://square.link/u/test'),'https://square.link/u/test');
});
