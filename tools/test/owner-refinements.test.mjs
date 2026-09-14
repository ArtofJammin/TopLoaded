import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const shop=read('src/js/25-products.js');
function shopContext(){
  const items=[
    {id:'a',name:'Pikachu A',game:'pk',type:'single',set:'Test',stock:1,price:2,cond:'NM',rarity:'Common'},
    {id:'b',name:'Pikachu B',game:'pk',type:'single',set:'Test',stock:2,price:120,cond:'LP',rarity:'Rare'},
    {id:'c',name:'Other',game:'op',type:'single',set:'Other',stock:1,price:10},
    {id:'d',name:'Sold out',game:'pk',type:'single',set:'Test',stock:0,price:5}
  ];
  const c={ITEMS:items,$:()=>null,itemHay:i=>i.name.toLowerCase(),renders:0,
    buildGameChips(){},applyFilterUI(){},renderFresh(){},
    TL:{current:'shop',inventory:{loaded:true,items,catalog:()=>items},route:()=>({params:{item:'a'}})}};
  c.renderShop=()=>c.renders++;
  c.TL.setParams=(p,opts)=>{c.written=JSON.parse(JSON.stringify(p));c.options=opts;};
  vm.createContext(c);
  vm.runInContext(shop.slice(shop.indexOf('  var SHOP_PAGE ='),shop.indexOf('  /* ---- UI sync ---- */')),c);
  const start=shop.indexOf('  function enterShop(');
  vm.runInContext(shop.slice(start,shop.indexOf('\n  }',start)+4),c);
  return c;
}

test('retired shop filters have no hidden effect; old URLs are cleaned without losing game, search, sort or quick view',()=>{
  const c=shopContext();
  c.enterShop({game:'pk',q:'Pikachu',sort:'asc',cond:'DMG',rarity:'Impossible',min:'9999',max:'0'});
  assert.deepEqual(Array.from(c.computeList(),i=>i.id),['a','b']);
  assert.deepEqual(c.written,{game:'pk',q:'Pikachu',sort:'asc',item:'a'});
  assert.equal(c.options.replace,true);assert.equal(c.renders,1);
  for(const key of ['cond','rarity','min','max'])assert.equal(Object.hasOwn(c.F,key),false);
  c.readParams({game:'pk',sort:'desc',all:'1'});
  assert.deepEqual(Array.from(c.computeList(),i=>i.id),['b','d','a']);
  c.readParams({game:'pk',set:'Test',type:'sealed'});assert.equal(c.computeList().length,0);
});

test('shop controls are simplified while individual product price, condition and rarity stay visible',()=>{
  const html=read('src/html/11-shop.html');
  assert.doesNotMatch(html,/condChips|priceChips|rarityChips|rarityRow|priceMin|priceMax/);
  for(const id of ['shopSearch','gameChips','typeChips','setSel','sortSel','stockOnly','wishChip'])assert.ok(html.includes('id="'+id+'"'));
  const c={TL:{},GAMES:{pk:'Pokémon'},money:n=>'$'+n.toFixed(2),window:{}};
  vm.runInNewContext(shop.slice(0,shop.indexOf('  /* ---------- shop state ---------- */')),c);
  const card=c.prodCard({id:'test',name:'Test Card',set:'Test Set',game:'pk',price:12.5,cond:'LP',rarity:'Rare',stock:1});
  assert.match(card,/class="cond">LP/);assert.match(card,/class="p-rarity">Rare/);assert.match(card,/class="price">\$12.50/);
});

test('only the trade-in section number is removed and Get a Quote is visible without an estimator',()=>{
  const home=read('src/html/10-home.html'),buy=read('src/html/14-buylist.html');
  assert.doesNotMatch(home,/03 \/ MAKE ROOM/);
  assert.match(home,/MAKE ROOM FOR WHAT’S NEXT/);assert.match(home,/03 \/ Fair/);
  assert.match(home,/#\/buylist\?quote=1/);assert.doesNotMatch(home,/don't provide online estimates or quotes/);
  assert.match(buy,/<section[^>]*id="buyQuote"/);assert.match(buy,/id="buyQuoteTitle"[^>]*>Get a Quote/);
  assert.match(buy,/data-quote-link/);assert.doesNotMatch(buy,/worthEstimator|worthForm|Get my offer|<details[^>]*buy-inquiry/);
  assert.match(buy,/Final pricing and offers are confirmed in store/);
});

test('flat plan is primary and the hotel reference stays secondary; table directory remains available',()=>{
  const html=read('src/html/12-show.html');
  assert.match(html,/id="floorTitle">Flat plan/);
  assert.ok(html.indexOf('id="showFloorGuide"')<html.indexOf('id="showVenueReference"'));
  assert.match(html,/<details class="floor-directory"><summary>Table directory/);
  assert.match(read('src/css/47-floor-guide.css'),/\.floor-guide-body\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});
