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

test('one interactive table map replaces the separate wayfinding and hotel flyer panels',()=>{
  const html=read('src/html/12-show.html');
  assert.match(html,/id="floorTitle">Flat plan/);
  assert.match(html,/<details class="floor-directory"><summary>Table directory/);
  assert.doesNotMatch(html,/showVenueReference|show-wayfinding|hilton-first-floor.svg|hilton-show-guide.svg|Source plan, page/);
  assert.match(html,/Enter through the Convention Entrance/);
  assert.doesNotMatch(read('.github/workflows/pages.yml'),/cp venue-plans/);
});

function floorContext(){
  const grid=JSON.parse(read('venue-plans/hilton-show-grid.json'));
  const c={TL:{on(){}},window:{TL_FLOOR_VENUE:grid},esc:s=>String(s)};
  vm.runInNewContext(read('src/js/56-floorplan.js'),c);
  return {f:c.TL.floorplan,grid,config:JSON.parse(read('config.default.json')).show.floorplan};
}
test('full show draft fills the perimeter and four inner rows without moving Top Loaded',()=>{
  const {f,grid,config}=floorContext(),ballroom=config.booths.filter(b=>/^t\d+$/.test(b.id)),shop=config.booths.filter(b=>b.type==='shop');
  assert.equal(config.room,'hilton-show');assert.equal(config.rows,grid.rows);assert.equal(config.cols,grid.cols);
  assert.equal(ballroom.length,91);assert.equal(ballroom[0].r,84);assert.equal(ballroom[0].c,5);
  assert.equal(shop.length,4);assert.equal(shop.filter(b=>b.w>b.h).length,3);assert.equal(shop.filter(b=>b.h>b.w).length,1);
  assert.deepEqual(shop.find(b=>b.id==='tl-trades'),{id:'tl-trades',label:'Trades',type:'shop',r:16,c:143,w:5,h:16});
  assert.equal(shop.some(b=>b.label==='TL1'),false);
  assert.deepEqual(shop.filter(b=>b.id!=='tl-trades').map(b=>[b.label,b.r,b.c,b.w,b.h]),[['TL2',32,144,16,5],['TL3',32,160,16,5],['TL4',32,176,16,5]]);
  assert.ok(shop.every(b=>f.area(b,config.room)==='Business center'));
  assert.ok(config.booths.every((b,i)=>f.canPlace(config.booths,b,config,i)));
  assert.equal(f.stats(shop).total,0,'shop tables must not become vendor assignments');
});
test('room outlines and all entrances are in the same zoomable map coordinate system',()=>{
  const {f,grid,config}=floorContext(),svg=f.backdrop(config.room);
  assert.equal(grid.rooms.length,3);assert.equal(grid.doors.length,3);
  for(const label of ['Convention','Entrance','Door 1','Door 2','Door 3','BUSINESS CENTER','PRE-FUNCTION','TRIPLE CROWN','ATM','CHAIRS + COFFEE TABLE','HOTEL LOBBY','RESTAURANT / LOUNGE','Not the card show'])assert.ok(svg.includes(label),label);
  assert.ok(svg.includes('viewBox="0 0 272 212"'));
  assert.equal(grid.obstacles.filter(x=>x.type==='pillar').length,4);
  assert.deepEqual(grid.doors.map(x=>x.c),[21,57,91]);
  assert.match(read('src/js/60-settings.js'),/TL.floorplan.backdrop/);
});
test('six two-table outer runs and two connecting caps match the annotated plan; missing positions can be restored',()=>{
  const {f,grid,config}=floorContext(),booths=config.booths.filter(b=>!b.id.startsWith('pf-'));
  const outer=config.booths.filter(b=>b.id.startsWith('pf-'));
  assert.equal(outer.length,14);assert.equal(config.booths.length,109);
  assert.deepEqual(outer.map(({r,c,w,h})=>({r,c,w,h})),grid.outerRuns.flat());
  const initial=booths.length;
  for(let i=0;i<6;i++){const run=f.outerRun(booths,config.room);assert.equal(run.length,[2,3,2,2,2,3][i]);assert.ok(run[0].h>run[0].w);assert.equal(run[1].r,run[0].r+run[0].h);booths.push(...run);}
  assert.equal(booths.length,initial+14);assert.equal(f.outerRun(booths,config.room).length,0);
  assert.ok(booths.every((b,i)=>f.canPlace(booths,b,config,i)));
  booths.pop();assert.equal(f.outerRun(booths,config.room).length,1);
  assert.equal(f.canPlace([],{r:48,c:25,w:6,h:3},config,-1),false);
  assert.equal(f.canPlace([],{r:5,c:5,w:6,h:3},config,-1),false,'outside room outline');
  for(const b of grid.doors.concat(grid.obstacles,grid.context))assert.equal(f.canPlace([],b,config,-1),false,b.label);
  assert.match(read('src/html/18-admin.html'),/id="fpAddOuterRun"/);
});

