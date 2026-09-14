import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function harness(id='showFloorMap',width=390){
  function node(){
    const handlers={};
    return {handlers,addEventListener(k,fn){(handlers[k]||=[]).push(fn);},
      fire(k,e={}){for(const fn of handlers[k]||[])fn(e);},
      classList:{toggle(){},add(){},remove(){},contains(){return false;}},
      getBoundingClientRect(){return {left:0,top:0};},setPointerCapture(){}};
  }
  const root=node(),map=node(),scroll=node(),props={};
  Object.assign(map,{id,dataset:{rows:212,cols:272,rowBase:64,baseGap:0},style:{setProperty(k,v){props[k]=v;}}});
  Object.assign(scroll,{clientWidth:width,clientHeight:600,scrollLeft:0,scrollTop:0});
  const c={TL:{on(){}}};vm.runInNewContext(readFileSync(new URL('../../src/js/56-floorplan.js',import.meta.url),'utf8'),c);
  const view=c.TL.floorplan.viewport(root,map,scroll);view.fit();
  function event(pointerId,x,y){return {pointerId,pointerType:'touch',clientX:x,clientY:y,preventDefault(){},target:{closest(){return null;}}};}
  return {root,map,scroll,props,view,event};
}

test('full venue fits a narrow phone; zoom buttons enlarge it and Fit floor resets',()=>{
  const h=harness('showFloorMap',280),initial=parseFloat(h.props['--fp-cell']);
  assert.ok(initial*272<=280-32+.01);
  h.root.fire('click',{target:{closest:()=>({dataset:{floorZoom:'in'}})}});
  assert.ok(parseFloat(h.props['--fp-cell'])>initial);
  h.scroll.scrollLeft=300;h.scroll.scrollTop=400;
  h.view.fit();assert.equal(h.scroll.scrollLeft,0);assert.equal(h.scroll.scrollTop,0);assert.equal(parseFloat(h.props['--fp-cell']),initial);
});

test('public touch pinch zooms, finger drag pans, and a gesture cannot select a table accidentally',()=>{
  const h=harness(),initial=parseFloat(h.props['--fp-cell']);
  h.scroll.fire('pointerdown',h.event(1,100,100));h.scroll.fire('pointerdown',h.event(2,200,100));
  h.scroll.fire('pointermove',h.event(2,300,100));
  assert.equal(parseFloat(h.props['--fp-cell']),initial*2);
  h.scroll.fire('pointerup',h.event(2,300,100));
  const left=h.scroll.scrollLeft;h.scroll.fire('pointermove',h.event(1,80,100));assert.equal(h.scroll.scrollLeft,left+20);
  h.scroll.fire('pointerup',h.event(1,80,100));
  let suppressed=false;h.scroll.fire('click',{detail:1,preventDefault(){suppressed=true;},stopPropagation(){}});assert.equal(suppressed,true);
  h.scroll.fire('pointerdown',h.event(1,90,100));h.scroll.fire('pointerup',h.event(1,90,100));
  suppressed=false;h.scroll.fire('click',{detail:1,preventDefault(){suppressed=true;},stopPropagation(){}});assert.equal(suppressed,false,'a stationary tap still selects');
  h.scroll.fire('pointerdown',h.event(1,100,100));h.scroll.fire('pointercancel',h.event(1,100,100));
  const before=parseFloat(h.props['--fp-cell']);h.scroll.fire('pointermove',h.event(1,500,100));assert.equal(parseFloat(h.props['--fp-cell']),before);
});

test('admin table editing does not receive public-map touch gestures',()=>{
  const h=harness('fpMap'),initial=parseFloat(h.props['--fp-cell']);
  h.scroll.fire('pointerdown',h.event(1,100,100));h.scroll.fire('pointerdown',h.event(2,200,100));h.scroll.fire('pointermove',h.event(2,300,100));
  assert.equal(parseFloat(h.props['--fp-cell']),initial);
});
