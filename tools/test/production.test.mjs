import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validatePatch} from '../../api/src/routes/config.js';

const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
function fn(file, name) {
  const source = read(file), start = source.indexOf('  function ' + name + '(');
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

test('production metadata, browser storage and publishing target are independent of the demo', () => {
  const head = read('src/head.html');
  assert.match(head, /name="tl-site-mode" content="production"/);
  assert.match(head, /name="tl-storage-prefix" content="toploaded-production-"/);
  assert.match(head, /rel="canonical" href="https:\/\/artofjammin.github.io\/TopLoaded\/"/);
  for (const file of ['src/head.html','tools/build.mjs','api/wrangler.toml','.github/workflows/catalog.yml','.github/workflows/reviews.yml']) {
    assert.doesNotMatch(read(file), /toploaded-demo/);
  }
  assert.match(read('src/html/19-packrip.html'), /Simulation only\. No real pack is opened/);
});

test('production forms never save a local-only submission as a successful request', async () => {
  const writes = [], posts = [];
  const c = {TL:{production:true, store:{get:()=>[],set:(...x)=>writes.push(x)},
    api:{online:false,post:async(...x)=>{posts.push(x);return {id:'received',emailed:false};}}}};
  vm.runInNewContext(read('src/js/40-forms.js'), c);
  await assert.rejects(c.TL.forms.submit('signup',{name:'Test',email:'test@example.com'}), e=>e.status===503);
  assert.equal(writes.length,0); assert.equal(posts.length,0);
  c.TL.api.online=true;
  const result=await c.TL.forms.submit('signup',{name:'Test',email:'test@example.com'});
  assert.equal(result.id,'received'); assert.equal(result.local,false); assert.equal(posts.length,1);
  c.TL.api.post=async()=>{throw {status:503};};
  await assert.rejects(c.TL.forms.submit('signup',{})); assert.equal(writes.length,0);
});

test('production staff login requires the server, not a stored demo role or placeholder pin', async () => {
  const node={setAttribute(){},addEventListener(){}};
  const c={document:{documentElement:node,addEventListener(){}},window:{},$:()=>node,
    TL:{production:true,on(){},api:{online:false,base:'',role:'admin',token:null,ready:Promise.resolve(),setAuth(token,role){this.token=token;this.role=role;}}}};
  vm.runInNewContext(read('src/js/80-auth.js'),c);
  assert.equal(c.TL.auth.role(),null); assert.equal(c.TL.auth.can('admin'),false);
  await assert.rejects(c.TL.auth.login('admin'),e=>e.status===0);
  c.TL.api.online=true;c.TL.api.post=async()=>({token:'server-session',role:'staff'});
  assert.equal(await c.TL.auth.login('real-server-checked-pin'),'staff');
  assert.equal(c.TL.auth.can('staff'),true);assert.equal(c.TL.auth.can('admin'),false);
});

test('ordinary cart checkout is blocked in production even if a sandbox API advertises checkout', () => {
  const errors=[];
  const c={cartBusy:false,cartError:msg=>errors.push(msg),TL:{production:true,api:{online:true,integrations:{shopCheckout:true}}}};
  vm.runInNewContext(fn('src/js/35-cart.js','cartSquareLive')+'\n'+fn('src/js/35-cart.js','cartCheckout'),c);
  assert.equal(c.cartSquareLive(),false); c.cartCheckout();
  assert.match(errors[0],/TCGplayer/);
  assert.match(read('src/js/35-cart.js'),/class="ct-buy linklike"/);
  assert.match(read('src/html/21-cart.html'),/id="cartTcgLink"/);
});

function stream() {
  const c={URL,location:{hostname:'example.test'},document:{addEventListener(){},getElementById(){return null;}},
    TL:{production:true,on(){},config:{live:{on:true,platform:'facebook',embed:''},links:{facebook:'https://www.facebook.com/toploadedtradingcards'}},api:{online:false}}};
  vm.runInNewContext(read('src/js/50-live.js'),c);return c;
}
test('Facebook and TikTok route to native watch/chat; no simulated stream activity runs', () => {
  const c=stream();
  for(const [kind,url] of [['facebook','https://www.facebook.com/toploadedtradingcards/videos/123456789'],['tiktok','https://www.tiktok.com/@example/live']]){
    c.TL.config.live={on:true,platform:kind,embed:url};
    assert.equal(c.lvChatDestination().href,url);assert.equal(c.lvChatDestination().src,undefined);
    assert.doesNotThrow(()=>validatePatch({live:c.TL.config.live}));
  }
  c.lvChatMode('sim'); assert.equal(c.lv.chatMode,'unavailable');assert.equal(c.lvDemoMode(),false);
  c.lv.active=true;assert.equal(c.lvSimRunning(),false); c.lvRip();assert.equal(c.lv.ripped,0);
});
test('stream URLs reject lookalike hosts, credentials and scripts while retaining supported video embeds', () => {
  const c=stream();
  for(const url of ['https://facebook.com.evil.test/video','https://evil.test/?next=https://youtube.com/watch?v=abcdef12345','javascript:alert(1)','https://user:password@www.tiktok.com/@x/live','https://www.facebook.com:8443/page']){
    assert.equal(c.lvParseEmbed({embed:url}),null);
    assert.throws(()=>validatePatch({live:{embed:url}}));
  }
  assert.match(c.lvParseEmbed({embed:'https://youtu.be/abcdef12345'}).src,/youtube.com\/embed\/abcdef12345/);
  assert.match(c.lvParseEmbed({embed:'https://www.twitch.tv/shop'}).src,/parent=example.test/);
});

test('off-air production renders without an API and offers a real social link instead of notification signup', () => {
  const c=stream(), nodes=Object.fromEntries(['liveOffair','liveNext','liveCountdown','liveSub','liveNotify','notifyForm','notifyMsg'].map(id=>[id,{}]));
  c.document.getElementById=id=>nodes[id]||null;c.TL.config.live.on=false;c.TL.store={get:()=>''};c.esc=esc;
  assert.doesNotThrow(()=>c.lvRenderOffair());assert.equal(nodes.liveOffair.hidden,false);
  c.lvRenderNotify();assert.equal(nodes.notifyForm.hidden,true);assert.equal(nodes.notifyMsg.hidden,false);
  assert.match(nodes.notifyMsg.innerHTML,/facebook.com\/toploadedtradingcards/);
});

test('Home and Play Nights each render one independently keyed countdown per scheduled game', () => {
  const grids=Object.fromEntries(['playNowGrid','eventPlayGrid'].map(id=>[id,{innerHTML:'',querySelectorAll:()=>[]}])) , events={};
  const c={esc,reduceMotion:false,homeActive:false,document:{hidden:false,addEventListener(){},getElementById:id=>grids[id]||null},
    TL:{config:{events:[{game:'op',name:'Later One Piece',offset:200,fee:'$5'},{game:'op',name:'Next One Piece',offset:100,fee:'$5'},{game:'pk',name:'Pokemon League',offset:80}]},
      calendar:{nextOccurrence:ev=>({when:new Date(Date.now()+ev.offset*60000),mins:ev.offset,running:false})},on:(n,f)=>events[n]=f,gameLabel:g=>g,pad2:n=>String(n).padStart(2,'0')}};
  const source=read('src/js/20-hero.js');
  vm.runInNewContext(source.slice(source.indexOf('  var nuTimer ='),source.indexOf('  /* ---- the wall ----')),c);
  c.TL.renderPlayNights(); c.TL.renderPlayNights('eventPlayGrid');
  for(const grid of Object.values(grids)){
    assert.equal((grid.innerHTML.match(/role="timer"/g)||[]).length,2);
    assert.match(grid.innerHTML,/Next One Piece/);assert.doesNotMatch(grid.innerHTML,/Later One Piece/);
  }
  assert.match(grids.playNowGrid.innerHTML,/<a class="playnow-btn"/);
  assert.match(grids.eventPlayGrid.innerHTML,/<div class="playnow-btn"/);
  c.TL.config.events=[];events['config:change']();c.TL.renderPlayNights('eventPlayGrid');
  assert.doesNotMatch(grids.eventPlayGrid.innerHTML,/role="timer"/);
  assert.match(read('src/js/55-events.js'),/setInterval\(tickEvents, reduceMotion \? 60000 : 1000\)/);
});

test('review presentation keeps author/source attribution without editorial selection notes', () => {
  const box={innerHTML:'',insertAdjacentHTML(_pos,html){this.innerHTML+=html;}},tag={};
  const c={URL,esc,reviewStars:()=>'<span>★★★★★</span>',reviewUrl:u=>u||'',
    $:id=>id==='#testimonials'?box:tag,reviewGoogleSnapshot:null,reviewSnapshot:null,
    REVIEW_SOURCES:{google:{label:'Google review',link:()=> 'https://google.com/maps'}},
    reviewRemote:{mode:'google',items:[{quote:'Example review fixture',who:'Test reviewer',rating:5,source:'google',url:'https://google.com/maps',authorUrl:'https://google.com/maps/contrib/123'}]},TL:{config:{reviews:{source:'google',minRating:5}}}};
  vm.runInNewContext(fn('src/js/20-hero.js','renderTestimonials'),c);c.renderTestimonials();
  assert.equal(tag.hidden,true);assert.match(box.innerHTML,/Test reviewer/);assert.match(box.innerHTML,/Google Maps/);
  assert.match(box.innerHTML,/More on Google/);assert.doesNotMatch(box.innerHTML,/selected|not a live feed|not an overall rating|Review excerpt/i);
});

test('mosaic is complete, Why Top Loaded has spacing and discovery actions are separated', () => {
  assert.match(read('src/html/10-home.html'),/class="show-tile"/);
  assert.match(read('src/html/10-home.html'),/class="section why-loaded"/);
  assert.match(read('src/js/94-collector.js'),/class="discovery-actions"/);
  assert.match(read('src/css/98-collector.css'),/\.discovery-actions\{[^}]*gap:14px 24px/);
});
