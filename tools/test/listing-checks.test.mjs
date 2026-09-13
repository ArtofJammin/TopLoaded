import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../src/js/34-listing-checks.js',import.meta.url),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
function boot(enabled=true){
  const nodes={},events={},documentEvents={},gets=[],posts=[],timers=new Map();let timerId=0;
  for(const id of ['qvListingCheck','qvListingStatus','qvListingRetry'])nodes['#'+id]={textContent:'',dataset:{},hidden:false,disabled:false,listeners:{},addEventListener(k,f){this.listeners[k]=f;}};
  const context={URL,Map,Date,$:id=>nodes[id],setTimeout:(f,ms)=>{timers.set(++timerId,{f,ms});return timerId;},clearTimeout:id=>timers.delete(id),
    document:{hidden:false,addEventListener:(k,f)=>documentEvents[k]=f},
    TL:{on:(k,f)=>events[k]=f,api:{online:enabled,integrations:{listingChecks:enabled},get:(url,opts)=>new Promise(resolve=>gets.push({url,opts,resolve})),post:async(url,body,opts)=>{posts.push({url,body,opts});return {queued:true};}}}};
  vm.runInNewContext(source,context);
  return {nodes,events,documentEvents,gets,posts,timers,context,open:id=>events['quickview:item']({id:'tcg-'+id,tcg:true})};
}
const listed=id=>({productId:id,status:'listed',checkedAt:Date.now(),expiresAt:Date.now()+900000});
test('opening one card checks only that card anonymously; fresh cache avoids repeated requests',async()=>{
  const x=boot();x.open('123');assert.equal(x.gets.length,1);assert.equal(x.gets[0].opts.noAuth,true);
  x.gets[0].resolve(listed('123'));await flush();assert.match(x.nodes['#qvListingStatus'].textContent,/Listed by our seller/);
  x.events['quickview:close']();assert.equal(x.timers.size,0);x.open('123');assert.equal(x.gets.length,1);
});
test('slow response for previous card cannot overwrite current card; hidden tabs and closed dialogs stop timers',async()=>{
  const x=boot();x.open('123');x.open('456');
  x.gets[1].resolve({productId:'456',status:'not-listed',checkedAt:Date.now(),expiresAt:Date.now()+900000});await flush();
  x.gets[0].resolve(listed('123'));await flush();assert.match(x.nodes['#qvListingStatus'].textContent,/No active listing/);
  x.context.document.hidden=true;x.documentEvents.visibilitychange();assert.equal(x.timers.size,0);
  x.events['quickview:close']();x.context.document.hidden=false;x.documentEvents.visibilitychange();assert.equal(x.gets.length,2);
});
test('static / disconnected site shows unconfirmed availability and makes no browser scraping requests',()=>{
  const x=boot(false);x.open('123');assert.equal(x.gets.length,0);assert.match(x.nodes['#qvListingStatus'].textContent,/Availability unconfirmed/);
  assert.equal(x.nodes['#qvListingRetry'].hidden,true);
});
test('outbound link remains native navigation, sends one keepalive hint, ignores other sellers and middle-button duplicates',async()=>{
  const x=boot(),link={href:'https://www.tcgplayer.com/product/123?seller=5c356cdf'};
  let prevented=false;const e={type:'click',target:{closest:()=>link},preventDefault:()=>{prevented=true;}};
  x.documentEvents.click(e);x.documentEvents.click(e);await flush();assert.equal(x.posts.length,1);assert.equal(prevented,false);
  assert.equal(x.posts[0].opts.keepalive,true);assert.equal(x.posts[0].opts.noAuth,true);assert.match(x.posts[0].url,/123\/interest$/);
  link.href='https://www.tcgplayer.com/product/456?seller=someone-else';x.documentEvents.click(e);assert.equal(x.posts.length,1);
  link.href='https://www.tcgplayer.com/product/456?seller=5c356cdf';x.documentEvents.auxclick({...e,type:'auxclick',button:1});await flush();assert.equal(x.posts.length,2);
  x.documentEvents.click({...e,defaultPrevented:true});assert.equal(x.posts.length,2);
});
test('a failed observation never displays sold out or mutates cart inventory',async()=>{
  const x=boot();x.open('123');x.gets[0].resolve({status:'unknown',retryAt:Date.now()+900000,lastKnown:{status:'listed'}});await flush();
  assert.match(x.nodes['#qvListingStatus'].textContent,/Availability unconfirmed/);assert.doesNotMatch(x.nodes['#qvListingStatus'].textContent,/sold out/i);
  assert.equal(x.nodes['#qvListingRetry'].disabled,true);
});