test('two double-row blocks separate three customer aisles from two protected vendor-only aisles',()=>{
  const {f,grid,config}=floorContext(),ballroom=config.booths.filter(b=>/^t\d+$/.test(b.id));
  const customers=grid.aisles.filter(a=>a.access==='customer'),vendors=grid.aisles.filter(a=>a.access==='vendor');
  assert.equal(customers.length,3);assert.equal(vendors.length,2);
  assert.equal(customers[0].r-grid.rooms.find(r=>r.id==='ballroom').r,grid.ballroomLayout.tableWidth);
  for(const r of [105,116,131,142])assert.equal(ballroom.filter(b=>b.r===r&&b.w===12).length,13);
  for(const [a,b,vendor]of [[105,116,vendors[0]],[131,142,vendors[1]]]){
    assert.equal(a+5,vendor.r);assert.equal(vendor.r+vendor.h,b);
  }
  assert.equal(ballroom.filter(b=>b.r===84).length,13);assert.equal(ballroom.filter(b=>b.r===159).length,16);
  for(const c of [6,191])assert.equal(ballroom.filter(b=>b.c===c&&b.w===5).length,5);
  for(const aisle of grid.aisles)assert.equal(f.canPlace([],aisle,config,-1),false);
  assert.match(f.backdrop(config.room),/CUSTOMER AISLE 3/);assert.match(f.backdrop(config.room),/VENDORS ONLY · 2/);
});

test('pointer focus does not move a table before its selection click can complete',()=>{
  const script=read('src/js/56-floorplan.js');
  assert.match(script,/map.addEventListener\('focusin',[^\n]*matches\(':focus-visible'\)/);
  assert.match(script,/details\(i\);publicView.focus/);
});

test('pre-function group shifts two table lengths left together while Top Loaded and ATM stay fixed',()=>{
  const {f,grid,config}=floorContext(),shift=-2*grid.ballroomLayout.tableWidth;
  assert.equal(shift,-24);
  assert.deepEqual(grid.doors.map(d=>d.c),[45,81,115].map(c=>c+shift));
  const originalObstacleColumns={'pillar-1':31,'pillar-2':100,'pillar-3':144,'pillar-4':184,'chair-1':150,'chair-2':186,coffee:163};
  for(const [id,c]of Object.entries(originalObstacleColumns))assert.equal(grid.obstacles.find(a=>a.id===id).c,c+shift,id);
  assert.deepEqual(grid.obstacles.find(a=>a.id==='atm'),{id:'atm',type:'atm',r:17,c:123,w:6,h:8,label:'ATM'});
  assert.deepEqual(grid.outerRuns.flat().map(b=>b.c),[39,39,58,58,63,75,75,95,95,107,107,131,131,131].map(c=>c+shift));
  assert.ok(config.booths.every((b,i)=>f.canPlace(config.booths,b,config,i)));
  for(const door of grid.doors)assert.ok(grid.clearways.some(a=>a.c===door.c&&a.w===door.w&&a.r<=door.r&&a.r+a.h>=105));
  assert.match(f.backdrop(config.room),/M215 41V49H25/);
  assert.match(f.backdrop(config.room),/x="131" y="81">CHAIRS/);
});
