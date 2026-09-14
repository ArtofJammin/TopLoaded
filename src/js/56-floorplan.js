  /* Marketfloor-inspired local guide. No external event's bookings are copied. */
  TL.floorplan = (function(){
    var labels = {tcg:"TCG",sports:"Sports",mixed:"Mixed",unassigned:"Vendor to be announced",shop:"Top Loaded booth",food:"Food",entry:"Entry"};
    function venue(room){return room==='hilton-show'?window.TL_FLOOR_VENUE:null;}
    function inside(b,a){return b.r>=a.r&&b.c>=a.c&&b.r+b.h<=a.r+a.h&&b.c+b.w<=a.c+a.w;}
    function accessible(b,size){var v=venue(size.room);return !v||(size.rows===v.rows&&size.cols===v.cols&&v.rooms.some(function(a){return inside(b,a);})&&!v.clearways.some(function(a){return overlaps(b,a);}));}
    function area(b,room){var v=venue(room),a=v&&v.rooms.find(function(a){return inside(b,a);});return a?{ballroom:'Ballroom',prefunction:'Pre-function',business:'Business center'}[a.id]:'';}
    function backdrop(room){
      var v=venue(room);if(!v)return '';
      var out='<svg class="fp-venue" viewBox="0 0 '+v.cols+' '+v.rows+'" preserveAspectRatio="none" role="img" aria-label="Convention Entrance leads through the pre-function area to three ballroom doors and Top Loaded in the business center. Turfway Room is not part of the show.">';
      v.rooms.forEach(function(a){out+='<rect class="fp-room fp-room-'+a.id+'" x="'+(a.c-1)+'" y="'+(a.r-1)+'" width="'+a.w+'" height="'+a.h+'"/><text class="fp-room-label" x="'+a.labelC+'" y="'+a.labelR+'">'+esc(a.label)+'</text>';});
      out+='<text class="fp-map-title" x="7" y="10">TOP LOADED CARD SHOW</text><text class="fp-map-sub" x="7" y="17">Ballroom · Pre-function · Business center</text>';
      out+='<path class="fp-route" d="M216 62V79H17 M177 79V36 M17 79V86 M102 79V86 M188 79V86"/>';
      out+='<path class="fp-route-arrow" d="m174 40 3-4 3 4 M14 83l3 3 3-3 M99 83l3 3 3-3 M185 83l3 3 3-3 M212 75l4 4 4-4"/>';
      v.doors.forEach(function(d){out+='<rect class="fp-door" x="'+(d.c-1)+'" y="'+(d.r-1)+'" width="'+d.w+'" height="'+d.h+'"/><text class="fp-door-label" x="'+(d.c+d.w/2-1)+'" y="76" text-anchor="middle">'+esc(d.label)+'</text>';});
      out+='<rect class="fp-entry-label" x="199" y="43" width="24" height="19" rx="1"/><text class="fp-entry-text" x="211" y="48" text-anchor="middle">ENTER HERE</text><text class="fp-entry-text" x="211" y="54" text-anchor="middle">Convention</text><text class="fp-entry-text" x="211" y="59" text-anchor="middle">Entrance</text>';
      return out+'</svg>';
    }
    function stats(booths){
      var counts = {tcg:0,sports:0,mixed:0};
      (booths || []).forEach(function(b){ if(b && Object.prototype.hasOwnProperty.call(counts,b.type)) counts[b.type]++; });
      var total = counts.tcg + counts.sports + counts.mixed, pct = {}, rest = 100;
      var keys = Object.keys(counts).filter(function(k){ return counts[k]; });
      keys.forEach(function(k,i){ pct[k] = i === keys.length-1 ? rest : Math.round(counts[k]/total*100); rest -= pct[k]; });
      return {counts:counts,total:total,pct:pct};
    }
    function fits(b,size){return b.r>=1 && b.c>=1 && b.w>=1 && b.h>=1 && b.r+b.h-1<=size.rows && b.c+b.w-1<=size.cols;}
    function overlaps(a,b){return a.c<b.c+b.w && b.c<a.c+a.w && a.r<b.r+b.h && b.r<a.r+a.h;}
    function canPlace(booths,b,size,skip){return fits(b,size) && accessible(b,size) && !booths.some(function(other,i){return i!==skip && overlaps(b,other);});}
    function outerRun(booths,room){
      var v=venue(room),added=[];if(!v||booths.length+3>100)return added;
      v.outerRunColumns.some(function(c){
        var run=[{r:48,c:c,w:5,h:12},{r:60,c:c,w:5,h:12},{r:72,c:c-4,w:13,h:5}];
        if(run.every(function(b){return canPlace(booths,b,{rows:v.rows,cols:v.cols,room:room},-1);})){added=run;return true;}return false;
      });return added;
    }
    function roomMetrics(room,rows,cols){
      var hilton=room==='hilton-ballroom',show=room==='hilton-show';
      return {hilton:hilton||show,row:hilton?64*cols/rows*41/96:64,gap:hilton||show?0:6,widthFt:hilton?96:null,heightFt:hilton?41:null};
    }
    function layout(map,room,size){
      var m=roomMetrics(room,size.rows,size.cols);
      map.dataset.rows=size.rows;map.dataset.cols=size.cols;map.dataset.rowBase=m.row;map.dataset.baseGap=m.gap;
      map.classList.toggle('is-hilton',m.hilton);
      map.classList.toggle('is-show-venue',room==='hilton-show');
      map.style.gridTemplateColumns='repeat('+size.cols+', var(--fp-cell))';map.style.gridTemplateRows='repeat('+size.rows+', var(--fp-row, var(--fp-cell)))';
      return room==='hilton-show'?'Full show plan · Ballroom, pre-function and Top Loaded booth. Outlines and outer-room placements are schematic; marked walking routes stay clear.':m.hilton?'Triple Crown Ballroom · 96 × 41 ft. Each grid allocation is '+(96/size.cols).toFixed(1)+' × '+(41/size.rows).toFixed(1)+' ft. Booth placements are organizer-entered, not surveyed.':'Custom schematic · grid positions have no physical scale.';
    }
    function viewport(root,map,scroll){
      var zoom=1,drag=null,fitMode=true;
      function setZoom(z){
        var old=zoom; zoom=Math.max(.015,Math.min(2.5,z));
        var x=(scroll.scrollLeft+scroll.clientWidth/2)/old,y=(scroll.scrollTop+scroll.clientHeight/2)/old;
        map.style.setProperty('--fp-cell',(64*zoom)+'px');map.style.setProperty('--fp-row',((Number(map.dataset.rowBase)||64)*zoom)+'px');map.style.setProperty('--fp-gap',((Number(map.dataset.baseGap)||0)*zoom)+'px');
        map.classList.toggle('is-dense',zoom<.6);
        scroll.scrollLeft=x*zoom-scroll.clientWidth/2;scroll.scrollTop=y*zoom-scroll.clientHeight/2;
      }
      function fit(){
        if(!scroll.clientWidth) return;
        var cols=Number(map.dataset.cols)||10,rows=Number(map.dataset.rows)||6;
        var gap=Number(map.dataset.baseGap)||0,row=Number(map.dataset.rowBase)||64;
        setZoom(Math.min(1,(scroll.clientWidth-32)/(cols*64+(cols-1)*gap),(scroll.clientHeight-32)/(rows*row+(rows-1)*gap)));
        scroll.scrollLeft=scroll.scrollTop=0;fitMode=true;
      }
      function focus(el){
        if(!el) return;
        // A phone-sized overview is useful for orientation; selecting a table
        // brings its label into readable scale before centering it.
        var rect=el.getBoundingClientRect();
        if(rect.width>0 && rect.height>0 && (rect.width<32 || rect.height<24)){
          fitMode=false;setZoom(zoom*Math.max(32/rect.width,24/rect.height));
        }
        /* Center within this map, without scrolling the entire page. */
        var a=el.getBoundingClientRect(),b=scroll.getBoundingClientRect();
        scroll.scrollLeft+=a.left-b.left-(scroll.clientWidth-a.width)/2;
        scroll.scrollTop+=a.top-b.top-(scroll.clientHeight-a.height)/2;
      }
      root.addEventListener('click',function(e){
        var b=e.target.closest('[data-floor-zoom]');if(!b) return;
        var k=b.dataset.floorZoom;if(k==='fit') fit();else{fitMode=false;setZoom(zoom*(k==='in'?1.3:1/1.3));}
      });
      scroll.addEventListener('wheel',function(e){if(!e.ctrlKey)return;e.preventDefault();fitMode=false;setZoom(zoom*(e.deltaY<0?1.12:1/1.12));},{passive:false});
      scroll.addEventListener('pointerdown',function(e){
        if(e.pointerType==='touch'||e.button!==0||e.target.closest('.fp-cell')||map.classList.contains('is-placing'))return;
        drag={x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop,id:e.pointerId};scroll.setPointerCapture(e.pointerId);scroll.classList.add('is-panning');
      });
      scroll.addEventListener('pointermove',function(e){if(!drag||e.pointerId!==drag.id)return;scroll.scrollLeft=drag.left+drag.x-e.clientX;scroll.scrollTop=drag.top+drag.y-e.clientY;});
      function stop(){drag=null;scroll.classList.remove('is-panning');}
      scroll.addEventListener('pointerup',stop);scroll.addEventListener('pointercancel',stop);scroll.addEventListener('lostpointercapture',stop);
      // Pointer focus happens before click: zooming here moves a small table out
      // from under the pointer and cancels that click. Keyboard focus can zoom;
      // pointer selection zooms only in the click handler after selection.
      map.addEventListener('focusin',function(e){var b=e.target.closest('.fp-cell');if(b&&b.matches(':focus-visible'))focus(b);});
      if(typeof ResizeObserver!=='undefined')new ResizeObserver(function(){if(fitMode)fit();}).observe(scroll);
      return {fit:fit,focus:focus,refresh:function(){if(fitMode)fit();else setZoom(zoom);}};
    }
    var publicBooths=[],selected=-1,publicView=null;
    function match(b){var q=($('#floorSearch').value||'').trim().toLowerCase(),type=$('#floorType').value;return (!type||b.type===type)&&(!q||(b.label+' '+b.id+' '+labels[b.type]+' '+area(b,((TL.config.show||{}).floorplan||{}).room)).toLowerCase().includes(q));}
    function details(i){
      var b=publicBooths[i];selected=b?i:-1;
      $('#showFloorDetail').innerHTML=b?'<p class="eyebrow">'+esc(area(b,((TL.config.show||{}).floorplan||{}).room)+' · '+labels[b.type])+'</p><h3>'+esc(b.label)+'</h3><p>'+(b.type==='shop'?'Top Loaded’s own booth in the business center: four wall tables plus an L-shaped trade table. Not a separate vendor opening.':b.type==='unassigned'?'The vendor for this position has not been announced for this show. This is not a table availability or reservation offer.':'Find this location in the highlighted area of the map.')+'</p>':'<h3>Explore the floor</h3><p>Choose a table on the map or in the directory. Enter at the Convention Entrance—not the Turfway Room.</p>';
      $$('#showFloorGuide [data-floor-booth]').forEach(function(el){el.setAttribute('aria-pressed',String(Number(el.dataset.floorBooth)===selected));});
    }
    function filter(){
      var count=0;
      publicBooths.forEach(function(b,i){var yes=match(b);if(yes)count++;var cell=$('#showFloorMap [data-floor-booth="'+i+'"]');cell.classList.toggle('is-muted',!yes);cell.disabled=!yes;cell.setAttribute('aria-hidden',String(!yes));});
      $('#showFloorList').innerHTML=publicBooths.map(function(b,i){return match(b)?'<li><button type="button" data-floor-booth="'+i+'" aria-pressed="'+(i===selected)+'"><span class="floor-swatch t-'+b.type+'" aria-hidden="true"></span><span><b>'+esc(b.label)+'</b><small>'+labels[b.type]+' · Row '+b.r+', column '+b.c+'</small></span><span aria-hidden="true">↗</span></button></li>':'';}).join('');
      $('#floorResults').textContent=count+' of '+publicBooths.length+' locations shown'+(!count?' — try another name or category.':'.');
      if($('#floorSearch').value.trim() || $('#floorType').value){var directory=$('#showFloorList').closest('details');if(directory)directory.open=true;}
      if(selected>=0&&!match(publicBooths[selected]))details(-1);
    }
    function render(){
      var selectedId=publicBooths[selected]&&publicBooths[selected].id;
      var f = (TL.config.show || {}).floorplan || {}, rows = Number(f.rows)||6, cols = Number(f.cols)||10;
      var booths = (Array.isArray(f.booths) ? f.booths : []).filter(function(b){return b && labels[b.type] && b.r>=1 && b.c>=1 && b.w>=1 && b.h>=1 && b.r+b.h-1<=rows && b.c+b.w-1<=cols;});
      var map=$("#showFloorMap"), note=$("#showFloorNote"), mix=$("#showFloorMix"), legend=$("#showFloorLegend"), list=$("#showFloorList"), scroll=$("#showFloorScroll");
      if(!map) return;
      var guide=$('#showFloorGuide');guide.hidden=!booths.length;
      scroll.hidden = !booths.length; mix.hidden = !booths.length;
      if(!booths.length){ note.textContent="The vendor layout is not published yet. Check back for the confirmed TCG and Sports booth locations and percentages."; map.innerHTML=legend.innerHTML=list.innerHTML=mix.innerHTML="";publicBooths=[];selected=-1;return; }
      var s=stats(booths);
      var pending=booths.filter(function(b){return b.type==='unassigned';}).length;
      note.textContent=s.total?s.total+" assigned vendor booths on this plan · TCG/Sports percentages cover these assigned booths only, not the full show or floor area. Mixed vendors are separate."+(pending?' '+pending+' assignments to follow.':''):"Marketfloor table layout · vendor assignments for this show are to be announced. TCG/Sports percentages for this plan will appear as vendors are assigned. Positions are subject to organizer confirmation.";
      mix.hidden=!s.total;
      layout(map,f.room,{rows:rows,cols:cols});
      $('#floorScaleNote').textContent=f.room==='hilton-show'?'One map · all three show spaces. Table positions and walking routes are schematic and subject to organizer confirmation.':f.room==='hilton-ballroom'?'Ballroom-only table plan · Triple Crown Ballroom · 96 × 41 ft':'Organizer’s table-layout guide';
      map.innerHTML=backdrop(f.room)+booths.map(function(b,i){return '<button type="button" class="fp-cell t-'+b.type+'" data-floor-booth="'+i+'" aria-pressed="false" aria-label="'+esc(b.label+' · '+labels[b.type]+', row '+b.r+', column '+b.c)+'" title="'+esc(b.label+' · '+labels[b.type])+'" style="grid-row:'+b.r+' / span '+b.h+';grid-column:'+b.c+' / span '+b.w+'"><b>'+esc(b.label)+'</b><i>'+labels[b.type]+'</i></button>';}).join("");
      mix.innerHTML=Object.keys(s.pct).map(function(k){return '<span class="t-'+k+'" style="width:'+s.pct[k]+'%"></span>';}).join("");
      legend.innerHTML=Object.keys(labels).filter(function(k){return booths.some(function(b){return b.type===k;});}).map(function(k){return '<li><i class="t-'+k+'" aria-hidden="true"></i>'+labels[k]+(s.pct[k]!==undefined?' '+s.pct[k]+'% ('+s.counts[k]+')':'')+'</li>';}).join("");
      publicBooths=booths;details(booths.findIndex(function(b){return b.id===selectedId;}));filter();
      $$('#showFloorMap [data-floor-booth]').forEach(function(el,i){el.classList.toggle('is-vertical',booths[i].h>booths[i].w);});
      if(!publicView){
        publicView=viewport(guide,map,scroll);
        $('#floorSearch').addEventListener('input',filter);$('#floorType').addEventListener('change',filter);
        guide.addEventListener('click',function(e){var b=e.target.closest('[data-floor-booth]');if(!b)return;var i=Number(b.dataset.floorBooth);details(i);publicView.focus($('#showFloorMap [data-floor-booth="'+i+'"]'));});
      }
      publicView.refresh();
    }
    TL.on("init",render); TL.on("config:change",render);
    TL.on('view:change',function(d){if(d.name==='show'&&publicView)requestAnimationFrame(function(){publicView.refresh();});});
    return {stats:stats,render:render,viewport:viewport,fits:fits,overlaps:overlaps,canPlace:canPlace,layout:layout,roomMetrics:roomMetrics,backdrop:backdrop,area:area,venue:venue,outerRun:outerRun};
  })();
